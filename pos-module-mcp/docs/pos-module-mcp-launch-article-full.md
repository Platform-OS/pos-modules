# MCP Solved Integration. We Solved Execution.

### Introducing `pos-module-mcp` — the governed agent runtime for platformOS

---

There is a question every platform team is quietly avoiding right now.

Not *"should we support AI agents?"* — that one's settled. The question is the one that comes immediately after, the one nobody wants to answer on the record:

**When an agent gets it wrong, what happens next?**

Because agents will get it wrong. Not maliciously, usually. A hallucinated product ID. A misread instruction. A poisoned tool description buried in metadata the user never sees. A perfectly reasonable plan executed against perfectly wrong assumptions. And in most architectures shipping today, the honest answer to *"what happens next"* is: **nobody knows, and there's no way to find out.**

That's the gap `pos-module-mcp` closes.

---

## The uncomfortable state of the MCP ecosystem

The Model Context Protocol won. It's the default integration layer, supported across every major AI client. Adoption has been extraordinary.

Governance has not kept pace. Independent security research through 2025 and 2026 painted a consistent and unflattering picture of publicly available MCP servers: widespread exploitable flaws — path traversal, command injection, SSRF — a single-digit percentage implementing OAuth, and most running as local processes on developer machines rather than governed production infrastructure. In early 2026, more than thirty CVEs were filed against MCP servers, clients and infrastructure in a two-month window, several of them rated critical.

Look at the major 2025–26 incidents and the same architectural root cause keeps appearing, and it's worth stating precisely, because it explains everything:

> There was no control operating at the semantic layer between the agent's *intent* and the *system action* — nothing evaluating whether what the agent was about to do matched what it was actually authorized to do.

Perimeter controls saw the traffic and flagged nothing. They weren't designed to see what the agent was being *instructed* to do.

The protocol defines what is possible. It does not define what is safe.

---

## We didn't add AI to platformOS. We noticed platformOS was already built for this.

Here's what happened internally when we mapped the MCP threat landscape against our own architecture. We expected a gap analysis. We got something closer to a coincidence.

| What MCP servers are missing | What platformOS already had | What the module builds on it |
|---|---|---|
| Per-action authorization; agents run on shared service credentials | **Real users with roles and permissions** | A **named authorization policy** per tool, evaluated on every call against the user behind the token |
| No undo — failed agent plans leave partial state | **Transaction and rollback tags** | Every mutating tool runs inside one transaction |
| Free-form, unvalidated tool input | **Typed GraphQL**, values passed as typed variables | Every tool declares a strict input schema; unknown keys are rejected |
| Ad-hoc or absent audit trails | **Records** in the instance's own database | An append-only, hash-chained ledger table |
| No throttle — one agent can exhaust the system | Atomic counters on records | Per-user rate limits and automatic token suspension |
| One shared process, one shared credential | **Per-instance isolation** — each instance has its own data | Tokens bound to one user and one instance, revocable one by one |

Read that table again, because it's the entire product thesis.

The properties the agent era demands — authorized, validated, reversible, attested, bounded — are not features we had to invent when MCP got hot. They are composed from primitives platformOS has had for years: users and permissions, transactions, typed data access, records. Platforms without them are now hand-rolling authorization, rollback, and audit from scratch, under deadline pressure, in a threat environment that punishes exactly that.

**Our building blocks predate the protocol.** That's the build-order advantage: the module composes primitives that were already there instead of inventing them.

---

## What `pos-module-mcp` actually is

It's a **host, not a hack.** Install it, and your platformOS instance becomes an MCP server — but a governed one, where every single agent call passes through a control plane you didn't have to build.

Here's the entire lifecycle of an agent action:

```
   Agent calls a tool
        │
        ├─  Authenticated  →  every token belongs to a real user of your instance
        ├─  Rate-checked   →  per-user limits; repeated abuse auto-suspends the token
        ├─  Validated      →  against a strict schema you declared
        ├─  Authorized     →  by a named policy, evaluated per call
        ├─  Gated          →  actions you mark as high-impact wait for a human decision
        ├─  Wrapped        →  writes run in a transaction that rolls back atomically
        ├─  Executed       →  your business logic, your commands
        └─  Attested       →  written to a tamper-evident, hash-chained ledger
```

Every control is on by default, from the first call. What you write is your business rules: the tool itself, and a short named policy that says who may call it. Authentication, validation, rate limits, approvals, transactions and the ledger around them are the module's.

### Reads work on day one

Pages you author in Markdown can become MCP resources without writing a tool: resources are off by default, and one setting turns them on for the slug prefixes you choose. The agent receives the Markdown you wrote — never the rendered HTML. Anything else, such as your catalogue, you expose through a resource provider or a read tool of your own.

