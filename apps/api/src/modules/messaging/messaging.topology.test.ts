import assert from "node:assert/strict";
import { test } from "node:test";

import {
  FLOWPILOT_EXCHANGES,
  FLOWPILOT_QUEUES,
  FLOWPILOT_ROUTING_KEYS
} from "@flowpilot/contracts";

import { flowPilotQueueBindings, getExchangeForRoutingKey } from "./messaging.topology.js";

test("workflow execution requests publish to the commands exchange", () => {
  assert.equal(
    getExchangeForRoutingKey(FLOWPILOT_ROUTING_KEYS.workflowExecutionRequested),
    FLOWPILOT_EXCHANGES.commands
  );
});

test("lead enrichment requests publish to the commands exchange", () => {
  assert.equal(
    getExchangeForRoutingKey(FLOWPILOT_ROUTING_KEYS.leadEnrichmentRequested),
    FLOWPILOT_EXCHANGES.commands
  );

  assert.ok(
    flowPilotQueueBindings.some(
      (binding) =>
        binding.queue === FLOWPILOT_QUEUES.engagementWorkerLeadEnrichment &&
        binding.routingKey === FLOWPILOT_ROUTING_KEYS.leadEnrichmentRequested
    )
  );
});

test("domain events publish to the events exchange", () => {
  assert.equal(
    getExchangeForRoutingKey(FLOWPILOT_ROUTING_KEYS.workflowCreated),
    FLOWPILOT_EXCHANGES.events
  );
});

test("topology binds execution requests to the execution worker queue", () => {
  assert.ok(
    flowPilotQueueBindings.some(
      (binding) =>
        binding.queue === FLOWPILOT_QUEUES.executionWorkerWorkflowExecutions &&
        binding.exchange === FLOWPILOT_EXCHANGES.commands &&
        binding.routingKey === FLOWPILOT_ROUTING_KEYS.workflowExecutionRequested
    )
  );
});

test("topology binds execution events to workflow and observability queues", () => {
  const executionEventBindings = flowPilotQueueBindings.filter(
    (binding) =>
      binding.exchange === FLOWPILOT_EXCHANGES.events &&
      binding.routingKey === "workflow.execution.*"
  );

  assert.deepEqual(
    executionEventBindings.map((binding) => binding.queue).sort(),
    [
      FLOWPILOT_QUEUES.observabilityServiceExecutionEvents,
      FLOWPILOT_QUEUES.workflowServiceExecutionEvents
    ].sort()
  );
});
