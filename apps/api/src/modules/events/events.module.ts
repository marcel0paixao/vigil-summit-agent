import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module.js";
import { PrismaModule } from "../prisma/prisma.module.js";
import { EventsController, PublicEventsController } from "./events.controller.js";
import { EventsService } from "./events.service.js";
import { PublicRegistrationProtectionService } from "./public-registration-protection.service.js";

@Module({
  imports: [AuthModule, PrismaModule],
  controllers: [EventsController, PublicEventsController],
  providers: [EventsService, PublicRegistrationProtectionService]
})
export class EventsModule {}
