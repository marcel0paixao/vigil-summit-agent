import assert from "node:assert/strict";
import { test } from "node:test";

process.env.DATABASE_URL ??= "postgresql://flowpilot:flowpilot@localhost:5432/flowpilot";
process.env.RABBITMQ_URL ??= "amqp://flowpilot:flowpilot@localhost:5672";
process.env.REDIS_URL ??= "redis://localhost:6379";
process.env.QDRANT_URL ??= "http://localhost:6333";
process.env.JWT_SECRET ??= "replace-with-local-development-secret";

const { HealthController } = await import("./health.controller.js");

test("HealthController returns API health status", () => {
  const controller = new HealthController();

  const response = controller.getHealth();

  assert.equal(response.status, "ok");
  assert.equal(response.service, "vigil-summit-api");
  assert.equal(response.environment, "development");
  assert.match(response.timestamp, /^\d{4}-\d{2}-\d{2}T/);
});
