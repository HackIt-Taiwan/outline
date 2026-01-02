import crypto from "crypto";
import type { Context } from "koa";
import Router from "koa-router";
import get from "lodash/get";
import jwt from "jsonwebtoken";
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

export interface OIDCEndpoints {
  authorizationURL?: string;
  tokenURL?: string;
  userInfoURL?: string;
  logoutURL?: string;
  pkce?: boolean;
}

type OIDCTokenResponse = {
  access_token?: string;
  refresh_token?: string;
  token_type?: string;
  expires_in?: number;
  scope?: string;
  id_token?: string;
};

type OIDCClaims = Record<string, unknown>;

const normalizeLanguage = (language?: string | null) => {
  if (!language) {
    return undefined;
  }

  const normalized = language.replace("-", "_");
  return languages.includes(normalized as (typeof languages)[number])
    ? normalized
    : undefined;
};

const parseString = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim() ? value : undefined;

const parseNumber = (value: unknown): number | undefined => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
};

const toBase64Url = (data: Buffer) =>
  data
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");

const generateCodeVerifier = () => toBase64Url(crypto.randomBytes(32));

const generateCodeChallenge = (verifier: string) =>
  toBase64Url(crypto.createHash("sha256").update(verifier).digest());

const decodeIdToken = (raw?: string): OIDCClaims | undefined => {
  if (!raw) {
    return undefined;
  }

  const decoded = jwt.decode(raw);
  if (!decoded || typeof decoded === "string") {
    return undefined;
  }
  return decoded as OIDCClaims;
};

const exchangeAuthorizationCode = async ({
  code,
  redirectUri,
  codeVerifier,
  tokenURL,
}: {
  code: string;
  redirectUri: string;
  codeVerifier?: string;
  tokenURL: string;
}): Promise<{
  accessToken: string;
  refreshToken?: string;
  expiresIn?: number;
  scope?: string;
  idToken?: string;
}> => {
  if (!env.OIDC_CLIENT_ID || !env.OIDC_CLIENT_SECRET) {
    throw AuthenticationError("OIDC client credentials are missing");
  }

  const headers: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/x-www-form-urlencoded",
    Authorization: `Basic ${Buffer.from(
      `${env.OIDC_CLIENT_ID}:${env.OIDC_CLIENT_SECRET}`
    ).toString("base64")}`,
  };

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
    client_id: env.OIDC_CLIENT_ID,
  });

  if (codeVerifier) {
    body.set("code_verifier", codeVerifier);
  }

  const response = await fetch(tokenURL, {
    method: "POST",
    allowPrivateIPAddress: true,
    headers,
    body,
  });

  if (!response.ok) {
    Logger.error("OIDC token exchange failed", new Error("Token exchange"), {
      status: response.status,
      body: await response.text().catch(() => undefined),
    });
    throw AuthenticationError("Failed to exchange OIDC authorization code");
  }

  const data = (await response.json()) as OIDCTokenResponse;
  const accessToken = parseString(data?.access_token);
  if (!accessToken) {
    throw AuthenticationError("OIDC token response is missing access_token");
  }

  return {
    accessToken,
    refreshToken: parseString(data?.refresh_token),
    expiresIn: parseNumber(data?.expires_in),
    scope: parseString(data?.scope),
    idToken: parseString(data?.id_token),
  };
};

const fetchOIDCUserInfo = async ({
  accessToken,
  userInfoURL,
}: {
  accessToken: string;
  userInfoURL: string;
}): Promise<OIDCClaims> => {
  const response = await fetch(userInfoURL, {
    method: "GET",
    allowPrivateIPAddress: true,
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    Logger.error("OIDC userinfo request failed", new Error("UserInfo"), {
      status: response.status,
      body: await response.text().catch(() => undefined),
    });
    throw AuthenticationError("Failed to fetch OIDC user info");
  }

  return (await response.json()) as OIDCClaims;
};

const dedupeScopes = (input: string[]) => {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const scope of input) {
    if (!scope) {
      continue;
    }
    if (seen.has(scope)) {
      continue;
    }
    seen.add(scope);
    output.push(scope);
  }
  return output;
};

/**
 * Creates OIDC routes and mounts them into the provided router
 */
