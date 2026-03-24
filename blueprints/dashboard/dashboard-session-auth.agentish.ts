/// <reference path="../_agentish.d.ts" />

// Dashboard Session Auth

const Agentish = define.language("Agentish");

const DashboardSessionAuth = define.system("DashboardSessionAuth", {
  format: Agentish,
  role: "Browser session bootstrap and transport rules for dashboard API and WebSocket authentication",
});

const Access = {
  lambda: define.system("DashboardAccessLambda"),
  redirectUrl: define.entity("DashboardBootstrapRedirectUrl"),
  bootstrapKey: define.entity("DashboardBootstrapSessionKey"),
};

const Browser = {
  shell: define.system("DashboardBrowserShell"),
  bootstrapExchange: define.entity("DashboardSessionExchangeRequest"),
  browserToken: define.entity("DashboardBrowserSessionToken"),
  sessionStorage: define.entity("SessionStorageTokenCache"),
  bootstrapUrlCleanup: define.entity("BootstrapUrlCleanup"),
};

const Gateway = {
  server: define.system("DashboardGateway"),
  httpAuthHeader: define.entity("AuthorizationBearerHeader"),
  wsAuthHeader: define.entity("WebSocketUpgradeAuthHeader"),
  wsProtocol: define.entity("DashboardSessionSubprotocol"),
  authCheck: define.entity("GatewaySessionValidation"),
  authenticatedContext: define.entity("AuthenticatedDashboardRequestContext"),
  authError: define.entity("DashboardAuthErrorResponse"),
};

const Backend = {
  featureApi: define.entity("DashboardFeatureApi"),
  featureSocket: define.entity("DashboardFeatureWebSocket"),
};

const Policy = {
  bootstrapOnlyUrl: define.concept("BootstrapUrlOnly"),
  noTokenInUrl: define.concept("NoPostBootstrapTokenInUrl"),
  gatewayOwnedValidation: define.concept("GatewayOwnedSessionValidation"),
  httpBearer: define.concept("HttpBearerTransport"),
  wsUpgradeHeader: define.concept("WebSocketUpgradeHeaderTransport"),
  noRawForwarding: define.concept("NoRawSessionTokenForwarding"),
  sessionScopedStorage: define.concept("SessionScopedBrowserStorage"),
  explicitMissingHeaderError: define.concept("ExplicitMissingHeaderError"),
};

DashboardSessionAuth.enforces(`
- The lambda-issued dashboard session secret may appear in a URL only once, as the initial bootstrap redirect parameter.
- After bootstrap exchange succeeds, no dashboard API URL, feature URL, or WebSocket URL may contain the dashboard session token.
- The dashboard gateway owns browser-session validation for both HTTP and WebSocket traffic.
- Feature backends must not define their own browser-session token transport rules or parse dashboard session tokens from URLs.
- HTTP API requests should authenticate with Authorization bearer semantics.
- Browser-initiated WebSocket authentication must use data presented during the upgrade handshake rather than query-string tokens.
- The browser should keep the issued dashboard browser-session token only in session-scoped storage, not in long-lived URL state.
- The gateway should validate the browser token and then proxy only authenticated traffic to feature backends.
- The gateway should not forward the raw browser session token downstream once validation is complete.
- When auth transport is missing, the gateway should reject the request with a clear error that names the missing header channel, explains the expected token usage, and uses the correct unauthorized status semantics for the protocol.
`);

DashboardSessionAuth.defines(`
- DashboardBootstrapSessionKey means the one-time secret embedded in the lambda redirect URL that exists only to bootstrap a browser session.
- DashboardBrowserSessionToken means the post-exchange browser token used for authenticated dashboard traffic after bootstrap.
- BootstrapUrlOnly means the redirect URL may carry the bootstrap key exactly once, before the browser exchanges it for a transport token.
- NoPostBootstrapTokenInUrl means neither sessionKey nor sessionToken nor equivalent auth secret may remain in browser history, copied links, API paths, query strings, or WebSocket URLs after initialization.
- GatewayOwnedSessionValidation means the Bun dashboard gateway validates session auth before routing API requests or upgrading feature WebSockets.
- HttpBearerTransport means browser HTTP requests send Authorization: Bearer <dashboard-session-token>.
- WebSocketUpgradeHeaderTransport means browser WebSocket auth is carried in an upgrade-time header channel the gateway can inspect, with Sec-WebSocket-Protocol used as the browser-compatible transport for the dashboard session token.
- NoRawSessionTokenForwarding means feature servers receive only trusted gateway-authenticated traffic or derived request context, not the original browser token.
- SessionScopedBrowserStorage means the browser stores the exchanged dashboard token in sessionStorage or another same-lifetime in-memory/session-scoped location rather than persisting it in shareable URL state.
- ExplicitMissingHeaderError means HTTP requests missing Authorization return 401 Unauthorized with a body that identifies the missing Authorization header and instructs the caller to send Authorization: Bearer <dashboard-session-token>; WebSocket upgrade attempts missing the required auth channel fail the upgrade with 401 Unauthorized and a plain explanation that the dashboard session token must be supplied during the upgrade handshake rather than in the URL.
`);

