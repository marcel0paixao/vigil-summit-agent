import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import {
  FLOWPILOT_EXCHANGES,
  FLOWPILOT_QUEUES,
  type FlowPilotMessage,
  type FlowPilotRoutingKey
} from "@flowpilot/contracts";
import { connect, type ChannelModel, type ConfirmChannel } from "amqplib";

import { appConfig } from "../config/app.config.js";
import { flowPilotQueueBindings, getExchangeForRoutingKey } from "./messaging.topology.js";

@Injectable()
export class MessagingService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MessagingService.name);
  private connection?: ChannelModel;
  private channel?: ConfirmChannel;

  async onModuleInit(): Promise<void> {
    if (process.env.NODE_ENV === "test") {
      return;
    }

    await this.ensureChannel();
  }

  async onModuleDestroy(): Promise<void> {
    await this.channel?.close();
    await this.connection?.close();
  }

  async publishEvent<TMessage extends FlowPilotMessage>(
    routingKey: FlowPilotRoutingKey,
    message: TMessage
  ): Promise<void> {
    if (process.env.NODE_ENV === "test") {
      return;
    }

    const channel = await this.ensureChannel();
    const exchange = getExchangeForRoutingKey(routingKey);
    const payload = Buffer.from(JSON.stringify(message));

    channel.publish(exchange, routingKey, payload, {
      contentType: "application/json",
      deliveryMode: 2,
      messageId: message.eventId,
      timestamp: Math.floor(Date.parse(message.occurredAt) / 1000),
      type: message.eventName,
      headers: {
        correlationId: message.correlationId,
        producer: message.producer,
        schemaVersion: message.schemaVersion,
        workspaceId: message.workspaceId
      }
    });
    await channel.waitForConfirms();
  }

  private async ensureChannel(): Promise<ConfirmChannel> {
    if (this.channel) {
      return this.channel;
    }

    this.connection = await connect(appConfig.rabbitmqUrl);
    this.channel = await this.connection.createConfirmChannel();

    await this.declareTopology(this.channel);
    this.logger.log("RabbitMQ topology declared");

    return this.channel;
  }

  private async declareTopology(channel: ConfirmChannel): Promise<void> {
    await Promise.all([
      channel.assertExchange(FLOWPILOT_EXCHANGES.commands, "topic", { durable: true }),
      channel.assertExchange(FLOWPILOT_EXCHANGES.events, "topic", { durable: true }),
      channel.assertExchange(FLOWPILOT_EXCHANGES.retry, "topic", { durable: true }),
      channel.assertExchange(FLOWPILOT_EXCHANGES.dlx, "topic", { durable: true })
    ]);

    await Promise.all(
      Object.values(FLOWPILOT_QUEUES).map((queue) => channel.assertQueue(queue, { durable: true }))
    );

    await Promise.all(
      flowPilotQueueBindings.map((binding) =>
        channel.bindQueue(binding.queue, binding.exchange, binding.routingKey)
      )
    );
  }
}
