import passport from "@outlinewiki/koa-passport";
import JWT from "jsonwebtoken";
import type { Context } from "koa";
import Router from "koa-router";
import get from "lodash/get";
import { slugifyDomain } from "@shared/utils/domains";
import { parseEmail } from "@shared/utils/email";
import { isBase64Url } from "@shared/utils/urls";
import accountProvisioner from "@server/commands/accountProvisioner";
import {
  OIDCMalformedUserInfoError,
  AuthenticationError,
} from "@server/errors";
import Logger from "@server/logging/Logger";
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

async function fetchPassportProfile(email: string) {
  if (!env.PASSPORT_API_BASE_URL || !env.PASSPORT_API_TOKEN) {
    return null;
  }

  const baseUrl = env.PASSPORT_API_BASE_URL.replace(/\/$/, "");
  const url = `${baseUrl}/services/profile-by-email?email=${encodeURIComponent(email)}`;

  try {
    const response = await fetch(url, {
      method: "GET",
      allowPrivateIPAddress: true,
      headers: {
        "X-API-Token": env.PASSPORT_API_TOKEN,
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      Logger.warn("Passport profile lookup failed", {
        email,
        status: response.status,
      });
      return null;
    }

    const data = (await response.json()) as {
      found?: boolean;
      profile?: PassportProfile | null;
    };

    if (data?.found && data.profile) {
      return data.profile;
    }

    Logger.debug("authentication", "Passport profile not found", { email });
    return null;
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    Logger.error("Failed to fetch Passport profile", error, { email });
    return null;
  }
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

          const email = profile.email ?? token.email ?? null;

          if (!email) {
            throw AuthenticationError(
              `An email field was not returned in the profile or id_token parameter, but is required.`
            );
          }

          const passportProfile = await fetchPassportProfile(email);

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

          // Only accept avatar returned by Passport. Reject invalid formats.
          const avatarUrl = passportProfile.avatar_url;
          if (!avatarUrl) {
            failWithPassportProfileError(
              `Passport profile for ${email} is missing an avatar.`
            );
          }

          if (isBase64Url(avatarUrl)) {
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
            },
            user: {
              name,
              email,
              avatarUrl,
              language: passportProfile?.preferred_language ?? undefined,
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