Access.lambda.contains(Access.redirectUrl, Access.bootstrapKey);
Browser.shell.contains(
  Browser.bootstrapExchange,
  Browser.browserToken,
  Browser.sessionStorage,
  Browser.bootstrapUrlCleanup,
);
Gateway.server.contains(
  Gateway.httpAuthHeader,
  Gateway.wsAuthHeader,
  Gateway.wsProtocol,
  Gateway.authCheck,
  Gateway.authenticatedContext,
  Gateway.authError,
);
Gateway.server.contains(
  Policy.gatewayOwnedValidation,
  Policy.httpBearer,
  Policy.wsUpgradeHeader,
  Policy.noRawForwarding,
  Policy.explicitMissingHeaderError,
);
Browser.shell.contains(
  Policy.bootstrapOnlyUrl,
  Policy.noTokenInUrl,
  Policy.sessionScopedStorage,
);
Gateway.server.routes(Backend.featureApi, Backend.featureSocket);

when(Access.lambda.redirects(Browser.shell))
  .then(Access.redirectUrl.includes(Access.bootstrapKey))
  .and(DashboardSessionAuth.requires(Policy.bootstrapOnlyUrl));

when(Browser.shell.observes(Access.bootstrapKey))
  .then(Browser.shell.posts(Browser.bootstrapExchange))
  .and(Browser.bootstrapExchange.sends(Access.bootstrapKey).in("request body"))
  .and(Browser.shell.receives(Browser.browserToken))
  .and(Browser.shell.stores(Browser.browserToken).in(Browser.sessionStorage))
  .and(Browser.shell.applies(Browser.bootstrapUrlCleanup))
  .and(Browser.bootstrapUrlCleanup.removes(Access.bootstrapKey).from("location and history state"));

when(Browser.shell.calls(Backend.featureApi))
  .then(Browser.shell.sends(Gateway.httpAuthHeader))
  .and(Gateway.httpAuthHeader.carries("Bearer dashboard-session-token"))
  .and(Gateway.server.performs(Gateway.authCheck))
  .and(Gateway.server.proxies(Backend.featureApi).onlyAfter(Gateway.authCheck))
  .and(DashboardSessionAuth.requires(Policy.noTokenInUrl));

when(Browser.shell.opens(Backend.featureSocket))
  .then(Browser.shell.sends(Gateway.wsProtocol))
  .and(Gateway.wsProtocol.carries("dashboard-session auth material during upgrade"))
  .and(Gateway.server.inspects(Gateway.wsAuthHeader))
  .and(Gateway.server.performs(Gateway.authCheck))
  .and(Gateway.server.upgrades(Backend.featureSocket).onlyAfter(Gateway.authCheck))
  .and(DashboardSessionAuth.requires(Policy.noTokenInUrl));

when(Gateway.server.validates(Browser.browserToken))
  .then(Gateway.server.creates(Gateway.authenticatedContext))
  .and(Gateway.server.strips(Browser.browserToken).before("forwarding to feature backends"))
  .and(DashboardSessionAuth.requires(Policy.noRawForwarding));

when(Browser.shell.calls(Backend.featureApi).without(Gateway.httpAuthHeader))
  .then(Gateway.server.rejects(Backend.featureApi).with(401))
  .and(Gateway.server.returns(Gateway.authError))
  .and(Gateway.authError.identifies("missing Authorization header"))
  .and(Gateway.authError.instructs("send Authorization: Bearer <dashboard-session-token>"))
  .and(Gateway.authError.instructs("use the bootstrap sessionKey only for the one-time exchange endpoint, never for later URLs"))
  .and(DashboardSessionAuth.requires(Policy.explicitMissingHeaderError));

when(Browser.shell.opens(Backend.featureSocket).without(Gateway.wsProtocol))
  .then(Gateway.server.rejects("the WebSocket upgrade").with(401))
  .and(Gateway.server.returns(Gateway.authError))
  .and(Gateway.authError.identifies("missing dashboard WebSocket auth header channel"))
  .and(Gateway.authError.instructs("send the dashboard session token during the WebSocket upgrade handshake"))
  .and(Gateway.authError.instructs("do not place the dashboard session token in the WebSocket URL"))
  .and(DashboardSessionAuth.requires(Policy.explicitMissingHeaderError));
