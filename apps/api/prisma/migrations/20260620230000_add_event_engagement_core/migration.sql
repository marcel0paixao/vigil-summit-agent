CREATE TYPE "EventStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'LIVE', 'COMPLETED', 'CANCELLED');
CREATE TYPE "LeadSource" AS ENUM ('REGISTRATION_FORM', 'ADMIN_IMPORT', 'DEMO');
CREATE TYPE "RegistrationStatus" AS ENUM ('REGISTERED', 'WAITLISTED', 'CONFIRMED', 'DECLINED', 'ATTENDED', 'NO_SHOW');
CREATE TYPE "ConsentPurpose" AS ENUM ('EVENT_COMMUNICATION', 'COMMERCIAL_FOLLOW_UP');
CREATE TYPE "ConsentLegalBasis" AS ENUM ('CONSENT', 'LEGITIMATE_INTEREST');
CREATE TYPE "CommunicationChannel" AS ENUM ('EMAIL');

CREATE TABLE "Event" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "location" TEXT,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3),
    "timezone" TEXT NOT NULL,
    "capacity" INTEGER NOT NULL DEFAULT 120,
    "status" "EventStatus" NOT NULL DEFAULT 'DRAFT',
    "audienceProfile" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Lead" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "workEmail" TEXT NOT NULL,
    "normalizedWorkEmail" TEXT NOT NULL,
    "jobTitle" TEXT,
    "companyName" TEXT NOT NULL,
    "companyDomain" TEXT,
    "source" "LeadSource" NOT NULL DEFAULT 'REGISTRATION_FORM',
    "suppressedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Lead_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Registration" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "status" "RegistrationStatus" NOT NULL DEFAULT 'REGISTERED',
    "interestTopics" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "registeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmedAt" TIMESTAMP(3),
    "declinedAt" TIMESTAMP(3),
    "attendedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Registration_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ConsentRecord" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "purpose" "ConsentPurpose" NOT NULL,
    "legalBasis" "ConsentLegalBasis" NOT NULL,
    "channel" "CommunicationChannel" NOT NULL,
    "noticeVersion" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "withdrawnAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ConsentRecord_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Event_workspaceId_slug_key" ON "Event"("workspaceId", "slug");
CREATE INDEX "Event_workspaceId_idx" ON "Event"("workspaceId");
CREATE INDEX "Event_status_startsAt_idx" ON "Event"("status", "startsAt");
CREATE UNIQUE INDEX "Lead_workspaceId_normalizedWorkEmail_key" ON "Lead"("workspaceId", "normalizedWorkEmail");
CREATE INDEX "Lead_workspaceId_idx" ON "Lead"("workspaceId");
CREATE INDEX "Lead_companyDomain_idx" ON "Lead"("companyDomain");
CREATE INDEX "Lead_suppressedAt_idx" ON "Lead"("suppressedAt");
CREATE UNIQUE INDEX "Registration_eventId_leadId_key" ON "Registration"("eventId", "leadId");
CREATE INDEX "Registration_workspaceId_idx" ON "Registration"("workspaceId");
CREATE INDEX "Registration_eventId_status_idx" ON "Registration"("eventId", "status");
CREATE INDEX "Registration_leadId_idx" ON "Registration"("leadId");
CREATE INDEX "ConsentRecord_workspaceId_idx" ON "ConsentRecord"("workspaceId");
CREATE INDEX "ConsentRecord_eventId_idx" ON "ConsentRecord"("eventId");
CREATE INDEX "ConsentRecord_leadId_purpose_channel_idx" ON "ConsentRecord"("leadId", "purpose", "channel");
CREATE INDEX "ConsentRecord_withdrawnAt_idx" ON "ConsentRecord"("withdrawnAt");

ALTER TABLE "Event" ADD CONSTRAINT "Event_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Registration" ADD CONSTRAINT "Registration_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Registration" ADD CONSTRAINT "Registration_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Registration" ADD CONSTRAINT "Registration_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ConsentRecord" ADD CONSTRAINT "ConsentRecord_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ConsentRecord" ADD CONSTRAINT "ConsentRecord_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ConsentRecord" ADD CONSTRAINT "ConsentRecord_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;
