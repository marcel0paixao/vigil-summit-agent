# Operations

## Health And Readiness

- API: `/api/health`
- AI runtime: `/health`
- PostgreSQL: `pg_isready`
- RabbitMQ: `rabbitmq-diagnostics ping`
- Web: HTTP root

Compose waits for dependencies before starting consumers. API startup applies pending migrations
and runs an idempotent synthetic seed.

## Security Baseline

- Separate JWT, credential-encryption, internal API, and webhook-signing secrets.
- Restricted production CORS and TLS termination.
- Workspace RBAC on operator APIs.
- HMAC timestamp validation and idempotent webhook receipts.
- Provider credentials stored encrypted and excluded from logs.
- Synthetic delivery refuses real domains.

## Retention

Events default to 90 days of operational retention. Export and consent withdrawal are immediate.
Deletion anonymizes lead identity while preserving aggregate funnel integrity. Production retention
must be approved by the data controller before launch.

## Recovery

Scheduled actions with expired leases are reclaimed. Bounded retries use backoff; RabbitMQ failures
route to dead-letter queues. Reprocessing is safe where documented idempotency keys exist.
