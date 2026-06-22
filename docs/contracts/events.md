# Event Contracts

FlowPilot AI uses RabbitMQ as the main broker for asynchronous workflow execution and service-to-service events. Messages are JSON, versioned by contract, tenant-scoped, and traceable through correlation metadata.

TypeScript contracts live in `packages/contracts/src/index.ts`. This document defines the naming and delivery conventions those contracts must follow.

## Message Categories

FlowPilot messages fall into two categories:

- **Commands**: imperative messages asking one service or worker to do work. Example: `workflow.execution.requested`.
- **Events**: factual messages saying something already happened. Example: `workflow.execution.completed`.

The naming convention still uses dotted names for both categories because this keeps routing keys simple and readable.

## Exchanges

Use topic exchanges. Exchange names are stable infrastructure contracts and should not include environment names.

| Exchange | Type | Purpose |
| --- | --- | --- |
| `flowpilot.commands` | topic | Work requests that should be consumed by an owning service or worker. |
| `flowpilot.events` | topic | Domain events that may have multiple subscribers. |
| `flowpilot.retry` | topic | Delayed or scheduled retries. |
| `flowpilot.dlx` | topic | Dead-lettered messages that exhausted retry policy or failed permanently. |

Environment separation should happen through broker vhost, deployment namespace, or local Docker instance, not by renaming exchanges.

## Routing Keys

Routing keys use lowercase dot-separated segments:

```txt
<domain>.<entity-or-process>.<action-or-state>
```

Examples:

- `workflow.execution.requested`
- `workflow.created`
- `workflow.execution.started`
- `workflow.execution.completed`
- `workflow.node.execution.failed`
- `ai.trace.created`

Routing keys must match the message `eventName` for now. If a future consumer needs a broader routing strategy, add a separate `routingKey` constant in `packages/contracts` rather than hand-writing strings in services.

## Queues

Queue names identify the consuming service and intent:

```txt
flowpilot.<service>.<purpose>
```

Initial queues:

| Queue | Bindings | Purpose |
| --- | --- | --- |
| `flowpilot.execution-worker.workflow-executions` | `workflow.execution.requested` on `flowpilot.commands` | Execution workers consume workflow execution requests. |
| `flowpilot.workflow-service.execution-events` | `workflow.execution.*`, `workflow.node.execution.*` on `flowpilot.events` | Workflow service updates execution state from worker events. |
| `flowpilot.observability-service.ai-traces` | `ai.trace.created` on `flowpilot.events` | Observability service persists LLM trace events. |
| `flowpilot.observability-service.execution-events` | `workflow.execution.*`, `workflow.node.execution.*` on `flowpilot.events` | Observability service persists execution timeline events. |

Queues are service-owned. A service may bind the same queue to multiple routing keys when it needs one ordered stream for related work.

## Retry And Dead Lettering

Retry queues follow this pattern:

```txt
flowpilot.retry.<service>.<purpose>.<delay>
```

Examples:

- `flowpilot.retry.execution-worker.workflow-executions.10s`
- `flowpilot.retry.execution-worker.workflow-executions.1m`
- `flowpilot.retry.execution-worker.workflow-executions.5m`

Retry routing keys are explicit contracts too. The execution worker currently uses:

- `workflow.execution.requested.retry.10s`
- `workflow.execution.requested.retry.1m`
- `workflow.execution.requested.retry.5m`

Those retry queues dead-letter back to `flowpilot.commands` with the original `workflow.execution.requested` routing key after their TTL expires.

Dead-letter queues follow this pattern:

```txt
flowpilot.dlq.<service>.<purpose>
```

Examples:

- `flowpilot.dlq.execution-worker.workflow-executions`
- `flowpilot.dlq.workflow-service.execution-events`
- `flowpilot.dlq.observability-service.ai-traces`

Initial retry policy:

| Attempt | Delay |
| --- | --- |
| 1 | 10 seconds |
| 2 | 1 minute |
| 3 | 5 minutes |

After the third retry, the message moves to the relevant dead-letter queue. Non-retryable errors should skip retry and go straight to the dead-letter queue.

## Message Envelope

Every new message should use an envelope plus a typed payload. The shared envelope and message types live in `packages/contracts/src/messaging.ts`. Existing flat event types remain exported for compatibility while services move toward the envelope format.

```json
{
  "eventName": "workflow.execution.requested",
  "eventId": "uuid",
  "schemaVersion": 1,
  "occurredAt": "2026-04-29T12:00:00.000Z",
  "workspaceId": "workspace-id",
  "correlationId": "request-or-workflow-correlation-id",
  "causationId": "parent-event-id-or-command-id",
  "producer": "api",
  "payload": {}
}
```

Required envelope fields:

