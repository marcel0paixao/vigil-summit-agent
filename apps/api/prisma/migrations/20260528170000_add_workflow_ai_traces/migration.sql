CREATE TYPE "AiTraceStatus" AS ENUM ('SUCCEEDED', 'FAILED');

CREATE TABLE "WorkflowAiTrace" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "workflowId" TEXT,
  "workflowExecutionId" TEXT,
  "nodeExecutionId" TEXT,
  "nodeId" TEXT,
  "credentialId" TEXT,
  "provider" TEXT NOT NULL,
  "model" TEXT NOT NULL,
  "status" "AiTraceStatus" NOT NULL,
  "latencyMs" INTEGER NOT NULL,
  "inputTokenCount" INTEGER NOT NULL DEFAULT 0,
  "outputTokenCount" INTEGER NOT NULL DEFAULT 0,
  "totalTokenCount" INTEGER NOT NULL DEFAULT 0,
  "estimatedCostUsd" DECIMAL(12, 6),
  "inputSizeBytes" INTEGER,
  "outputSizeBytes" INTEGER,
  "schemaValid" BOOLEAN,
  "errorCode" TEXT,
  "errorMessage" TEXT,
  "providerStatusCode" INTEGER,
  "retryable" BOOLEAN,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "WorkflowAiTrace_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "WorkflowAiTrace_workspaceId_idx" ON "WorkflowAiTrace"("workspaceId");
CREATE INDEX "WorkflowAiTrace_workflowId_idx" ON "WorkflowAiTrace"("workflowId");
CREATE INDEX "WorkflowAiTrace_workflowExecutionId_idx" ON "WorkflowAiTrace"("workflowExecutionId");
CREATE INDEX "WorkflowAiTrace_nodeExecutionId_idx" ON "WorkflowAiTrace"("nodeExecutionId");
CREATE INDEX "WorkflowAiTrace_nodeId_idx" ON "WorkflowAiTrace"("nodeId");
CREATE INDEX "WorkflowAiTrace_credentialId_idx" ON "WorkflowAiTrace"("credentialId");
CREATE INDEX "WorkflowAiTrace_provider_idx" ON "WorkflowAiTrace"("provider");
CREATE INDEX "WorkflowAiTrace_provider_model_idx" ON "WorkflowAiTrace"("provider", "model");
CREATE INDEX "WorkflowAiTrace_status_idx" ON "WorkflowAiTrace"("status");
CREATE INDEX "WorkflowAiTrace_createdAt_idx" ON "WorkflowAiTrace"("createdAt");

ALTER TABLE "WorkflowAiTrace"
  ADD CONSTRAINT "WorkflowAiTrace_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WorkflowAiTrace"
  ADD CONSTRAINT "WorkflowAiTrace_workflowId_fkey"
  FOREIGN KEY ("workflowId") REFERENCES "Workflow"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "WorkflowAiTrace"
  ADD CONSTRAINT "WorkflowAiTrace_workflowExecutionId_fkey"
  FOREIGN KEY ("workflowExecutionId") REFERENCES "WorkflowExecution"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "WorkflowAiTrace"
  ADD CONSTRAINT "WorkflowAiTrace_nodeExecutionId_fkey"
  FOREIGN KEY ("nodeExecutionId") REFERENCES "WorkflowNodeExecution"("id") ON DELETE SET NULL ON UPDATE CASCADE;