No scraping rendered HTML. No brittle DOM parsing. No agent guessing at your structure.

### Writes require intent — and drafting one is a single command

There is no universal "update a listing" tool, and we refuse to pretend otherwise. Actions are business-specific by definition, so **you declare them**: a short manifest naming the input schema, the authorization policy, whether the action writes data, and whether it needs human approval.

And declaring one is not a research project. **A generator drafts the tool for you** — manifest, handler, and, for read and create tools, the typed GraphQL. Better still, point the generator at an *existing* platformOS command: it reads the fields that command uses, guesses their types from their names, and drafts a matching manifest and a handler that calls the command. **You wrap the business logic you already have as a governed MCP tool without starting the schema from scratch.**

The draft is deliberately not served. It has no authorization policy, so the registry rejects it until a person names one — and the generator hands over a checklist for the rest: write a precise description, tighten the schema, decide on approval, register the tool. That review step is the point: the safe path is the easy path, and nothing reaches an agent half-finished.

That manifest lives in version control. It gets reviewed like code. Which means — and this is the part that matters more than it sounds — **every tool description an AI model reads on your platform is a file in your repository**, reviewed with the rest of your code.

Tool poisoning, the attack where hostile instructions hide inside tool metadata the user can't see, is the defining vulnerability of the agentic era. Our first defence is structural: *tool descriptions and schemas come only from code you deployed*, never from data an agent or a user can edit. A built-in linter adds a second line, flagging descriptions that carry instructions aimed at the model so a reviewer looks twice. The data your tools return is a different matter — it is your content, and your policies decide who may read it.

---

## Where we pull decisively ahead

### 1. Reversibility is the permission slip

Ask any marketplace operator why their AI integration is read-only, and you'll get the same answer in different words: *because I can't un-ring the bell.*

Every tool declared as mutating runs inside a transaction. Handler throws, your command's validation rejects the input, the ledger or idempotency write errors — the whole thing rolls back atomically, and the rollback itself is recorded in the ledger. No partial state. No orphaned records. No 2 a.m. archaeology.

This is the property that converts "our agents can read things" into "our agents can *do* things." It's not a security checkbox. **It's the unlock for the entire write economy**, and it's the reason a risk-averse operator will say yes.

*Honest boundaries:* transactions govern your data. They cannot recall an email, reverse a payment capture, or undo a third-party API call — so irreversible external effects never run inline. Schedule them as a background job from the handler: platformOS queues a job scheduled inside a transaction only after the transaction commits, so a rolled-back call sends nothing. Put tools whose main job is irreversible behind the human approval gate. That is a rule your code review enforces, not something the engine can detect. And the transaction covers what a tool declares: a tool that writes must be declared mutating, which is also part of review. We'd rather tell you that up front than have you discover it in production.

### 2. The audit trail is a guarantee, not a habit

Most systems log actions. We do something categorically different: **for a mutating tool, the ledger entry commits inside the same transaction as the business mutation.**

Content and its attestation live or die together. A mutating agent action cannot commit without a ledger entry recording which tool ran, for which user, through which client, under which policy decision, and what happened — and a ledger entry cannot claim a write that was rolled back. Arguments are never stored, only their hash, so the audit trail doesn't become a second copy of your sensitive data.

Then we chain it. Each entry hashes its own payload plus its predecessor's hash, and no code path in the module updates or deletes an entry: the ledger is append-only by construction. That turns *"we have logs"* into *"we have logs whose edits show"*: anyone who goes around the application — the admin API, a direct database write — can still change a row, but the built-in chain verifier will report the first entry that was altered, reordered, or backdated. The operator console checks the most recent 200 entries on every load and verifies the whole chain on demand. The append path is serialized, so the chain stays intact even under bursts of concurrent agent traffic.

And we log the denials. A ledger that records only successes is useless during an incident — the interesting question is never *what worked*, it's *what was refused, by whom, how many times, and starting when.* Every tool call from an authenticated caller is recorded, allowed or not; requests with no valid token go to the instance log instead, so anonymous probing can't flood the chain. The wire response to a denied call stays deliberately generic; the specifics go to the ledger, not to the caller probing for a way in.

### 3. Human judgment, exactly where it belongs

Some actions should never run autonomously — and *which* ones is your call, declared per tool. Mark an action as requiring approval and it never executes inline. It records the intent, returns an opaque handle, and waits.

