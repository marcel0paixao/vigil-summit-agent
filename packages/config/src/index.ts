export type RuntimeConfig = {
  nodeEnv: string;
  logLevel: string;
  databaseUrl: string;
  rabbitmqUrl: string;
  redisUrl: string;
  qdrantUrl: string;
  aiOrchestratorUrl: string;
  aiOrchestratorTimeoutMs: number;
};

export function readConfig(env: NodeJS.ProcessEnv = process.env): RuntimeConfig {
  return {
    nodeEnv: env.NODE_ENV ?? "development",
    logLevel: env.LOG_LEVEL ?? "info",
    databaseUrl: requireEnv(env, "DATABASE_URL"),
    rabbitmqUrl: resolveRabbitMqUrl(env),
    redisUrl: requireEnv(env, "REDIS_URL"),
    qdrantUrl: requireEnv(env, "QDRANT_URL"),
    aiOrchestratorUrl: env.AI_ORCHESTRATOR_URL ?? "http://ai-orchestrator:8000",
    aiOrchestratorTimeoutMs: readOptionalPositiveInteger(env, "AI_ORCHESTRATOR_TIMEOUT_MS", 30_000)
  };
}

export function resolveRabbitMqUrl(env: NodeJS.ProcessEnv = process.env): string {
  if (env.RABBITMQ_URL) {
    return env.RABBITMQ_URL;
  }

  const host = requireEnv(env, "RABBITMQ_HOST");
  const user = requireEnv(env, "RABBITMQ_USER");
  const password = requireEnv(env, "RABBITMQ_PASSWORD");
  const port = env.RABBITMQ_PORT ?? "5672";

  return `amqp://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}`;
}

function requireEnv(env: NodeJS.ProcessEnv, key: string): string {
  const value = env[key];

  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }

  return value;
}

function readOptionalPositiveInteger(
  env: NodeJS.ProcessEnv,
  key: string,
  defaultValue: number
): number {
  const value = env[key];

  if (value === undefined) {
    return defaultValue;
  }

  const parsed = Number.parseInt(value, 10);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Environment variable ${key} must be a positive integer`);
  }

  return parsed;
}
