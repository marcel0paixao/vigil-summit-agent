import { type FlowPilotMessage, type FlowPilotRoutingKey } from "@flowpilot/contracts";

export type MessagePublisher = {
  publishEvent<TMessage extends FlowPilotMessage>(
    routingKey: FlowPilotRoutingKey,
    message: TMessage
  ): Promise<void>;
};
