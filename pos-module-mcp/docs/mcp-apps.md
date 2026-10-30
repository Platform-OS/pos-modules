# MCP Apps — cards in the conversation

[MCP Apps](https://modelcontextprotocol.io/docs/extensions/apps) (extension
`io.modelcontextprotocol/ui`, SEP-1865) let a tool show an interactive HTML card inside
the conversation, in hosts that support it. The official client matrix lists Claude (web
and desktop), ChatGPT, VS Code GitHub Copilot, Cursor and Goose among others; Claude Code
is not listed. Other hosts show the tool's normal text result.

The module supports the server side of the extension:

- a tool declares its card and who may see the tool, in its manifest (`ui`);
- the app serves the card's HTML from its resource provider, under a `ui://` address;
- a tool can be **app-only**: offered to the card, never to the model.

Checked against the specification on 2026-10-24
([ext-apps specification](https://github.com/modelcontextprotocol/ext-apps/blob/main/specification/draft/apps.mdx)).

## Declaring a card on a tool

```liquid
assign m = {
  "name": "review_card",
  …
  "ui": { "resource_uri": "ui://my-app/review-card", "visibility": ["model", "app"] }
}
```

| Key | Meaning |
|---|---|
| `resource_uri` | The card, a `ui://` URI. Served in `tools/list` as `_meta.ui.resourceUri`. |
| `visibility` | Who may call the tool: `"model"`, `"app"` (the card) or both. Served as `_meta.ui.visibility`. Omitted means both. |

Anything else in `ui` (another key, a URI outside `ui://`, an empty `visibility`, a value
other than `"model"` and `"app"`) makes the manifest invalid and the tool is excluded, as
for any other manifest error.

The specification links a card to a tool **definition**, not to a single result: a host
that supports MCP Apps shows the card on every call of a tool that declares
`resource_uri`. To show a card only sometimes, let a plain tool say so in its text and
let the model call a separate card tool.

## Serving the card

The card is a resource of the app's provider (`resources_partial`, default
`mcp/resources`). Answer `read` for its `ui://` URI with one content item:

```liquid
assign csp = { "connectDomains": [] }
assign ui_meta = { "csp": csp, "prefersBorder": true }
assign meta = { "ui": ui_meta }
assign card = { "uri": uri, "mimeType": "text/html;profile=mcp-app" }
assign card['text'] = card_html
assign card['_meta'] = meta
```

- `mimeType` must be exactly `text/html;profile=mcp-app`.
- `_meta.ui.csp` (`connectDomains`, `resourceDomains`, `frameDomains`, `baseUriDomains`)
  widens what the host's sandbox allows. Declare as little as possible. Without `csp` the
  host blocks network access and allows only inline and same-origin scripts and styles.
- The engine passes a content item's `_meta` through when it is an object.
- Reads go through the same controls as any provider read: a signed-in caller, the
  `mcp:read` scope, the rate limit, the ledger. An anonymous caller gets "Resource not
  found".
- Keep the HTML a static template, the same for every person: hosts may prefetch and
  cache it. Load per-person data through a tool call from the card.

## App-only tools

A tool with `"visibility": ["app"]` exists for a card. The host needs to see it in
`tools/list` to let the card call it (it keeps it from the model and rejects a card's call
to a tool whose visibility lacks `"app"`), so the module offers it to clients that can
show cards and to no one else:

- **Which clients count** (`helpers/protocol/apps_client`): a signed-in client that
  declared the `io.modelcontextprotocol/ui` extension with `text/html;profile=mcp-app` in
  its `mimeTypes`. A modern (2026-07-28) client declares capabilities in every request's
  `_meta`, and only that request's declaration counts. An older (2025-06-18) client
  declares them once, in `initialize`; the module records the answer on the token
  (`mcp_token.ui_apps`) at each `initialize`, so connecting again without the extension
  withdraws it. A token shared by two clients keeps what the last one declared.
- For such a client it is listed, in the caller's `tools_list_scope`, with
  `_meta.ui.visibility: ["app"]`, and answers `tools/call` under its policy, scopes, rate
  limits and the ledger. A modern list that holds app-only tools carries the `private`
  cache hint.
- For any other client it is left out of `tools/list` and `tools/call` answers it as an
  unknown tool (-32602), ledgered like one.
- It is left out of `queries/registry/for_agent`, and `commands/execute/invoke` answers it
  as an unknown tool: in-app code acts as a model, and no host stands in between.

## What visibility does not protect

**App-only is not a security boundary.** The card calls tools through the host, and the
host forwards an ordinary `tools/call`. The server receives nothing that tells a card's
call from the model's. Hiding app-only tools from the model is the host's job (the
specification requires it of hosts). Offering them only to clients that declared MCP Apps
keeps them away from models in clients without cards, but a client can declare anything:
a host that does not hide them, or a client that claims the extension and calls the tool
directly, reaches it like any other tool.

So an app-only tool must be safe for anyone who holds the token:

- its authorization policy, the approval gate, scopes, rate limits and the ledger apply
  exactly as for any other tool;
- a decision that only the person may make (approve, delete, reveal) needs a check that
  does not depend on the host: a short-lived, single-use token bound to the item and
  the person, delivered only to the card, and for anything that changes data a final
  confirmation on the app's own page under the person's session;
- `structuredContent` and `_meta` of a result are "not added to model context" by the
  specification's guidance, not by a requirement. Do not put secrets in a result on the
  assumption that only the card reads it.

## Not supported yet

- Serving a model-visible tool differently by capability: a tool that declares a card
  carries `_meta.ui` for every client, so it always returns a meaningful text result as
  well, which the specification requires anyway.
- Listing `ui://` resources in `resources/list` with `_meta.ui` (the specification allows
  leaving them out).