- `eventName`: stable contract name and default routing key.
- `eventId`: unique message identifier for idempotency and tracing.
- `schemaVersion`: integer contract version, starting at `1`.
- `occurredAt`: ISO 8601 timestamp generated by the producer.
- `workspaceId`: tenant boundary. Consumers must treat it as required authorization and partition context.
- `correlationId`: trace identifier shared across a request, workflow run, or distributed operation.
- `producer`: service that emitted the message, such as `api`, `workflow-service`, `execution-worker`, `ai-orchestrator`, or `observability-service`.
- `payload`: message-specific data.

Optional envelope fields:

- `causationId`: event or command that caused the current message.
- `actor`: user, system, or webhook principal that initiated the operation.
- `idempotencyKey`: producer-defined key for deduplicating command handling.

## Correlation And Causation

Use `correlationId` to group all work caused by one user/API request or one workflow execution.

Use `causationId` to describe the direct parent message. For example:

- `workflow.execution.requested.eventId` becomes the `causationId` for `workflow.execution.started`.
- `workflow.node.execution.started.eventId` becomes the `causationId` for `workflow.node.execution.completed`.

This pair makes distributed traces explainable without needing every service to share one call stack.

## Idempotency

Consumers must treat `eventId` as globally unique. Command consumers should additionally support `idempotencyKey`.

Initial idempotency guidance:

- `workflow.execution.requested`: use `executionId` as the command idempotency key.
- Node execution events: use `executionId + nodeId + eventName`.
- AI trace events: use `traceId`.

Consumers should persist processed event IDs or natural idempotency keys before acknowledging messages where duplicate side effects are risky.

## Acknowledgement Rules

Consumers should acknowledge only after durable side effects are complete.

- Acknowledge after database writes, trace persistence, or event publication has succeeded.
- Reject/requeue only when the failure is transient and retry policy applies.
- Dead-letter immediately when payload validation fails or the error is explicitly non-retryable.

## Outbox Publishing

When a service changes PostgreSQL state and emits a RabbitMQ lifecycle event as part of one logical operation, it should persist an `OutboxMessage` in the same database transaction as the state change. The outbox row stores exchange, routing key, event payload, headers, status, attempts, and an idempotency key.

The execution worker uses this pattern for `workflow.execution.started`, `workflow.execution.completed`, and `workflow.execution.failed`. It publishes the outbox row to RabbitMQ after the transaction commits and then marks the row `PUBLISHED`. If the process crashes before publish, the worker's periodic outbox dispatcher scans `PENDING` rows and republishes them without inventing a new event. Publish failures increment `attempts`, set `lastError`, and eventually mark the row `FAILED` after repeated failures.

## Initial Message Map

| Message | Category | Exchange | Routing key | Primary producer | Primary consumer |
| --- | --- | --- | --- | --- | --- |
| `workflow.created` | Event | `flowpilot.events` | `workflow.created` | `api` or `workflow-service` | `workflow-service`, `observability-service` |
| `workflow.execution.requested` | Command | `flowpilot.commands` | `workflow.execution.requested` | `api` or `workflow-service` | `execution-worker` |
| `workflow.execution.started` | Event | `flowpilot.events` | `workflow.execution.started` | `execution-worker` | `workflow-service`, `observability-service` |
| `workflow.node.execution.started` | Event | `flowpilot.events` | `workflow.node.execution.started` | `execution-worker` | `workflow-service`, `observability-service` |
| `workflow.node.execution.completed` | Event | `flowpilot.events` | `workflow.node.execution.completed` | `execution-worker` | `workflow-service`, `observability-service` |
| `workflow.node.execution.failed` | Event | `flowpilot.events` | `workflow.node.execution.failed` | `execution-worker` | `workflow-service`, `observability-service` |
| `workflow.execution.completed` | Event | `flowpilot.events` | `workflow.execution.completed` | `execution-worker` | `workflow-service`, `observability-service` |
| `workflow.execution.failed` | Event | `flowpilot.events` | `workflow.execution.failed` | `execution-worker` | `workflow-service`, `observability-service` |
| `ai.trace.created` | Event | `flowpilot.events` | `ai.trace.created` | `ai-orchestrator` | `observability-service` |

## Declaration Ownership

Initial implementation declares exchanges, queues, and bindings in application startup code for local development. The API currently declares the shared topology before serving requests and publishes messages directly to topic exchanges through the shared messaging helper.

As the system matures, declarations can move to infrastructure-as-code or a dedicated broker setup script. Until then, service-owned declarations keep the project easy to run locally and demonstrate.

## Source Of Truth

- Human-readable convention: `docs/contracts/events.md`.
- TypeScript source of truth: `packages/contracts/src/index.ts`.
- Messaging constants and envelope types live in `packages/contracts/src/messaging.ts` so services do not hand-write exchange, queue, routing key, or event-name strings.
