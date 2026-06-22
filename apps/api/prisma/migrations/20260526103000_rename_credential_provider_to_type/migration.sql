DROP INDEX "IntegrationCredential_workspaceId_provider_name_key";
DROP INDEX "IntegrationCredential_provider_idx";

ALTER TABLE "IntegrationCredential" RENAME COLUMN "provider" TO "type";

CREATE UNIQUE INDEX "IntegrationCredential_workspaceId_type_name_key" ON "IntegrationCredential"("workspaceId", "type", "name");
CREATE INDEX "IntegrationCredential_type_idx" ON "IntegrationCredential"("type");
