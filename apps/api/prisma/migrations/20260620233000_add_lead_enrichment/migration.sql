CREATE TYPE "EnrichmentStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED');
CREATE TYPE "InterestSignalSource" AS ENUM ('DECLARED', 'ENRICHED', 'OBSERVED', 'INFERRED');

CREATE TABLE "EnrichmentSnapshot" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "registrationId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerVersion" TEXT NOT NULL,
    "status" "EnrichmentStatus" NOT NULL DEFAULT 'PENDING',
    "jobTitle" TEXT,
    "seniority" TEXT,
    "roleCategory" TEXT,
    "companyName" TEXT,
    "companyDomain" TEXT,
    "companyIndustry" TEXT,
    "companyEmployeeRange" TEXT,
    "professionalProfileUrl" TEXT,
    "securitySignals" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "confidence" DOUBLE PRECISION,
    "evidence" JSONB,
    "providerPayload" JSONB,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "EnrichmentSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "InterestSignal" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "registrationId" TEXT NOT NULL,
    "enrichmentSnapshotId" TEXT,
    "source" "InterestSignalSource" NOT NULL,
    "kind" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "evidence" JSONB,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InterestSignal_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EnrichmentSnapshot_registrationId_key" ON "EnrichmentSnapshot"("registrationId");
CREATE INDEX "EnrichmentSnapshot_workspaceId_idx" ON "EnrichmentSnapshot"("workspaceId");
CREATE INDEX "EnrichmentSnapshot_eventId_idx" ON "EnrichmentSnapshot"("eventId");
CREATE INDEX "EnrichmentSnapshot_leadId_createdAt_idx" ON "EnrichmentSnapshot"("leadId", "createdAt");
CREATE INDEX "EnrichmentSnapshot_status_createdAt_idx" ON "EnrichmentSnapshot"("status", "createdAt");
CREATE UNIQUE INDEX "InterestSignal_registrationId_source_kind_value_key" ON "InterestSignal"("registrationId", "source", "kind", "value");
CREATE INDEX "InterestSignal_workspaceId_idx" ON "InterestSignal"("workspaceId");
CREATE INDEX "InterestSignal_eventId_occurredAt_idx" ON "InterestSignal"("eventId", "occurredAt");
CREATE INDEX "InterestSignal_leadId_occurredAt_idx" ON "InterestSignal"("leadId", "occurredAt");
CREATE INDEX "InterestSignal_enrichmentSnapshotId_idx" ON "InterestSignal"("enrichmentSnapshotId");

ALTER TABLE "EnrichmentSnapshot" ADD CONSTRAINT "EnrichmentSnapshot_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EnrichmentSnapshot" ADD CONSTRAINT "EnrichmentSnapshot_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EnrichmentSnapshot" ADD CONSTRAINT "EnrichmentSnapshot_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EnrichmentSnapshot" ADD CONSTRAINT "EnrichmentSnapshot_registrationId_fkey" FOREIGN KEY ("registrationId") REFERENCES "Registration"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InterestSignal" ADD CONSTRAINT "InterestSignal_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InterestSignal" ADD CONSTRAINT "InterestSignal_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InterestSignal" ADD CONSTRAINT "InterestSignal_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InterestSignal" ADD CONSTRAINT "InterestSignal_registrationId_fkey" FOREIGN KEY ("registrationId") REFERENCES "Registration"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InterestSignal" ADD CONSTRAINT "InterestSignal_enrichmentSnapshotId_fkey" FOREIGN KEY ("enrichmentSnapshotId") REFERENCES "EnrichmentSnapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE;
