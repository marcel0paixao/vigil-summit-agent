import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module.js";
import { PrismaModule } from "../prisma/prisma.module.js";
import {
  CredentialsController,
  InternalCredentialsController
} from "./credentials.controller.js";
import { CredentialsService } from "./credentials.service.js";

@Module({
  imports: [AuthModule, PrismaModule],
  controllers: [CredentialsController, InternalCredentialsController],
  providers: [CredentialsService],
  exports: [CredentialsService]
})
export class CredentialsModule {}
