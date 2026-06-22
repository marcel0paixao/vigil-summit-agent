CREATE TYPE "QualificationStatus" AS ENUM ('QUALIFIED', 'REVIEW', 'DISQUALIFIED');

CREATE TABLE "LeadQualification" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "registrationId" TEXT NOT NULL,
    "snapshotId" TEXT,
    "status" "QualificationStatus" NOT NULL,
    "score" INTEGER NOT NULL,
    "reasonCodes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "policyVersion" TEXT NOT NULL,
    "evaluatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "LeadQualification_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "LeadQualification_registrationId_key" ON "LeadQualification"("registrationId");
CREATE INDEX "LeadQualification_workspaceId_idx" ON "LeadQualification"("workspaceId");
CREATE INDEX "LeadQualification_eventId_status_idx" ON "LeadQualification"("eventId", "status");
CREATE INDEX "LeadQualification_leadId_idx" ON "LeadQualification"("leadId");
CREATE INDEX "LeadQualification_score_idx" ON "LeadQualification"("score");

ALTER TABLE "LeadQualification" ADD CONSTRAINT "LeadQualification_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LeadQualification" ADD CONSTRAINT "LeadQualification_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LeadQualification" ADD CONSTRAINT "LeadQualification_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LeadQualification" ADD CONSTRAINT "LeadQualification_registrationId_fkey" FOREIGN KEY ("registrationId") REFERENCES "Registration"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LeadQualification" ADD CONSTRAINT "LeadQualification_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "EnrichmentSnapshot"("id") ON DELETE SET NULL ON UPDATE CASCADE;
