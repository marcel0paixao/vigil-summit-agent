import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { PrismaModule } from "../prisma/prisma.module.js";
import { EngagementController, PublicEngagementController } from "./engagement.controller.js";
import { EngagementService } from "./engagement.service.js";

@Module({ imports: [AuthModule, PrismaModule], controllers: [EngagementController, PublicEngagementController], providers: [EngagementService] })
export class EngagementModule {}
