# Production Deployment

## Topology

`render.yaml` provisions three application processes, the private AI runtime, managed PostgreSQL,
and RabbitMQ with a persistent disk. The web image serves the React bundle and proxies `/api` over
Render's private network, so browsers use a single HTTPS origin.

Render is the reference deployment because its Blueprint supports Docker monorepos, generated
secrets, managed PostgreSQL, workers, private services, pre-deploy migrations, and persistent disks.
The selected plans incur charges; review the estimate in the Render confirmation screen before
creating resources.

## Activate

1. Open `https://dashboard.render.com/blueprints` and connect this repository.
2. Select the root `render.yaml` Blueprint and review the paid resource estimate.
3. Provide `ANTHROPIC_API_KEY`, `APOLLO_API_KEY`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, and
   `GOOGLE_CALENDAR_ACCESS_TOKEN` when prompted. Render generates infrastructure and application
   secrets.
4. Read `DEMO_ADMIN_PASSWORD` from the API service environment after the first deploy.
5. Set the API `CORS_ORIGIN` and worker/API `PUBLIC_APP_URL` to a custom domain if one is attached.

## Provider Callbacks

- Resend webhook: `https://<public-host>/api/public/engagement/webhooks/email`. Subscribe to sent,
  delivered, opened, clicked, bounced, and complained events, then replace the API service's
  `WEBHOOK_SIGNING_SECRET` with the webhook signing secret shown by Resend.
- API documentation: `https://<api-host>/docs`
- Google Calendar currently uses `GOOGLE_CALENDAR_ACCESS_TOKEN` and `GOOGLE_CALENDAR_ID`; add them
  to API and set `CALENDAR_PROVIDER=google` only after the target calendar is authorized.

Use provider dashboards to configure callbacks because those changes require account ownership and
verified domains. Never paste provider secrets into issues, source files, build arguments, or logs.

## Verify

```bash
curl https://<public-host>/api/health

API_BASE_URL=https://<public-host>/api \
SMOKE_ADMIN_EMAIL=demo-admin@vigil.test \
SMOKE_ADMIN_PASSWORD='<DEMO_ADMIN_PASSWORD>' \
node scripts/smoke-demo.mjs
```

For real-provider acceptance, register an address controlled by the operator, inspect the decision
record for `provider=anthropic` and `model=claude-sonnet-4-6`, confirm Resend delivery, verify Apollo
provenance, and book a non-production Google Calendar slot.
