-- CreateEnum
CREATE TYPE "WorkflowNodeExecutionStatus" AS ENUM ('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED', 'SKIPPED');

-- CreateTable
CREATE TABLE "WorkflowNodeExecution" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "executionId" TEXT NOT NULL,
    "nodeId" TEXT NOT NULL,
    "nodeType" TEXT NOT NULL,
    "status" "WorkflowNodeExecutionStatus" NOT NULL DEFAULT 'PENDING',
    "input" JSONB NOT NULL,
    "output" JSONB,
    "error" JSONB,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkflowNodeExecution_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WorkflowNodeExecution_executionId_nodeId_key" ON "WorkflowNodeExecution"("executionId", "nodeId");

-- CreateIndex
CREATE INDEX "WorkflowNodeExecution_workspaceId_idx" ON "WorkflowNodeExecution"("workspaceId");

-- CreateIndex
CREATE INDEX "WorkflowNodeExecution_workflowId_idx" ON "WorkflowNodeExecution"("workflowId");

-- CreateIndex
CREATE INDEX "WorkflowNodeExecution_executionId_idx" ON "WorkflowNodeExecution"("executionId");

-- CreateIndex
CREATE INDEX "WorkflowNodeExecution_status_idx" ON "WorkflowNodeExecution"("status");

-- AddForeignKey
ALTER TABLE "WorkflowNodeExecution" ADD CONSTRAINT "WorkflowNodeExecution_executionId_fkey" FOREIGN KEY ("executionId") REFERENCES "WorkflowExecution"("id") ON DELETE CASCADE ON UPDATE CASCADE;
