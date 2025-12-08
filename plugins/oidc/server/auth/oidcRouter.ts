import passport from "@outlinewiki/koa-passport";
import JWT from "jsonwebtoken";
import type { Context } from "koa";
import Router from "koa-router";
import get from "lodash/get";
import { slugifyDomain } from "@shared/utils/domains";
import { parseEmail } from "@shared/utils/email";
import { isBase64Url } from "@shared/utils/urls";
import { languages } from "@shared/i18n";
import accountProvisioner from "@server/commands/accountProvisioner";
import {
  OIDCMalformedUserInfoError,
  AuthenticationError,
} from "@server/errors";
import Logger from "@server/logging/Logger";
import UploadUserAvatarTask from "@server/queues/tasks/UploadUserAvatarTask";
import passportMiddleware from "@server/middlewares/passport";
import { AuthenticationProvider, User } from "@server/models";
import { AuthenticationResult } from "@server/types";
import fetch from "@server/utils/fetch";
import {
  StateStore,
  getTeamFromContext,
  getClientFromContext,
  request,
} from "@server/utils/passport";
import config from "../../plugin.json";
import env from "../env";
import { OIDCStrategy } from "./OIDCStrategy";
import { createContext } from "@server/context";

const PASSPORT_ALLOWED_FIELDS = new Set([
  "email",
  "nickname",
  "avatar_url",
  "preferred_language",
]);

export interface OIDCEndpoints {
  authorizationURL: string;
  tokenURL: string;
  userInfoURL: string;
  logoutURL?: string;
  pkce?: boolean;
}

type PassportProfile = {
  id: string;
  logto_id?: string;
  email: string;
  nickname?: string;
  avatar_url?: string | null;
  preferred_language?: string | null;
};

type PassportConsentClient = {
  client_id: string;
  name: string;
  redirect_uris: string[];
  allowed_fields?: string[];
};

const normalizeLanguage = (language?: string | null) => {
  if (!language) {
    return undefined;
  }

  const normalized = language.replace("-", "_");
  return languages.includes(normalized as (typeof languages)[number])
    ? normalized
    : undefined;
};

const getPassportApiBaseUrl = () => {
  const baseUrl = env.PASSPORT_API_BASE_URL?.replace(/\/+$/, "");
  if (!baseUrl) {
    return null;
  }
  return /\/api$/i.test(baseUrl) ? baseUrl : `${baseUrl}/api`;
};

const getPassportClient = (): PassportConsentClient | null => {
  if (env.OIDC_CLIENT_ID && env.URL) {
    return {
      client_id: env.OIDC_CLIENT_ID,
      name: config.id,
      redirect_uris: [`${env.URL}/auth/${config.id}.callback`],
      allowed_fields: Array.from(PASSPORT_ALLOWED_FIELDS),
    };
  }

  return null;
};

const buildRequestedFields = (client?: PassportConsentClient) => {
  const clientAllowed = client?.allowed_fields ?? [];
  const requested = (clientAllowed.length
    ? clientAllowed
    : Array.from(PASSPORT_ALLOWED_FIELDS)
  ).filter((field) => PASSPORT_ALLOWED_FIELDS.has(field));

  for (const required of ["email", "nickname", "avatar_url"]) {
    if (!requested.includes(required)) {
      requested.push(required);
    }
  }

  return requested;
};

