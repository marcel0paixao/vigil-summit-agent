import "reflect-metadata";

import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";

export async function createTestApp(): Promise<NestFastifyApplication> {
  process.env.NODE_ENV = "test";
  process.env.API_HOST ??= "127.0.0.1";
  process.env.API_PORT ??= "3001";
  process.env.CORS_ORIGIN ??= "*";
  process.env.JWT_SECRET ??= "replace-with-local-development-secret";
  process.env.RABBITMQ_URL ??= "amqp://flowpilot:flowpilot@localhost:5672";
  process.env.REDIS_URL ??= "redis://localhost:6379";
  process.env.QDRANT_URL ??= "http://localhost:6333";

  const { AppModule } = await import("../modules/app.module.js");
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ logger: false }),
    { logger: false }
  );

  await app.register(helmet);
  await app.register(cors, { origin: process.env.CORS_ORIGIN });

  app.setGlobalPrefix("api");
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true
    })
  );

  await app.init();
  await app.getHttpAdapter().getInstance().ready();

  return app;
}
