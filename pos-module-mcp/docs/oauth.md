# OAuth — built-in authorization server

MCP clients that support the MCP authorization spec (for example Claude, ChatGPT
connectors, MCP Inspector) can connect without a hand-minted token: the instance is both
the **protected resource** (`/mcp`) and an **OAuth 2.1 authorization server**. Tokens are
opaque, bound to a real platformOS user, and stored in the same `mcp_token` table as
manual tokens (only their SHA-256 digests), so no signing keys are involved.

Manual tokens from `/mcp-tools` keep working alongside OAuth. Set
`MCP_CONFIG {"oauth":{"authorization_server":false}}` to turn the authorization server
off; only manual tokens then work.

## Flow

1. The client calls `/mcp` without a token and gets `401` with
   `WWW-Authenticate: Bearer resource_metadata="<origin>/.well-known/oauth-protected-resource"`.
   By default only `tools/call` and the Tasks methods require a token; set
   `oauth.challenge_initialize` to also challenge `initialize` / `server/discover`, for
   clients that only start the flow on a 401 at connect time.
2. It reads the protected-resource metadata (RFC 9728), then the authorization-server
   metadata (RFC 8414).
3. It identifies itself with a **Client ID Metadata Document** (`client_id` is an https
   URL) or registers with **Dynamic Client Registration** (RFC 7591).
4. It sends the user to `/oauth/authorize` (authorization code + PKCE `S256`). The user
   signs in if needed and sees a consent page naming the client, the redirect host and
   the scopes. Approve returns `code`, `state` and `iss` (RFC 9207); deny returns
   `access_denied`.
5. It exchanges the code at `/oauth/token` and refreshes there.

## Endpoints

| Path | Purpose |
|---|---|
| `GET /.well-known/oauth-protected-resource` (also `…/mcp`) | RFC 9728 resource metadata: `resource` = `<origin>/mcp`, scopes, this instance as authorization server |
| `GET /.well-known/oauth-authorization-server` | RFC 8414 metadata: endpoints, `S256` only, `none` client auth, CIMD support |
| `GET /oauth/authorize` | Validates the request, signs the user in, shows consent |
| `POST /oauth/authorize` | Consent decision (CSRF-protected form post) |
| `POST /oauth/token` | `authorization_code` and `refresh_token` grants |
| `POST /oauth/register` | Dynamic Client Registration (public clients only) |
| `POST /oauth/revoke` | RFC 7009 revocation, only for the client the token was issued to |

`/oauth/token`, `/oauth/register` and `/oauth/revoke` answer CORS preflights so browser
clients can call them.

## Who may authorize

Consent requires the same permission as minting a manual token,
`oauth.required_permission` (`mcp.tokens.manage`, held by the `mcp_user` and
`mcp_operator` roles — see "Access control & operators" in the README). A signed-in user
without it is sent back to the client with `access_denied`.

The permission is checked again on **every** use: on each `/mcp` call
(`identity/resolve_principal`, `401` reason `permission_revoked`), on each refresh
(`invalid_grant`) and when an operator approves an action the user requested. Removing
the role by any path stops the user's OAuth and manual tokens at once; restoring it
restores them.

## Scopes

| Scope | Grants |
|---|---|
| `mcp:read` | discovery, resources, prompts and non-mutating tools. Always granted. |
| `mcp:write` | tools whose manifest declares `mutating: true` |

A token without `mcp:write` calling a mutating tool gets `403` with
`WWW-Authenticate: … error="insufficient_scope", scope="mcp:read mcp:write"` so the client
can ask the user again with the wider scope. Scopes only narrow: the tool's authorization
policy still runs. Manual tokens carry both scopes.

## Tokens

| | Lifetime | Notes |
|---|---|---|
| authorization code (`mcp_ac_…`) | 60 s (`oauth.code_ttl_seconds`) | single use: the code is consumed before any other check, so a wrong verifier or redirect URI burns it |
| access token (`mcp_at_…`) | 1 h (`oauth.access_token_ttl_seconds`) | bound to one client, one resource (`<origin>/mcp`, RFC 8707) and a scope set |
| refresh token (`mcp_rt_…`) | 30 days (`oauth.refresh_token_ttl_seconds`) | rotated on every use; presenting an already-rotated refresh token revokes the whole grant |

Token request rules:

- PKCE `S256` is required; `plain` is refused.
- `redirect_uri` must be repeated on the token request, exactly, when it was sent to
  `/oauth/authorize` (OAuth 2.1 §4.1.3). A client with a single registered redirect URI
  may omit it on both requests.
- `resource`, when sent, must name this server's `/mcp` URL (`invalid_target`
  otherwise). An access token for another resource is rejected on `/mcp`
  (`wrong_audience`), so tokens cannot be passed through to other servers.

Each OAuth grant appears in the user's `/mcp-tools` list and in the operator token list,
where it can be revoked like a manual token.

## Client registration

**Client ID Metadata Documents** (`oauth.client_id_metadata_documents`, on). The
`client_id` is an https URL; the server fetches it and requires a JSON document whose
`client_id` equals that URL and that lists `redirect_uris`. The consent page shows the
client's domain so the user can judge it.

**Dynamic Client Registration** (`oauth.dynamic_client_registration`, on). Public
clients only (`token_endpoint_auth_method: none`). Redirect URIs must be https, http on a
loopback host, or a private-use app scheme, without a fragment. Registration is rate
limited per IP (`oauth.registration_rate_limit_per_min`, 10).

The token endpoint is rate limited too (`oauth.token_rate_limit_per_min`, 60).

## Configuration

All keys live under `oauth` in the `MCP_CONFIG` constant:

| Key | Default |
|---|---|
| `authorization_server` | `true` |
| `challenge_initialize` | `false` |
| `required_permission` | `mcp.tokens.manage` |
| `default_scope` | `mcp:read mcp:write` |
| `access_token_ttl_seconds` / `refresh_token_ttl_seconds` / `code_ttl_seconds` | `3600` / `2592000` / `60` |
| `client_id_metadata_documents` / `dynamic_client_registration` | `true` / `true` |
| `registration_rate_limit_per_min` / `token_rate_limit_per_min` | `10` / `60` |

An external authorization server (validating JWTs from another issuer) is not supported
yet.

## Security notes

- **SSRF.** Fetching a client metadata document is an outbound request chosen by the
  caller. `oauth/public_https_url` allows only https on the default port, with a path, a
  dotted public-looking DNS name, no IP literal in any notation, no userinfo, fragment or
  trailing dot, and no `localhost` / `.local` / `.internal` / similar names.
- **DNS rebinding — residual risk.** Liquid cannot see what a name resolves to, so a
  public name that resolves to a private address is not detected. Whether the
  platform's outbound HTTP follows redirects (which would let a public URL bounce to an
  internal one) has not been verified.
- **Code theft.** PKCE plus single-use codes: a stolen code gets one guess.
- **Refresh token theft.** Rotation with reuse detection revokes the grant.
- **Consent CSRF.** The decision is a form post with the platform authenticity token and
  a per-request id kept in the session.
