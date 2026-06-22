# Vigil Summit Agent

Consent-aware engagement platform for executive B2B events. It turns registration, enrichment,
attendance, conversations, and confirmed meetings into one auditable conversion workflow.

## Capabilities

- Public registration with capacity, waitlist, deduplication, honeypot, and rate limiting.
- Versioned consent ledger, purpose-scoped suppressions, export, withdrawal, and anonymization.
- Deterministic qualification with enrichment provenance and confidence.
- Durable pre-event and post-event cadences with leases, retries, quiet hours, and send limits.
- Claude-compatible personalized drafting with strict policy gates and deterministic fallback.
- Synthetic, Apollo, and Resend adapters selected through environment variables.
- Signed, single-use confirmation, decline, and unsubscribe actions.
- Idempotent message webhooks, inbound intent handling, handoff, and meeting lifecycle.
- Funnel dashboard, lead timeline, decisions, signals, meetings, and privacy controls.

## Architecture

The repository is a pnpm monorepo:

- `apps/api`: NestJS HTTP API, authentication, RBAC, domain operations, and Prisma.
- `apps/execution-worker`: RabbitMQ consumers, enrichment, cadence dispatch, policy, and delivery.
- `apps/ai-orchestrator`: FastAPI runtime with Anthropic, OpenAI, OpenRouter, and deterministic providers.
- `apps/web`: React application for public registration and protected operations.
- `packages/contracts`: versioned message and workflow contracts.

PostgreSQL is the source of truth. RabbitMQ transports asynchronous commands. External providers are
behind narrow ports so the local demonstration remains deterministic and cannot contact real people.

See [architecture](docs/ARCHITECTURE.md), [agent runtime](docs/AI_ORCHESTRATOR.md),
[data model](docs/DATA_MODEL.md), [decisions](docs/DECISIONS.md), and [operations](docs/OPERATIONS.md).

## Run Locally

Requirements: Docker Desktop with Compose v2.

```bash
cp apps/ai-orchestrator/.env.example apps/ai-orchestrator/.env
docker compose up -d --build
docker compose ps
```

The API applies migrations and runs the idempotent Vigil seed during startup.

| Service | URL |
|---|---|
| Web | http://localhost:5173 |
| API health | http://localhost:3000/api/health |
| API docs | http://localhost:3000/docs |
| AI orchestrator | http://localhost:8000/health |
| RabbitMQ | http://localhost:15672 |
| PostgreSQL | `localhost:5433` |

Demo login: `demo-admin@vigil.test` / `VigilDemo2026!ChangeMe`.
The seed logs the public registration URL and uses only reserved `.test` identities.

## Provider Modes

Local mode is safe by default:

```dotenv
EMAIL_PROVIDER=synthetic
ENRICHMENT_PROVIDER=synthetic
ENGAGEMENT_AI_PROVIDER=deterministic
```

Real integrations are opt-in:

```dotenv
EMAIL_PROVIDER=resend
RESEND_API_KEY=re_...
RESEND_FROM_EMAIL=Vigil Summit <summit@verified-domain.example>
ENRICHMENT_PROVIDER=apollo
APOLLO_API_KEY=...
CALENDAR_PROVIDER=google
GOOGLE_CALENDAR_ACCESS_TOKEN=...
GOOGLE_CALENDAR_ID=primary
ENGAGEMENT_AI_PROVIDER=anthropic
ENGAGEMENT_AI_CREDENTIAL_ID=<encrypted-workspace-credential-id>
ENGAGEMENT_AI_MODEL=claude-sonnet-4-20250514
```

Provider credentials must never be committed. Real delivery also requires a verified domain and
provider webhook configuration.

## Quality Gates

```bash
pnpm install --frozen-lockfile
pnpm --filter @flowpilot/api prisma:generate
pnpm check
pnpm lint
pnpm test
pnpm build
pnpm --filter @flowpilot/api test:integration
pnpm test:smoke
```

The end-to-end demonstration is documented in [docs/DEMO_GUIDE.md](docs/DEMO_GUIDE.md).

## Security And Privacy

Production configuration requires distinct JWT, encryption, internal API, and webhook secrets;
restricted CORS; TLS at the edge; verified provider signatures; and a reviewed retention policy.
The included legal-basis and retention defaults are engineering controls, not legal advice.
