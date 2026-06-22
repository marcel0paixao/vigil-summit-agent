# Demonstration Guide

## Start

```bash
cp apps/ai-orchestrator/.env.example apps/ai-orchestrator/.env
docker compose up -d --build
docker compose ps
```

Sign in at `http://localhost:5173` with `demo-admin@vigil.test` and
`VigilDemo2026!ChangeMe`. The API startup seed prints the event-specific registration URL.

## Journey

1. Submit a new `.test` lead through the public event form.
2. Open **Leads** and observe declared data, enrichment provider, confidence, and qualification.
3. Wait for the worker to create the welcome decision and synthetic delivered message.
4. Open the lead timeline and use the generated confirmation link.
5. Mark the registration attended and record an observed session interest through the API docs.
6. Dispatch the due post-event action in accelerated test time or update its `dueAt` locally.
7. Record a reply with meeting intent and book an available demo slot.
8. Verify funnel rates and the confirmed meeting on the engagement dashboard.
9. Exercise consent withdrawal and export from the lead detail page.

## Personas

- Mariana: qualified CISO, confirmed attendee, fintech security interests.
- Carlos: CTO awaiting confirmation, health technology and LGPD interests.
- Ana: IT director on the waitlist, industrial security interests.

All identities and domains are synthetic. Synthetic email refuses non-`.test` recipients.

## Troubleshooting

```bash
docker compose ps
docker compose logs api execution-worker ai-orchestrator
curl http://localhost:3000/api/health
curl http://localhost:8000/health
```

PostgreSQL uses host port `5433` to avoid common local conflicts. RabbitMQ credentials are
`vigil` / `vigil` in local Compose only.
