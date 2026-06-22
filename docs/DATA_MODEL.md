# Data Model

```mermaid
erDiagram
  Workspace ||--o{ Event : owns
  Workspace ||--o{ Lead : owns
  Event ||--o{ Registration : receives
  Lead ||--o{ Registration : submits
  Registration ||--o| EnrichmentSnapshot : enriches
  Registration ||--o| LeadQualification : qualifies
  Registration ||--o| CadenceEnrollment : schedules
  CadenceEnrollment ||--o{ ScheduledAction : contains
  Registration ||--o| Conversation : opens
  Conversation ||--o{ Message : contains
  Message ||--o{ MessageEvent : records
  Registration ||--o{ AgentDecision : audits
  Registration ||--o{ Meeting : converts
  Lead ||--o{ ConsentRecord : grants
  Lead ||--o{ Suppression : blocks
  Lead ||--o{ PrivacyRequest : requests
```

Declared, enriched, observed, and inferred signals remain distinct. Operational data is scoped by
workspace and event. Registration status is the funnel state; message delivery does not imply
attendance, and only a `BOOKED` meeting counts as a commercial conversion.
