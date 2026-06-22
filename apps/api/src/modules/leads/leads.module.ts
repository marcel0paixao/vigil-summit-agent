import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { PrismaModule } from "../prisma/prisma.module.js";

import { LeadsController } from "./leads.controller.js";
import { LeadsService } from "./leads.service.js";

@Module({ imports: [AuthModule, PrismaModule], controllers: [LeadsController], providers: [LeadsService] })
export class LeadsModule {}
