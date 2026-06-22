CREATE TABLE "WorkflowExecutionEvent" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "executionId" TEXT NOT NULL,
    "eventName" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "producer" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkflowExecutionEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WorkflowExecutionEvent_eventId_key" ON "WorkflowExecutionEvent"("eventId");

CREATE INDEX "WorkflowExecutionEvent_workspaceId_idx" ON "WorkflowExecutionEvent"("workspaceId");

CREATE INDEX "WorkflowExecutionEvent_workflowId_idx" ON "WorkflowExecutionEvent"("workflowId");

CREATE INDEX "WorkflowExecutionEvent_executionId_occurredAt_idx" ON "WorkflowExecutionEvent"("executionId", "occurredAt");

CREATE INDEX "WorkflowExecutionEvent_eventName_idx" ON "WorkflowExecutionEvent"("eventName");

ALTER TABLE "WorkflowExecutionEvent" ADD CONSTRAINT "WorkflowExecutionEvent_executionId_fkey" FOREIGN KEY ("executionId") REFERENCES "WorkflowExecution"("id") ON DELETE CASCADE ON UPDATE CASCADE;
