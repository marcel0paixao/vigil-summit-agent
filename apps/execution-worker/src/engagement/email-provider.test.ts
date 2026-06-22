import assert from "node:assert/strict";
import { test } from "node:test";

import { SyntheticEmailProvider } from "./email-provider.js";

test("synthetic provider delivers only to reserved test domains", async () => {
  const delivery = await new SyntheticEmailProvider().send({
    messageId: "message-1",
    to: "mariana@fintech-demo.test",
    subject: "Vigil Summit",
    body: "Welcome"
  });
  assert.equal(delivery.providerMessageId, "synthetic:message-1");

  await assert.rejects(
    () => new SyntheticEmailProvider().send({ messageId: "message-2", to: "person@example.com", subject: "No", body: "No" }),
    /only accepts reserved \.test/
  );
});
