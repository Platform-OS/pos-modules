# Trigger events from commands

## Context and Problem Statement

Following the open/closed priciple, application events are triggered to allow extending the functionality of existing behaviour. The command design pattern represents the behaviour change.
Events are triggered by the code calling the command. The problem is twofold:
  1. If you forget to trigger the event by mistake, then event consumers are not notified.
  1. When there are many invocations of a command then triggering the same event causes code duplication.

## Considered Options

* Trigger events outside commands (keep it as is)
* Trigger events inside commands

## Decision Outcome

Chosen option: "Trigger events inside commands", because it eliminates code duplication and ensures relevant events are triggered.

### Consequences

When writing a new command or modifying an existing one, check that if threre are related events triggered outside the command. If yes, then refactor it and move the event triggering inside the command.

## Pros and Cons of the Options

### Trigger events outside commands

```liquid
  # app/views/pages/sample_usage.liquid
  function object = 'modules/community/commands/relationships/delete', object: relation
  if object.valid
    assign event_payload = null | hash_merge: l_id: object.l_id, r_id: object.r_id, relationship_id: object.id
    function _ = 'modules/core/commands/events/publish', type: 'relationship_deleted', object: event_payload
  endif
```

* Good, because you can see immediately what events will be triggered.
* Good, because you have control over assembling the `event_payload`.
* Bad, because of code duplication, when there are multiple command invocations
* Bad, because if `event_payload` is composed differently and a property is missing, then certain event consumers will fail.

### Trigger events inside commands

```liquid
  # app/views/pages/sample_usage.liquid
  function object = 'modules/community/commands/relationships/delete', object: relation

  # app/views/partials/lib/commands/relationships/delete.liquid
  function object = 'modules/core/commands/execute', mutation_name: 'relationships/delete' object: object, selection: 'record_delete'

  if object.valid
    assign event_payload = object | hash_merge: relationship_id: object.id
    function _ = 'modules/core/commands/events/publish', type: 'relationship_deleted', object: event_payload
  endif
```

* Good, because invoking commands can be simpler.
* Neutral, because triggering events are already taken care of (unless you need info not available inside the command).
* Bad, because if you need additional information in `event_payload` from the current context, you need to pass that to the command first, second update the command to include that in the `event_payload`.