async function fetchPassportProfile(accessToken: string) {
  const baseUrlWithApi = getPassportApiBaseUrl();
  const passportClient = getPassportClient();

  if (!baseUrlWithApi || !env.PASSPORT_API_TOKEN || !passportClient) {
    throw AuthenticationError(
      "Passport consent configuration is missing (PASSPORT_API_BASE_URL, PASSPORT_API_TOKEN, OIDC_CLIENT_ID, URL)"
    );
  }

  const requestBody = {
    client_id: passportClient.client_id,
    redirect_uri: passportClient.redirect_uris?.[0],
    fields: buildRequestedFields(passportClient),
  };

  const consentRequestUrl = `${baseUrlWithApi}/services/consent/request`;
  const consentDecisionUrl = `${consentRequestUrl}/`;
  const consentTokenUrl = `${baseUrlWithApi}/services/consent/token`;

  const headers = {
    "X-API-Token": env.PASSPORT_API_TOKEN,
    Accept: "application/json",
    "Content-Type": "application/json",
  };

  const requestRes = await fetch(consentRequestUrl, {
    method: "POST",
    allowPrivateIPAddress: true,
    headers,
    body: JSON.stringify(requestBody),
  });

  if (!requestRes.ok) {
    Logger.error("Passport consent request failed", new Error("Consent request failed"), {
      status: requestRes.status,
      body: await requestRes.text().catch(() => undefined),
    });
    throw AuthenticationError("Failed to initiate Passport consent flow");
  }

  const requestData = (await requestRes.json()) as {
    request_id: string;
    consent_url?: string;
  };

  if (!requestData?.request_id) {
    throw AuthenticationError("Passport consent request did not return a request_id");
  }

  const decisionRes = await fetch(
    `${consentDecisionUrl}${encodeURIComponent(requestData.request_id)}/decision`,
    {
      method: "POST",
      allowPrivateIPAddress: true,
      headers: {
        ...headers,
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ decision: "approve" }),
    }
  );

  if (!decisionRes.ok) {
    Logger.error(
      "Passport consent decision failed",
      new Error("Consent decision failed"),
      {
        status: decisionRes.status,
        body: await decisionRes.text().catch(() => undefined),
      }
    );
    throw AuthenticationError("Failed to approve Passport consent");
  }

  const decisionData = (await decisionRes.json()) as { code?: string };
  if (!decisionData?.code) {
    throw AuthenticationError("Passport consent approval did not return a code");
  }

  const tokenRes = await fetch(consentTokenUrl, {
    method: "POST",
    allowPrivateIPAddress: true,
    headers,
    body: JSON.stringify({
      code: decisionData.code,
      client_id: passportClient.client_id,
    }),
  });

  if (!tokenRes.ok) {
    Logger.error(
      "Passport consent token exchange failed",
      new Error("Consent token exchange failed"),
      {
        status: tokenRes.status,
        body: await tokenRes.text().catch(() => undefined),
      }
    );
    throw AuthenticationError("Failed to exchange Passport consent token");
  }

  const tokenData = (await tokenRes.json()) as { user?: PassportProfile };
  if (!tokenData?.user) {
    throw AuthenticationError("Passport consent token did not return user data");
  }

  return tokenData.user;
}

/**
 * Creates OIDC routes and mounts them into the provided router
 */
