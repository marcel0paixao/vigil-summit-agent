import "reflect-metadata";

import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import { Logger, ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";

import { AppModule } from "./modules/app.module.js";
import { appConfig } from "./modules/config/app.config.js";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ logger: true }),
    { rawBody: true }
  );

  await app.register(helmet);
  await app.register(cors, {
    origin: appConfig.corsOrigin,
    methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"]
  });

  app.setGlobalPrefix("api");
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true
    })
  );

  const swaggerConfig = new DocumentBuilder()
    .setTitle("Vigil Summit Engagement API")
    .setDescription("Event registration, enrichment, engagement, privacy, and operational APIs.")
    .setVersion("0.1.0")
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup("docs", app, document);

  await app.listen(appConfig.port, appConfig.host);

  Logger.log(`API listening on http://${appConfig.host}:${appConfig.port}`, "Bootstrap");
}

void bootstrap();
