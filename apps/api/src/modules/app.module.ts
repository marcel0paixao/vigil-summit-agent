import { Module } from "@nestjs/common";

import { AuthModule } from "./auth/auth.module.js";
import { ConfigModule } from "./config/config.module.js";
import { CredentialsModule } from "./credentials/credentials.module.js";
import { EngagementModule } from "./engagement/engagement.module.js";
import { EventsModule } from "./events/events.module.js";
import { HealthModule } from "./health/health.module.js";
import { LeadsModule } from "./leads/leads.module.js";
import { MessagingModule } from "./messaging/messaging.module.js";
import { PrismaModule } from "./prisma/prisma.module.js";
import { WorkflowsModule } from "./workflows/workflows.module.js";
import { WorkspacesModule } from "./workspaces/workspaces.module.js";

@Module({
  imports: [
    ConfigModule,
    AuthModule,
    CredentialsModule,
    EngagementModule,
    EventsModule,
    HealthModule,
    LeadsModule,
    MessagingModule,
    PrismaModule,
    WorkflowsModule,
    WorkspacesModule
  ]
})
export class AppModule {}
