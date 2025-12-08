import { IsBoolean, IsOptional, IsUrl, MaxLength } from "class-validator";
import { Environment } from "@server/env";
import { Public } from "@server/utils/decorators/Public";
import environment from "@server/utils/environment";
import { CannotUseWithout } from "@server/utils/validators";

class OIDCPluginEnvironment extends Environment {
  /**
   * OIDC client credentials. To enable authentication with any
   * compatible provider.
   */
  @IsOptional()
  @CannotUseWithout("OIDC_CLIENT_SECRET")
  public OIDC_CLIENT_ID = this.toOptionalString(environment.OIDC_CLIENT_ID);

  @IsOptional()
  @CannotUseWithout("OIDC_CLIENT_ID")
  public OIDC_CLIENT_SECRET = this.toOptionalString(
    environment.OIDC_CLIENT_SECRET
  );

  /**
   * The OIDC issuer URL for automatic discovery of endpoints via the
   * well-known configuration endpoint. When provided, the authorization,
   * token, and userinfo endpoints will be automatically discovered.
   */
  @IsOptional()
  @IsUrl({
    require_tld: false,
    allow_underscores: true,
  })
  public OIDC_ISSUER_URL = this.toOptionalString(environment.OIDC_ISSUER_URL);

  /**
   * The name of the OIDC provider, eg "GitLab" – this will be displayed on the
   * sign-in button and other places in the UI. The default value is:
   * "OpenID Connect".
   */
  @MaxLength(50)
  public OIDC_DISPLAY_NAME = environment.OIDC_DISPLAY_NAME ?? "OpenID Connect";

  /**
   * The OIDC authorization endpoint.
   */
  @IsOptional()
  @IsUrl({
    require_tld: false,
    allow_underscores: true,
  })
  public OIDC_AUTH_URI = this.toOptionalString(environment.OIDC_AUTH_URI);

  /**
   * The OIDC token endpoint.
   */
  @IsOptional()
  @IsUrl({
    require_tld: false,
    allow_underscores: true,
  })
  public OIDC_TOKEN_URI = this.toOptionalString(environment.OIDC_TOKEN_URI);

  /**
   * The OIDC userinfo endpoint.
   */
  @IsOptional()
  @IsUrl({
    require_tld: false,
    allow_underscores: true,
  })
  public OIDC_USERINFO_URI = this.toOptionalString(
    environment.OIDC_USERINFO_URI
  );

  /**
   * The OIDC profile field to use as the username. The default value is
   * "preferred_username".
   */
  public OIDC_USERNAME_CLAIM =
    environment.OIDC_USERNAME_CLAIM ?? "preferred_username";

  /**
   * A space separated list of OIDC scopes to request. Defaults to "openid
   * profile email".
   */
  public OIDC_SCOPES = environment.OIDC_SCOPES ?? "openid profile email";

  /**
   * Disable autoredirect to the OIDC login page if there is only one
   * authentication method and that method is OIDC.
   */
  @Public
  @IsOptional()
  @IsBoolean()
  public OIDC_DISABLE_REDIRECT = this.toOptionalBoolean(
    environment.OIDC_DISABLE_REDIRECT
  );

  /**
   * The OIDC logout endpoint.
   */
  @Public
  @IsOptional()
  @IsUrl({
    require_tld: false,
    allow_underscores: true,
  })
  public OIDC_LOGOUT_URI = this.toOptionalString(environment.OIDC_LOGOUT_URI);

  /**
   * Base URL for Passport API (should include the /api prefix).
   * Used to enrich profile data after OIDC authentication.
   */
  @IsOptional()
  @CannotUseWithout("PASSPORT_API_TOKEN")
  @IsUrl({
    require_tld: false,
    allow_underscores: true,
  })
  public PASSPORT_API_BASE_URL = this.toOptionalString(
    environment.PASSPORT_API_BASE_URL
  );

  /**
   * Service token for Passport API lookups.
   */
  @IsOptional()
  @CannotUseWithout("PASSPORT_API_BASE_URL")
  public PASSPORT_API_TOKEN = this.toOptionalString(
    environment.PASSPORT_API_TOKEN
  );

  /**
   * Base64 encoded JSON array of Passport OAuth-lite clients that Outline
   * should use for consent-based authentication.
   */
  @IsOptional()
  @CannotUseWithout("PASSPORT_API_BASE_URL")
  public PASSPORT_CLIENTS_B64 = this.toOptionalString(
    environment.PASSPORT_CLIENTS_B64
  );
}

export default new OIDCPluginEnvironment();
