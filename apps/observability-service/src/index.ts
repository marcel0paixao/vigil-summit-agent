import { createLogger } from "@flowpilot/logger";

const logger = createLogger("observability-service", "debug");

logger.info("Observability service scaffold ready", {
  owns: ["workflow logs", "LLM traces", "latency", "token usage", "estimated cost"]
});
