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

## Production Release

The root `Dockerfile` provides separate immutable targets for API, worker, and web. Database
migrations run as a pre-deploy command; the idempotent demo seed runs only as the initial deploy
hook. Provider keys are platform secrets and never Docker build arguments committed to source.

Run the remote journey after each release:

```bash
API_BASE_URL=https://your-app.example/api \
SMOKE_ADMIN_EMAIL=demo-admin@vigil.test \
SMOKE_ADMIN_PASSWORD='<platform secret>' \
node scripts/smoke-demo.mjs
```
