import type { Context } from "koa";
import Router from "koa-router";
import { languages } from "@shared/i18n";
import { Client } from "@shared/types";
import { slugifyDomain } from "@shared/utils/domains";
import { parseEmail } from "@shared/utils/email";
import { isBase64Url } from "@shared/utils/urls";
import accountProvisioner from "@server/commands/accountProvisioner";
import {
  OIDCMalformedUserInfoError,
  AuthenticationError,
  OAuthStateMismatchError,
} from "@server/errors";
import Logger from "@server/logging/Logger";
import { AuthenticationProvider } from "@server/models";
import { createContext } from "@server/context";
import { signIn } from "@server/utils/authentication";
import fetch from "@server/utils/fetch";
import {
  StateStore,
  getTeamFromContext,
  getClientFromContext,
  parseState,
} from "@server/utils/passport";
import config from "../../plugin.json";
import env from "../env";

const PASSPORT_ALLOWED_FIELDS = new Set([
  "email",
  "nickname",
  "avatar_url",
  "preferred_language",
]);

export interface OIDCEndpoints {
  authorizationURL?: string;
  tokenURL?: string;
  userInfoURL?: string;
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
  name?: string;
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
  const requested = (
    clientAllowed.length ? clientAllowed : Array.from(PASSPORT_ALLOWED_FIELDS)
  ).filter((field) => PASSPORT_ALLOWED_FIELDS.has(field));

  for (const required of ["email", "nickname", "avatar_url"]) {
    if (!requested.includes(required)) {
      requested.push(required);
    }
  }

  return requested;
};

const requestConsent = async (stateToken?: string) => {
  const baseUrlWithApi = getPassportApiBaseUrl();
  const passportClient = getPassportClient();

  if (!baseUrlWithApi || !env.PASSPORT_API_TOKEN || !passportClient) {
    throw AuthenticationError(
      "Passport consent configuration is missing (PASSPORT_API_BASE_URL, PASSPORT_API_TOKEN, OIDC_CLIENT_ID, URL)"
    );
  }

  const consentRequestUrl = `${baseUrlWithApi}/services/consent/request`;
  const headers = {
    "X-API-Token": env.PASSPORT_API_TOKEN,
    Accept: "application/json",
    "Content-Type": "application/json",
  };

  const requestRes = await fetch(consentRequestUrl, {
    method: "POST",
    allowPrivateIPAddress: true,
    headers,
    body: JSON.stringify({
      client_id: passportClient.client_id,
      redirect_uri: passportClient.redirect_uris?.[0],
      fields: buildRequestedFields(passportClient),
      state: stateToken,
    }),
  });

  if (!requestRes.ok) {
    Logger.error(
      "Passport consent request failed",
      new Error("Consent request failed"),
      {
        status: requestRes.status,
        body: await requestRes.text().catch(() => undefined),
      }
    );
    throw AuthenticationError("Failed to initiate Passport consent flow");
  }

  const requestData = (await requestRes.json()) as {
    request_id: string;
    consent_url?: string;
  };

  if (!requestData?.request_id || !requestData.consent_url) {
    throw AuthenticationError(
      "Passport consent request did not return request_id/consent_url"
    );
  }

  return requestData;
};

