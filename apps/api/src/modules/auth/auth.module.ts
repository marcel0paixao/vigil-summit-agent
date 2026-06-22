import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";

import { appConfig } from "../config/app.config.js";
import { PrismaModule } from "../prisma/prisma.module.js";
import { AuthController } from "./auth.controller.js";
import { AuthService } from "./auth.service.js";
import { JwtAuthGuard } from "./guards/jwt-auth.guard.js";
import { WorkspaceRolesGuard } from "./guards/workspace-roles.guard.js";

@Module({
  imports: [
    PrismaModule,
    JwtModule.register({
      secret: appConfig.jwtSecret,
      signOptions: {
        expiresIn: "1h"
      }
    })
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtAuthGuard, WorkspaceRolesGuard],
  exports: [JwtModule, JwtAuthGuard, WorkspaceRolesGuard]
})
export class AuthModule {}
