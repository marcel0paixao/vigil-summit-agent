# Continuous Integration

CI installs locked dependencies, generates Prisma Client, validates TypeScript packages, runs Node
and Python tests, builds the monorepo, and executes PostgreSQL integration tests against applied
migrations. Provider tests use fakes and never require production credentials.

Required checks:

```bash
pnpm check
pnpm lint
pnpm test
pnpm build
pnpm --filter @flowpilot/api test:integration
cd apps/ai-orchestrator && pytest
```

Deployment must additionally validate Compose configuration, migration status, health endpoints,
and a synthetic smoke journey.