An operator approves it in the console, and it then executes **as the original user** — never as the operator — after the tool, the arguments, the policy and the requesting token are all checked again. The resulting ledger entry names the approving operator and links back to the original request. Reject it and nothing runs. Let it expire (after seven days, by default) and nothing runs. An exact duplicate — same tool, same arguments — is refused and the agent is pointed at the request already waiting, and a per-user cap (three pending requests by default) keeps a runaway agent from flooding the queue.

This is what lets an operator hand an agent genuinely consequential capability without handing it the keys.

### 4. An agent can't overrun what it can't overrun

Governance that only checks *whether* an action is allowed, but never *how often*, isn't governance — it's an invitation to a denial-of-service.

Every user's tool calls are rate-limited per minute (60 by default); a call over the limit is refused with a `Retry-After`. Keep piling up refused and malformed calls in a short window (20 in five minutes, by default) and the token **auto-suspends** — a misbehaving or compromised agent takes itself offline instead of grinding your instance down. Oversized requests and inputs nested deeper than the schema allows are rejected before they reach a handler.

The abuse counter looks at outcomes, not just volume: rate-limit hits, schema rejections, calls to unknown tools, authorization denials and flooding the approval queue all count toward suspension. A confused agent in a retry loop and a hostile one probing your surface look the same to the counter — and both get stopped.

### 5. Least exposure, by default

Delegation without a shared service account: the agent acts **as** the user who connected it, so a buyer's agent inherits the buyer's rights and never holds its own. Agents sign in through the built-in OAuth 2.1 server — PKCE, short-lived access tokens, rotating refresh tokens, each token bound to one client and to this server alone — or use a personal token the user creates in the browser. Your policies evaluate against the human, and the ledger records both the human and the client. The contract already carries a `delegation_mode`, so a separate **on-behalf-of** mode can be added later without changing your tools or policies.

And that scope is tight by construction. An OAuth token can be **read-only**: a client that asks only for `mcp:read` gets a token that no mutating tool will accept. The engine also enforces a **per-token tool allowlist** on every call, so a narrowed credential can only reach what it was issued for — though today that list is set on the token record directly; the console has no control for it yet. Any token can be **revoked centrally in one move** — by its owner or an operator — and it stops working on its next request; removing a user's MCP access stops all of that user's tokens at once. Tool discovery can be scoped too: switch `tools/list` to list only the tools the caller's policies admit, and discovery can require sign-in, so an unauthorized or anonymous agent doesn't even learn your privileged surface exists.

That distinction is invisible on a feature chart and decisive in a security review.

### 6. One module. Every instance. Same posture.

Install it across your entire estate and every instance runs the same engine with the same secure defaults — scoped to its own data, its own tokens, its own resource identifier, its own ledger. No per-partner engineering. Tuning a limit is one config constant per instance, and the operator console shows the values in force, so an instance running weaker settings than its neighbour is visible at a glance.

For channel partners running many instances, this is the difference between *"we secured the agent integration"* and *"agent integration is secure by default, on every instance."*

### 7. Your compliance artifact builds itself — and you can watch it live

Here's the part your legal team will appreciate more than your engineers do.

The regulatory direction of travel is unambiguous: logging, data governance, human oversight, and demonstrable control over automated action. When an agent takes a consequential action through an MCP server, that action falls inside those obligations.

Every organisation deploying agents will eventually need to produce evidence of exactly that. Most will assemble it retroactively, in a panic, from logs that were never designed for the purpose.

Yours is already written. Hash-chained, tamper-evident, queryable via GraphQL, exportable on demand — generated as a *byproduct* of running the system correctly, not as a separate compliance project.

And you don't have to query it blind. The module ships a built-in **operator console** — one server-rendered page, no JavaScript required, with call metrics and latency on an optional auto-refresh, chain verification on every load, the approval queue, each token's violations counted against the suspension threshold, active tokens with a one-click kill-switch, member access management, the tools and config in force, and a filtered ledger export. When something does go wrong, the console doesn't just alarm — a broken chain links straight to the affected entries, and one-click filters pull up denials, suspensions and rollbacks. Incident response is a page, not a project.

### 8. We don't just govern your tools. We prove it — by attacking them.

Anyone can claim their controls hold. We hand you the means to check.

Because every governed call is already attested in the ledger, the module's repository includes an **agentic security evaluation harness**: a real LLM agent is pointed at a test instance's governed tools as a low-privilege user and told to break in — escalate privilege, inject through arguments, reach another user's data, get past the approval gate and the rate limits. Another task hands an ordinary helpful agent stored content carrying planted instructions, and checks that the destructive tool it is urged to call never runs. It's graded not on what the agent *claims*, but on what the **ledger** and the instance's data show actually happened. A blocked attack is a proof point; a successful one is a finding you see before your customers do.

