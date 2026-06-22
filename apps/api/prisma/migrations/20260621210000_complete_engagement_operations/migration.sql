ALTER TYPE "ConversationStatus" ADD VALUE IF NOT EXISTS 'HANDOFF';

CREATE TYPE "MessageEventType" AS ENUM ('SENT', 'DELIVERED', 'OPENED', 'CLICKED', 'BOUNCED', 'COMPLAINED');
CREATE TYPE "PublicActionType" AS ENUM ('CONFIRM', 'DECLINE', 'UNSUBSCRIBE');
CREATE TYPE "PrivacyRequestType" AS ENUM ('EXPORT', 'DELETE', 'WITHDRAW_CONSENT');
CREATE TYPE "PrivacyRequestStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED');

ALTER TABLE "Event"
  ADD COLUMN "agenda" JSONB,
  ADD COLUMN "companionEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "maxCompanions" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "retentionDays" INTEGER NOT NULL DEFAULT 90;

ALTER TABLE "Registration" ADD COLUMN "guestCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "ConsentRecord" ADD COLUMN "withdrawnReason" TEXT;
ALTER TABLE "Conversation" ADD COLUMN "summary" TEXT, ADD COLUMN "summaryVersion" TEXT;
ALTER TABLE "AgentDecision"
  ADD COLUMN "promptVersion" TEXT,
  ADD COLUMN "contextHash" TEXT,
  ADD COLUMN "policyResult" JSONB;

CREATE TABLE "PublicActionToken" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "leadId" TEXT NOT NULL,
  "registrationId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "action" "PublicActionType" NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "consumedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PublicActionToken_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PublicActionToken_tokenHash_key" ON "PublicActionToken"("tokenHash");
CREATE INDEX "PublicActionToken_registrationId_action_idx" ON "PublicActionToken"("registrationId", "action");
CREATE INDEX "PublicActionToken_expiresAt_idx" ON "PublicActionToken"("expiresAt");

CREATE TABLE "MessageEvent" (
  "id" TEXT NOT NULL,
  "messageId" TEXT NOT NULL,
  "type" "MessageEventType" NOT NULL,
  "providerEventId" TEXT NOT NULL,
  "occurredAt" TIMESTAMP(3) NOT NULL,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MessageEvent_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "MessageEvent_providerEventId_key" ON "MessageEvent"("providerEventId");
CREATE INDEX "MessageEvent_messageId_occurredAt_idx" ON "MessageEvent"("messageId", "occurredAt");
CREATE INDEX "MessageEvent_type_occurredAt_idx" ON "MessageEvent"("type", "occurredAt");

CREATE TABLE "WebhookReceipt" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT,
  "provider" TEXT NOT NULL,
  "providerEventId" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "payloadHash" TEXT NOT NULL,
  "processedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WebhookReceipt_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "WebhookReceipt_provider_providerEventId_key" ON "WebhookReceipt"("provider", "providerEventId");
CREATE INDEX "WebhookReceipt_processedAt_createdAt_idx" ON "WebhookReceipt"("processedAt", "createdAt");

CREATE TABLE "PrivacyRequest" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "leadId" TEXT NOT NULL,
  "type" "PrivacyRequestType" NOT NULL,
  "status" "PrivacyRequestStatus" NOT NULL DEFAULT 'COMPLETED',
  "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  "metadata" JSONB,
  CONSTRAINT "PrivacyRequest_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PublicRateLimit" (
  "id" TEXT NOT NULL,
  "keyHash" TEXT NOT NULL,
  "windowStart" TIMESTAMP(3) NOT NULL,
  "count" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PublicRateLimit_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PublicRateLimit_keyHash_windowStart_key" ON "PublicRateLimit"("keyHash", "windowStart");
CREATE INDEX "PublicRateLimit_windowStart_idx" ON "PublicRateLimit"("windowStart");
CREATE INDEX "PrivacyRequest_workspaceId_requestedAt_idx" ON "PrivacyRequest"("workspaceId", "requestedAt");
CREATE INDEX "PrivacyRequest_leadId_requestedAt_idx" ON "PrivacyRequest"("leadId", "requestedAt");

CREATE TABLE "AuditEvent" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "leadId" TEXT,
  "actorType" TEXT NOT NULL,
  "actorId" TEXT,
  "action" TEXT NOT NULL,
  "resource" TEXT NOT NULL,
  "resourceId" TEXT,
  "metadata" JSONB,
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "AuditEvent_workspaceId_occurredAt_idx" ON "AuditEvent"("workspaceId", "occurredAt");
CREATE INDEX "AuditEvent_leadId_occurredAt_idx" ON "AuditEvent"("leadId", "occurredAt");

ALTER TABLE "PublicActionToken" ADD CONSTRAINT "PublicActionToken_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PublicActionToken" ADD CONSTRAINT "PublicActionToken_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PublicActionToken" ADD CONSTRAINT "PublicActionToken_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PublicActionToken" ADD CONSTRAINT "PublicActionToken_registrationId_fkey" FOREIGN KEY ("registrationId") REFERENCES "Registration"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MessageEvent" ADD CONSTRAINT "MessageEvent_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WebhookReceipt" ADD CONSTRAINT "WebhookReceipt_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PrivacyRequest" ADD CONSTRAINT "PrivacyRequest_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PrivacyRequest" ADD CONSTRAINT "PrivacyRequest_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;