const exchangeConsentCode = async (code: string) => {
  const baseUrlWithApi = getPassportApiBaseUrl();
  const passportClient = getPassportClient();

  if (!baseUrlWithApi || !env.PASSPORT_API_TOKEN || !passportClient) {
    throw AuthenticationError(
      "Passport consent configuration is missing (PASSPORT_API_BASE_URL, PASSPORT_API_TOKEN, OIDC_CLIENT_ID, URL)"
    );
  }

  const consentTokenUrl = `${baseUrlWithApi}/services/consent/token`;
  const headers = {
    "X-API-Token": env.PASSPORT_API_TOKEN,
    Accept: "application/json",
    "Content-Type": "application/json",
  };

  const tokenRes = await fetch(consentTokenUrl, {
    method: "POST",
    allowPrivateIPAddress: true,
    headers,
    body: JSON.stringify({
      code,
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
    throw AuthenticationError(
      "Passport consent token did not return user data"
    );
  }

  return tokenData.user;
};

/**
 * Creates OIDC routes and mounts them into the provided router
 */
export function createOIDCRouter(
  router: Router,
  endpoints: OIDCEndpoints
): void {
  const scopes = env.OIDC_SCOPES.split(" ");
  const stateStore = new StateStore(endpoints.pkce);

  router.get(config.id, async (ctx: Context) => {
    try {
      let stateToken: string | undefined;
      await new Promise<void>((resolve, reject) => {
        stateStore.store(ctx, (err, token) => {
          if (err || !token) {
            return reject(err ?? new Error("Failed to store state"));
          }
          stateToken = token;
          return resolve();
        });
      });

      const consent = await requestConsent(stateToken);
      return ctx.redirect(consent.consent_url);
    } catch (err) {
      Logger.error("Error initiating Passport consent flow", err as Error);
      throw AuthenticationError("Failed to start authentication");
    }
  });

  const handleCallback = async (ctx: Context) => {
    const requestBody =
      ctx.request.body && typeof ctx.request.body === "object"
        ? (ctx.request.body as Record<string, unknown>)
        : undefined;
    const getParam = (
      key: string
    ): string | string[] | number | undefined => {
      const queryValue = ctx.query[key];
      if (queryValue !== undefined) {
        return queryValue;
      }
      const bodyValue = requestBody?.[key];
      if (
        typeof bodyValue === "string" ||
        typeof bodyValue === "number" ||
        Array.isArray(bodyValue)
      ) {
        return bodyValue as string | string[] | number;
      }
      return undefined;
    };

    const code = getParam("code")?.toString();
    const state = getParam("state")?.toString();
    const stateCookie = ctx.cookies.get(stateStore.key);
    const parsedState = stateCookie ? parseState(stateCookie) : undefined;

    try {
      if (!code) {
        throw AuthenticationError("Missing consent code");
      }

      await new Promise<void>((resolve, reject) => {
        stateStore.verify(ctx, state ?? "", (err) => {
          if (err) {
            return reject(err);
          }
          resolve();
        });
      });

      const passportProfile = await exchangeConsentCode(code);
      const email = passportProfile.email;

      if (!email) {
        throw AuthenticationError(
          `An email field was not returned from Passport consent, but is required.`
        );
      }

      const team = await getTeamFromContext(ctx);
      const client =
        parsedState?.client === Client.Desktop
          ? Client.Desktop
          : getClientFromContext(ctx);
      const { domain } = parseEmail(email);

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

      const providerId =
        authenticationProvider?.providerId ??
        slugifyDomain(domain) ??
        domain ??
        config.id;

      if (!domain) {
        throw OIDCMalformedUserInfoError();
      }

      const subdomain = slugifyDomain(domain);

      const profileDebugInfo = {
        email,
        passportProfile,
      };

      const failWithPassportProfileError = (message: string) => {
        const error = AuthenticationError(message);
        Logger.error(message, error, profileDebugInfo);
        throw error;
      };

      const name = passportProfile.nickname;
      if (!name) {
        failWithPassportProfileError(
          `Passport profile for ${email} is missing a name.`
        );
      }

      let avatarUrl = passportProfile.avatar_url ?? null;
      if (avatarUrl && isBase64Url(avatarUrl)) {
        failWithPassportProfileError(
          `Passport avatar for ${email} is invalid.`
        );
      }

      const ctxWithIp = createContext({ ip: ctx.ip });
      const result = await accountProvisioner(ctxWithIp, {
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
          providerId:
            passportProfile.id ??
            passportProfile.logto_id ??
            passportProfile.email,
          accessToken: code,
          refreshToken: undefined,
          expiresIn: undefined,
          scopes,
        },
      });

      await signIn(ctx, config.id, { ...result, client });
    } catch (err) {
      Logger.error("Error completing Passport consent flow", err as Error);

      if (err && typeof err === "object" && "id" in err) {
        const notice = String((err as { id: string }).id).replace(/_/g, "-");
        const redirectPath =
          "redirectPath" in err && (err as { redirectPath?: string }).redirectPath
            ? (err as { redirectPath?: string }).redirectPath!
            : "/";
        const hasQueryString = redirectPath.includes("?");
        const reqProtocol =
          parsedState?.client === Client.Desktop ? "outline" : ctx.protocol;
        const requestHost =
          err instanceof OAuthStateMismatchError
            ? ctx.hostname
            : parsedState?.host ?? ctx.hostname;
        const url = new URL(
          env.isCloudHosted
            ? `${reqProtocol}://${requestHost}${redirectPath}`
            : `${env.URL}${redirectPath}`
        );

        ctx.redirect(
          `${url.toString()}${hasQueryString ? "&" : "?"}notice=${notice}`
        );
        return;
      }

      if (env.isDevelopment) {
        throw err;
      }

      ctx.redirect(`/?notice=auth-error`);
    }
  };

  router.get(`${config.id}.callback`, handleCallback);
  router.post(`${config.id}.callback`, handleCallback);
}
