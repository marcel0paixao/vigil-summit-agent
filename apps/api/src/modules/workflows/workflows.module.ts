import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module.js";
import { MessagingModule } from "../messaging/messaging.module.js";
import { PrismaModule } from "../prisma/prisma.module.js";
import { WorkflowsController } from "./workflows.controller.js";
import { WorkflowsService } from "./workflows.service.js";

@Module({
  imports: [AuthModule, MessagingModule, PrismaModule],
  controllers: [WorkflowsController],
  providers: [WorkflowsService]
})
export class WorkflowsModule {}
