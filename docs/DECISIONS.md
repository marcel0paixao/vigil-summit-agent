# Architectural Decisions

## Email First

Email is asynchronous, familiar to executive B2B audiences, supports threading and calendar links,
and is auditable. WhatsApp was deferred because it adds channel-specific opt-in, templates, and
personal-number sensitivity before the core conversion loop is proven.

## PostgreSQL As Canonical Memory

Conversation, consent, cadence, and meeting state share transactional invariants. PostgreSQL keeps
them consistent and queryable. A vector database was rejected because the product has no large
knowledge corpus requiring semantic retrieval.

## Bounded Model Autonomy

The model drafts contextual language. Deterministic policy controls eligibility and side effects.
This gives useful personalization without allowing generated output to bypass consent, frequency,
registration, or meeting rules.

## Durable Actions Instead Of Long-Running Workflows

Each future action is a persisted, idempotent unit with a lease and retry budget. It survives
restarts and can be inspected independently. RabbitMQ handles short execution delivery; it is not a
multi-day timer or source of business truth.

## Reversible Provider Adapters

Synthetic, Apollo, Resend, and model providers implement narrow ports. Provider selection is an
environment decision, so local validation and production integration share domain behavior.
