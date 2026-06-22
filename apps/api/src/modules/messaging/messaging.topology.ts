import {
  FLOWPILOT_EXCHANGES,
  FLOWPILOT_QUEUES,
  FLOWPILOT_ROUTING_KEYS,
  type FlowPilotExchange,
  type FlowPilotQueue,
  type FlowPilotRoutingKey
} from "@flowpilot/contracts";

export type QueueBinding = {
  queue: FlowPilotQueue;
  exchange: FlowPilotExchange;
  routingKey: FlowPilotRoutingKey | string;
};

export const flowPilotQueueBindings: QueueBinding[] = [
  {
    queue: FLOWPILOT_QUEUES.engagementWorkerLeadEnrichment,
    exchange: FLOWPILOT_EXCHANGES.commands,
    routingKey: FLOWPILOT_ROUTING_KEYS.leadEnrichmentRequested
  },
  {
    queue: FLOWPILOT_QUEUES.executionWorkerWorkflowExecutions,
    exchange: FLOWPILOT_EXCHANGES.commands,
    routingKey: FLOWPILOT_ROUTING_KEYS.workflowExecutionRequested
  },
  {
    queue: FLOWPILOT_QUEUES.workflowServiceExecutionEvents,
    exchange: FLOWPILOT_EXCHANGES.events,
    routingKey: "workflow.execution.*"
  },
  {
    queue: FLOWPILOT_QUEUES.workflowServiceExecutionEvents,
    exchange: FLOWPILOT_EXCHANGES.events,
    routingKey: "workflow.node.execution.*"
  },
  {
    queue: FLOWPILOT_QUEUES.workflowServiceExecutionEvents,
    exchange: FLOWPILOT_EXCHANGES.events,
    routingKey: FLOWPILOT_ROUTING_KEYS.workflowCreated
  },
  {
    queue: FLOWPILOT_QUEUES.observabilityServiceAiTraces,
    exchange: FLOWPILOT_EXCHANGES.events,
    routingKey: FLOWPILOT_ROUTING_KEYS.aiTraceCreated
  },
  {
    queue: FLOWPILOT_QUEUES.observabilityServiceExecutionEvents,
    exchange: FLOWPILOT_EXCHANGES.events,
    routingKey: "workflow.execution.*"
  },
  {
    queue: FLOWPILOT_QUEUES.observabilityServiceExecutionEvents,
    exchange: FLOWPILOT_EXCHANGES.events,
    routingKey: "workflow.node.execution.*"
  },
  {
    queue: FLOWPILOT_QUEUES.observabilityServiceExecutionEvents,
    exchange: FLOWPILOT_EXCHANGES.events,
    routingKey: FLOWPILOT_ROUTING_KEYS.workflowCreated
  }
];

const commandRoutingKeys = new Set<FlowPilotRoutingKey>([
  FLOWPILOT_ROUTING_KEYS.leadEnrichmentRequested,
  FLOWPILOT_ROUTING_KEYS.workflowExecutionRequested
]);

export function getExchangeForRoutingKey(routingKey: FlowPilotRoutingKey): FlowPilotExchange {
  if (commandRoutingKeys.has(routingKey)) {
    return FLOWPILOT_EXCHANGES.commands;
  }

  return FLOWPILOT_EXCHANGES.events;
}
