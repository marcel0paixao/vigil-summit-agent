import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { MessageEventType } from "@prisma/client/index";
import { Webhook } from "svix";

import { normalizeResendEmailWebhook, verifyResendWebhook } from "./resend-webhook.js";

const secret = `whsec_${Buffer.from("vigil-resend-webhook-test-secret").toString("base64")}`;

describe("Resend webhook adapter", () => {
  it("verifies the raw payload using Svix headers", () => {
    const payload = Buffer.from('{"type":"email.delivered"}');
    const id = "msg_test_delivery";
    const timestamp = new Date();
    const signature = new Webhook(secret).sign(id, timestamp, payload);

    assert.doesNotThrow(() =>
      verifyResendWebhook(
        payload,
        { id, timestamp: Math.floor(timestamp.getTime() / 1_000).toString(), signature },
        secret
      )
    );
  });

  it("rejects a signature for a different raw payload", () => {
    const id = "msg_test_tampered";
    const timestamp = new Date();
    const signature = new Webhook(secret).sign(id, timestamp, "original");

    assert.throws(() =>
      verifyResendWebhook(
        Buffer.from("tampered"),
        { id, timestamp: Math.floor(timestamp.getTime() / 1_000).toString(), signature },
        secret
      )
    );
  });

  it("normalizes Resend delivery events into the domain contract", () => {
    assert.deepEqual(
      normalizeResendEmailWebhook(
        {
          type: "email.delivered",
          created_at: "2026-06-22T02:00:00.000Z",
          data: { email_id: "email_123", subject: "Welcome" }
        },
        "msg_delivery_123"
      ),
      {
        eventId: "msg_delivery_123",
        providerMessageId: "email_123",
        type: MessageEventType.DELIVERED,
        occurredAt: "2026-06-22T02:00:00.000Z",
        metadata: {
          resendEventType: "email.delivered",
          email_id: "email_123",
          subject: "Welcome"
        }
      }
    );
  });
});