export function createOIDCRouter(
  router: Router,
  endpoints: OIDCEndpoints
): void {
  const scopes = env.OIDC_SCOPES.split(" ");

  passport.use(
    config.id,
    new OIDCStrategy(
      {
        authorizationURL: endpoints.authorizationURL,
        tokenURL: endpoints.tokenURL,
        clientID: env.OIDC_CLIENT_ID!,
        clientSecret: env.OIDC_CLIENT_SECRET!,
        callbackURL: `${env.URL}/auth/${config.id}.callback`,
        passReqToCallback: true,
        scope: env.OIDC_SCOPES,
        // @ts-expect-error custom state store
        store: new StateStore(endpoints.pkce),
        state: true,
        pkce: endpoints.pkce ?? false,
      },
      // OpenID Connect standard profile claims can be found in the official
      // specification.
      // https://openid.net/specs/openid-connect-core-1_0.html#StandardClaims
      // Non-standard claims may be configured by individual identity providers.
      // Any claim supplied in response to the userinfo request will be
      // available on the `profile` parameter
      async function (
        context: Context,
        accessToken: string,
        refreshToken: string,
        params: { expires_in: number; id_token: string },
        _profile: unknown,
        done: (
          err: Error | null,
          user: User | null,
          result?: AuthenticationResult
        ) => void
      ) {
        try {
          // Some providers require a POST request to the userinfo endpoint, add them as exceptions here.
          const usePostMethod = [
            "https://api.dropboxapi.com/2/openid/userinfo",
          ];

          const profile = await request(
            usePostMethod.includes(endpoints.userInfoURL) ? "POST" : "GET",
            endpoints.userInfoURL,
            accessToken
          );

          // Some providers, namely ADFS, don't provide anything more than the `sub` claim in the userinfo endpoint
          // So, we'll decode the params.id_token and see if that contains what we need.
          const token = (() => {
            try {
              const decoded = JWT.decode(params.id_token);

              if (!decoded || typeof decoded !== "object") {
                Logger.warn("Decoded id_token is not a valid object");
                return {};
              }

              return decoded as {
                email?: string;
                preferred_username?: string;
                sub?: string;
              };
            } catch (err) {
              Logger.error("id_token decode threw error: ", err);
              return {};
            }
          })();

          const passportProfile = await fetchPassportProfile(accessToken);
          const email = passportProfile.email ?? profile.email ?? token.email ?? null;

          if (!email) {
            throw AuthenticationError(
              `An email field was not returned from Passport consent, profile, or id_token, but is required.`
            );
          }

          const team = await getTeamFromContext(context);
          const client = getClientFromContext(context);
          const { domain } = parseEmail(email);

          // Only a single OIDC provider is supported – find the existing, if any.
          const authenticationProvider = team
            ? ((await AuthenticationProvider.findOne({
                where: {
                  name: "oidc",
                  teamId: team.id,
                  providerId: domain,
                },
              })) ??
              (await AuthenticationProvider.findOne({
                where: {
                  name: "oidc",
                  teamId: team.id,
                },
              })))
            : undefined;

          // Derive a providerId from the OIDC location if there is no existing provider.
          const oidcURL = new URL(endpoints.authorizationURL);
          const providerId =
            authenticationProvider?.providerId ?? oidcURL.hostname;

          if (!domain) {
            throw OIDCMalformedUserInfoError();
          }

          // remove the TLD and form a subdomain from the remaining
          const subdomain = slugifyDomain(domain);

          const profileDebugInfo = {
            email,
            passportProfile,
            oidcProfile: {
              id: profile.sub ?? profile.id,
              name: profile.name,
              nickname: profile.nickname,
              username: profile.username,
              preferred_username: get(profile, env.OIDC_USERNAME_CLAIM),
              picture: profile.picture,
            },
            tokenClaims: {
              email: token.email,
              preferred_username: get(token, env.OIDC_USERNAME_CLAIM),
            },
          };

          const failWithPassportProfileError = (message: string) => {
            const error = AuthenticationError(message);
            Logger.error(message, error, profileDebugInfo);
            throw error;
          };

          if (!passportProfile) {
            failWithPassportProfileError(
              `Passport profile was not returned for ${email}.`
            );
          }

          const name = passportProfile.nickname;
          if (!name) {
            failWithPassportProfileError(
              `Passport profile for ${email} is missing a name.`
            );
          }
          const profileId = profile.sub ? profile.sub : profile.id;
          if (!profileId) {
            throw AuthenticationError(
              `A user id was not returned in the profile loaded from ${endpoints.userInfoURL}, searched in "sub" and "id" fields.`
            );
          }

          // Only accept avatar returned by Passport. Reject invalid formats,
          // but allow falling back to the default avatar if none is provided.
          let avatarUrl = passportProfile.avatar_url ?? null;
          if (avatarUrl && isBase64Url(avatarUrl)) {
            failWithPassportProfileError(
              `Passport avatar for ${email} is invalid.`
            );
          }

          const ctx = createContext({ ip: context.ip });
          const result = await accountProvisioner(ctx, {
            team: {
              teamId: team?.id,
              name: env.APP_NAME,
              domain,
              subdomain,
              avatarUrl,
            },
            user: {
              name,
              email,
              avatarUrl,
              language: normalizeLanguage(passportProfile?.preferred_language),
            },
            authenticationProvider: {
              name: config.id,
              providerId,
            },
            authentication: {
              providerId: profileId,
              accessToken,
              refreshToken,
              expiresIn: params.expires_in,
              scopes,
            },
          });

          if (avatarUrl && !result.isNewUser) {
            await new UploadUserAvatarTask().schedule({
              userId: result.user.id,
              avatarUrl,
            });
          }

          return done(null, result.user, { ...result, client });
        } catch (err) {
          return done(err, null);
        }
      }
    )
  );

  router.get(config.id, passport.authenticate(config.id));
  router.get(`${config.id}.callback`, passportMiddleware(config.id));
  router.post(`${config.id}.callback`, passportMiddleware(config.id));
}
