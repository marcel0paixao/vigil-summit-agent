# Agent Runtime

## Role

The Python service isolates model-provider concerns from event operations. It supports Anthropic,
OpenAI, OpenRouter, and a deterministic local provider through a common request contract.

The engagement worker supplies a bounded context containing the event, verified enrichment,
interest provenance, recent conversation memory, allowed links, and the requested action. The model
must return a JSON object with `subject`, `body`, and `rationale`. Invalid output uses a deterministic
fact-grounded fallback and is recorded in the decision reason codes.

## Claude Configuration

Claude uses the native Anthropic Messages API. Provider credentials are read from the encrypted
workspace credential service, not from prompts or database query results.

```dotenv
ENGAGEMENT_AI_PROVIDER=anthropic
ENGAGEMENT_AI_CREDENTIAL_ID=<credential-id>
ENGAGEMENT_AI_MODEL=claude-sonnet-4-20250514
```

## Guardrails

- Closed context; no unrestricted browsing or arbitrary code execution.
- Maximum provider timeout and bounded payload sizes.
- Low-temperature drafting and strict JSON parsing.
- No message is sent solely because a model proposed it.
- Consent and suppression are checked at decision time and again at send time.
- Low-confidence enrichment is visible and must not be asserted as fact.
- Recent messages are bounded; summaries can be versioned separately.

## Failure Modes

Provider configuration errors fail without retry. Transient network and server failures use the
scheduled-action retry budget. Invalid model output falls back safely. Rate limits and exhausted
budgets are observable and do not bypass communication policy.

## Evaluation

Synthetic personas cover an attendee, an undecided registrant, and a waitlisted lead. Quality checks
should verify factual grounding, executive tone, an explicit CTA, working preference links, and the
absence of unsupported claims.
