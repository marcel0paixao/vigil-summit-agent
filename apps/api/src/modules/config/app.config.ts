import "dotenv/config";

import { resolveRabbitMqUrl } from "@flowpilot/config";
import { z } from "zod";

const schema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    API_HOST: z.string().default("0.0.0.0"),
    API_PORT: z.coerce.number().int().positive().default(3000),
    CORS_ORIGIN: z.string().default("*"),
    DATABASE_URL: z.string().url(),
    RABBITMQ_URL: z.string().url().optional(),
    RABBITMQ_HOST: z.string().optional(),
    RABBITMQ_PORT: z.coerce.number().int().positive().optional(),
    RABBITMQ_USER: z.string().optional(),
    RABBITMQ_PASSWORD: z.string().optional(),
    REDIS_URL: z.string().url(),
    QDRANT_URL: z.string().url(),
    JWT_SECRET: z.string().min(24),
    CREDENTIAL_ENCRYPTION_KEY: z.string().min(24).optional(),
    INTERNAL_API_TOKEN: z.string().min(24).optional(),
    WEBHOOK_SIGNING_SECRET: z.string().min(24).optional()
  })
  .superRefine((environment, context) => {
    if (
      !environment.RABBITMQ_URL &&
      (!environment.RABBITMQ_HOST || !environment.RABBITMQ_USER || !environment.RABBITMQ_PASSWORD)
    ) {
      context.addIssue({
        code: "custom",
        message: "RABBITMQ_URL or RABBITMQ_HOST, RABBITMQ_USER and RABBITMQ_PASSWORD is required",
        path: ["RABBITMQ_URL"]
      });
    }

    if (environment.NODE_ENV !== "production") {
      return;
    }

    for (const key of ["CREDENTIAL_ENCRYPTION_KEY", "INTERNAL_API_TOKEN", "WEBHOOK_SIGNING_SECRET"] as const) {
      if (!environment[key]) {
        context.addIssue({
          code: "custom",
          message: `${key} is required in production`,
          path: [key]
        });
      }
    }

    if (environment.CORS_ORIGIN === "*") {
      context.addIssue({
        code: "custom",
        message: "CORS_ORIGIN must be restricted in production",
        path: ["CORS_ORIGIN"]
      });
    }
  });

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  throw new Error(`Invalid API environment: ${z.prettifyError(parsed.error)}`);
}

export const appConfig = {
  nodeEnv: parsed.data.NODE_ENV,
  host: parsed.data.API_HOST,
  port: parsed.data.API_PORT,
  corsOrigin: parsed.data.CORS_ORIGIN,
  databaseUrl: parsed.data.DATABASE_URL,
  rabbitmqUrl: resolveRabbitMqUrl(process.env),
  redisUrl: parsed.data.REDIS_URL,
  qdrantUrl: parsed.data.QDRANT_URL,
  jwtSecret: parsed.data.JWT_SECRET,
  credentialEncryptionKey: parsed.data.CREDENTIAL_ENCRYPTION_KEY ?? parsed.data.JWT_SECRET,
  internalApiToken: parsed.data.INTERNAL_API_TOKEN ?? parsed.data.JWT_SECRET,
  webhookSigningSecret: parsed.data.WEBHOOK_SIGNING_SECRET ?? parsed.data.JWT_SECRET
} as const;
