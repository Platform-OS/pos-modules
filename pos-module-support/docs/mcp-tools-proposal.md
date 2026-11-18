# Connecting AI assistants to the Support Desk — proposal

Status: proposal, nothing built yet.
Date: 2026-11-18

---

## What this is

Support agents already use AI assistants. Today that means copying a ticket thread out of the desk, pasting it
into a chat, and typing the answer back in by hand. The assistant never sees the customer's history, the SLA
clock or the team's standard wording, because none of it was pasted.

This proposal connects an assistant to the desk directly, so it can look things up itself — and, with a
person's approval, act.

Three rules shape everything below:

1. **The assistant acts as the agent who connected it.** It sees exactly what that person sees, no more. Someone
   who is not an active team member gets nothing at all.
2. **Reading is free. Changing anything needs a human to approve it.** Every write waits for a person to press
   approve before it happens.
3. **Everything is recorded.** Every look-up and every change is written to an audit trail with the agent's name
   against it.

---

## What we ship

### Reading — available immediately

| Tool | What the assistant can do |
|---|---|
| **Search tickets** | Find tickets by queue, department, priority, status, assignee, organisation or keyword. Covers "what's on my plate", "what breaches SLA today", "what's unassigned in billing". |
| **Read a ticket** | Open one ticket and read the whole conversation, with its status, priority, assignee and SLA timings. |
| **Look up a customer** | Find a contact and their organisation, and see what they have written before. |
| **Queue overview** | Counts by queue and department — the shape of the backlog, for standups and triage. |
| **List saved replies** | Read the team's standard replies, so drafts use established wording instead of invented phrasing. |

These are the ones that remove the copying and pasting, and none of them can change anything.

### Changing things — every one waits for approval

| Tool | What the assistant proposes |
|---|---|
| **Add an internal note** | Writes a note on the ticket. Never emailed to the customer. The natural first one: "summarise this thread and note what we have tried". |
| **Set priority** | Raises or lowers a ticket's priority. |
| **Change status** | Moves a ticket between its statuses. |
| **Snooze a ticket** | Puts a ticket aside until a date. |
| **Assign a ticket** | Hands a ticket to a team member. |
| **Reply to the customer** | Sends an email reply. The only one that leaves the building. |

When the assistant proposes any of these, nothing happens until a person reviews the exact wording and values
and approves it. If nobody approves, the request expires on its own.

---

## What we skip for now

| Not included | Why |
|---|---|
| Merging and unmerging tickets | Hard to undo. Two threads wrongly merged lose their history. |
| Bulk changes across many tickets | One mistaken instruction could touch hundreds of tickets at once. |
| Blocking a sender | Silently stops a customer's mail reaching the desk. Too quiet a failure. |
| Adding, removing or editing team members | Team administration stays with people, in the settings screens. |
| Changing desk settings or branding | Configuration, not day-to-day work. |
| Marking a ticket as spam | Has consequences for the sender beyond this desk. |
| Sending mail directly | Would bypass the normal message pipeline and its safeguards. |

None of these are ruled out forever. They are the ones where a confident wrong answer is expensive, so they
wait until the first set has been used in anger.

Also out of scope for now: **anything customer-facing**. These tools are for the support team. Letting customers
ask an assistant about their own ticket is a separate idea with a different set of questions, worth its own
proposal.

---

## The Agents panel

Alongside the tools, the desk needs a screen where an agent manages their own assistants — the same shape as the
Agents page in Memo Vault.

On it, a team member can:

- **Connect an assistant** and get its access key, shown once
- **See what is connected**, when each was last used
- **Choose which tools each assistant may use** — an assistant set up for triage need not be able to reply
- **Revoke one** at any time, immediately

This matters for three reasons. It keeps each person in charge of their own assistants rather than an
administrator doing it for everybody. It makes "what can this thing actually do?" a question with a visible
answer. And revoking is a button the agent can press themselves the moment something looks wrong.

Managers additionally need a view of pending approvals — the queue of changes assistants have proposed and are
waiting on. Worth deciding whether that lives in the desk next to the tickets, or in the MCP admin console where
it sits today. The desk is the better home: that is where the people who should judge a reply already are.

---

## What this is good for, and what it is not

**Good for:** the parts of support that are reading and summarising. Catching up on a long thread, finding
whether a customer has hit this before, seeing what is about to breach, drafting in the team's voice, keeping
notes tidy.

**Not good for:** deciding what to tell a customer. A support desk is the worst place for a confident wrong
answer, because it goes out under the team's name. That is exactly why every change waits for a person — the
assistant does the reading and the drafting, a human still decides what the customer receives.

---

## Decisions needed

1. **Does approval on every change feel right, or too heavy for small ones?** Setting a priority is a very
   different act from emailing a customer, but the same approval step currently covers both. Starting strict and
   relaxing later is easy; the reverse is not.
2. **Where do pending approvals live** — in the desk, or in the MCP admin console?
3. **Who may approve?** Any manager, or only the ticket's assignee?
4. **Is the Agents panel part of this piece of work, or does it follow?** The tools do not strictly need it —
   access keys can be issued elsewhere — but without it nobody can see what their assistant is allowed to do.
5. **Required or optional?** Adding this permanently to the module affects every desk that installs it.
   Shipping it as an optional integration, off unless a desk turns it on, looks like the safer default.

---

## Suggested order

1. The five reading tools, plus the Agents panel so people can connect and revoke.
2. Internal notes — the first change, and the safest one.
3. The triage changes: priority, status, snooze, assign.
4. Customer replies, once the approval step has been used enough to trust it.

Each step is useful on its own, and stopping after any of them leaves something that works.