And we validate the validator: the harness is also run against deliberately vulnerable tools, enabled only for that run, confirming it detects a real breach rather than rubber-stamping a pass. You get an adversary with an incorruptible referee. It ships with tasks for the module's own test tools; pointing it at *your* tools means adding your tasks to the suite. Alongside it, an operator can run a deterministic check of your served tools from the console — every description present, distinct and free of the patterns the poisoning linter looks for.

---

## How this compares

| | Bespoke MCP server | Generic MCP gateway | **pos-module-mcp** |
|---|---|---|---|
| Authorization | You build it | Coarse, at the perimeter | **Named policies, per call, per identity** |
| Rollback on failure | You build it | Not addressed | **Transactional for every mutating tool** |
| Input validation | You build it | Schema pass-through | **Strict, enforced, unknown keys rejected** |
| Rate / abuse limiting | You build it | Sometimes, coarse | **Per-user, with auto-suspend** |
| Human approval gate | You build it | Rare | **Declared per tool, executes as the requesting user** |
| Audit trail | You build it | Gateway-level logs | **Hash-chained, tamper-evident, transaction-bound** |
| Tamper detection | Rare | No | **Built-in chain verifier** |
| Tool poisoning defence | Hope | Scanning | **Descriptions are reviewed code, plus a linter** |
| Delegated identity | Rare | Sometimes | **Agent acts as the signed-in user, via OAuth 2.1** |
| Discovery scoping | No | No | **`tools/list` can be filtered by authorization** |
| Authoring effort | High | N/A | **One generator command drafts the tool; wraps existing commands** |
| Adversarial self-test | No | No | **Agentic eval graded on the ledger** |
| Isolation | You build it | Per deployment | **Per instance: own data, tokens and ledger** |
| Knows your business logic | Yes | **No** | **Yes** |

That last row is the one that decides it.

A gateway sits *outside* your application and can only reason about traffic — it doesn't know that repricing a listing has a category band, or that an order past shipping can't be cancelled. A bespoke server knows your logic but starts its security posture at zero and stays there under deadline pressure.

**pos-module-mcp knows both** — because the governance and the business logic live in the same runtime.

---

## The one-sentence version

Hand this to your CTO:

> **platformOS is where agents can act, because every action is authorized, bounded and attested, every write is reversible — and all of it is provable.**

Not *"we support MCP."* Everyone will support MCP by Christmas. Supporting a protocol is a compatibility statement. Governing what moves through it is an architecture.

---

## Where we are, honestly

We're building this in phases, and we're going to tell you which is which — because a governance product that overstates its own maturity has already failed at the thing it's selling.

**Phase 1 — governed reads. Shipped.** Tool listing and invocation for non-mutating tools, resources over Markdown pages, full identity binding, validation, authorization, rate/abuse limiting and the hash-chained ledger from the very first call. The load-bearing planes, proven.

**Phase 2 — governed writes. Shipped.** Transaction-wrapped mutation, the human-approval workflow, and idempotency for agent retries are delivered and exercised by a real adversarial test suite. Writes are governed today, not on a slide.

**Phase 3 — surface completeness. Shipped.** Prompts, resource templates, app-provided resources, logging, the tool generator (including wrapping existing commands), the static tool linter and the evaluation harness. Alongside them: the built-in OAuth 2.1 sign-in, support for both the `2025-06-18` and `2026-07-28` MCP revisions, and task handles that let an agent track an approval-gated call while it waits for an operator.

**On the roadmap.** Streaming — which starts as an investigation, because holding long-lived connections is not what platformOS pages are built for — hardened handles for long-running background work, tool search for instances with many tools, transactional sessions, and change notifications for tool and resource lists.

We deliberately shipped the boring, load-bearing parts first. Identity and attestation are the hard problems; mutation is comparatively easy once they're right. Any vendor doing it in the other order is showing you a demo, not a foundation.

---

## The window is open, and it will close

MCP sits in a brittle phase right now: *adoption has outpaced governance.*

Brittle phases don't last. Either the ecosystem matures, or a serious enough incident forces maturity overnight. Either way, the platforms that already offer authorization, reversibility, and attestation, built on primitives they had all along, will be the ones agents are trusted to act on — and the ones still assembling those properties under deadline will spend that period explaining themselves.

We're not scrambling to add governance to an AI feature.

**We're opening a door that was already locked properly.**

---

*Building on platformOS? Talk to us about early access to `pos-module-mcp`.*
*Not on platformOS yet? This is a reasonable moment to reconsider.*