export function createOIDCRouter(
  router: Router,
  endpoints: OIDCEndpoints
): void {
  if (
    !endpoints.authorizationURL ||
    !endpoints.tokenURL ||
    !endpoints.userInfoURL
  ) {
    throw new Error("OIDC endpoints are not configured");
  }

  const scopes = dedupeScopes(
    env.OIDC_SCOPES.split(" ").map((scope) => scope.trim())
  );
  if (!scopes.includes("openid")) {
    scopes.unshift("openid");
  }

  const redirectUri = `${env.URL}/auth/${config.id}.callback`;
  const stateStore = new StateStore(endpoints.pkce);
  const pkceEnabled = !!endpoints.pkce;

  router.get(config.id, async (ctx: Context) => {
    try {
      let stateToken: string | undefined;
      let codeVerifier: string | undefined;

      await new Promise<void>((resolve, reject) => {
        const callback = (err: Error | null, token?: string) => {
          if (err || !token) {
            return reject(err ?? new Error("Failed to store state"));
          }
          stateToken = token;
          return resolve();
        };

        if (pkceEnabled) {
          codeVerifier = generateCodeVerifier();
          // @ts-expect-error types from passport-oauth2 are not aligned with our custom store.
          stateStore.store(ctx, codeVerifier, undefined, undefined, callback);
          return;
        }

        // @ts-expect-error types from passport-oauth2 are not aligned with our custom store.
        stateStore.store(ctx, callback);
      });

      const authorizationUrl = new URL(endpoints.authorizationURL!);
      authorizationUrl.searchParams.set("response_type", "code");
      authorizationUrl.searchParams.set("client_id", env.OIDC_CLIENT_ID ?? "");
      authorizationUrl.searchParams.set("redirect_uri", redirectUri);
      authorizationUrl.searchParams.set("scope", scopes.join(" "));
      authorizationUrl.searchParams.set("state", stateToken ?? "");

      if (pkceEnabled && codeVerifier) {
        authorizationUrl.searchParams.set(
          "code_challenge",
          generateCodeChallenge(codeVerifier)
        );
        authorizationUrl.searchParams.set("code_challenge_method", "S256");
      }

      return ctx.redirect(authorizationUrl.toString());
    } catch (err) {
      Logger.error("Error initiating OIDC authentication flow", err as Error);
      throw AuthenticationError("Failed to start authentication");
    }
  });

  const handleCallback = async (ctx: Context) => {
    const requestBody =
      ctx.request.body && typeof ctx.request.body === "object"
        ? (ctx.request.body as Record<string, unknown>)
        : undefined;
    const getParam = (key: string): string | string[] | number | undefined => {
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
    const error = getParam("error")?.toString();
    const errorDescription = getParam("error_description")?.toString();
    const stateCookie = ctx.cookies.get(stateStore.key);
    const parsedState = stateCookie ? parseState(stateCookie) : undefined;

    try {
      if (error) {
        throw AuthenticationError(
          `OIDC error: ${error}${errorDescription ? ` (${errorDescription})` : ""}`
        );
      }

      if (!code) {
        throw AuthenticationError("Missing authorization code");
      }

      await new Promise<void>((resolve, reject) => {
        stateStore.verify(ctx, state ?? "", (err) => {
          if (err) {
            return reject(err);
          }
          resolve();
        });
      });

      const { accessToken, refreshToken, expiresIn, scope, idToken } =
        await exchangeAuthorizationCode({
          code,
          redirectUri,
          codeVerifier: parsedState?.codeVerifier,
          tokenURL: endpoints.tokenURL!,
        });

      const userInfo = await fetchOIDCUserInfo({
        accessToken,
        userInfoURL: endpoints.userInfoURL!,
      });
      const idTokenClaims = decodeIdToken(idToken);

      const email =
        parseString(userInfo?.email) ?? parseString(idTokenClaims?.email);

      if (!email) {
        throw AuthenticationError(
          "An email field was not returned from OIDC userinfo, but is required."
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
        userInfo,
      };

      const failWithProfileError = (message: string) => {
        const error = AuthenticationError(message);
        Logger.error(message, error, profileDebugInfo);
        throw error;
      };

      const usernameClaim = env.OIDC_USERNAME_CLAIM || "preferred_username";
      const name =
        parseString(get(userInfo, usernameClaim)) ??
        parseString(get(idTokenClaims, usernameClaim)) ??
        parseString(userInfo?.name) ??
        parseString(userInfo?.preferred_username) ??
        parseString(userInfo?.nickname);
      if (!name) {
        failWithProfileError(
          `OIDC profile for ${email} is missing a name (${usernameClaim}).`
        );
      }

      let avatarUrl =
        parseString(userInfo?.picture) ??
        parseString(userInfo?.avatar_url) ??
        parseString(idTokenClaims?.picture) ??
        null;
      if (avatarUrl && isBase64Url(avatarUrl)) {
        failWithProfileError(`OIDC avatar for ${email} is invalid.`);
      }

      const ctxWithIp = createContext({ ip: ctx.ip });
      const authProviderId =
        parseString(userInfo?.sub) ?? parseString(idTokenClaims?.sub) ?? email;

      const tokenScopes = dedupeScopes(
        (scope ? scope.split(" ") : scopes).map((s) => s.trim())
      );
      if (!tokenScopes.includes("openid")) {
        tokenScopes.unshift("openid");
      }

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
          language: normalizeLanguage(
            parseString(userInfo?.locale) ?? parseString(idTokenClaims?.locale)
          ),
        },
        authenticationProvider: {
          name: config.id,
          providerId,
        },
        authentication: {
          providerId: authProviderId,
          accessToken,
          refreshToken,
          expiresIn,
          scopes: tokenScopes,
        },
      });

      await signIn(ctx, config.id, { ...result, client });
    } catch (err) {
      Logger.error("Error completing OIDC authentication flow", err as Error);

      if (err && typeof err === "object" && "id" in err) {
        const notice = String((err as { id: string }).id).replace(/_/g, "-");
        const redirectPath =
          "redirectPath" in err &&
          (err as { redirectPath?: string }).redirectPath
            ? (err as { redirectPath?: string }).redirectPath!
            : "/";
        const hasQueryString = redirectPath.includes("?");
        const reqProtocol =
          parsedState?.client === Client.Desktop ? "outline" : ctx.protocol;
        const requestHost =
          err instanceof OAuthStateMismatchError
            ? ctx.hostname
            : (parsedState?.host ?? ctx.hostname);
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
