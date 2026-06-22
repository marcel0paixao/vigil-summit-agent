import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { resolveRabbitMqUrl } from "@flowpilot/config";

describe("resolveRabbitMqUrl", () => {
  it("prefers a complete connection URL", () => {
    assert.equal(
      resolveRabbitMqUrl({ RABBITMQ_URL: "amqp://existing.example:5672" }),
      "amqp://existing.example:5672"
    );
  });

  it("builds a URL from platform-provided connection parts", () => {
    assert.equal(
      resolveRabbitMqUrl({
        RABBITMQ_HOST: "rabbitmq.internal",
        RABBITMQ_PORT: "5672",
        RABBITMQ_USER: "vigil@example",
        RABBITMQ_PASSWORD: "secret:/value"
      }),
      "amqp://vigil%40example:secret%3A%2Fvalue@rabbitmq.internal:5672"
    );
  });
});
