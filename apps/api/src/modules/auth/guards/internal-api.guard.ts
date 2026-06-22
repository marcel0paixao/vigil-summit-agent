import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";

import { appConfig } from "../../config/app.config.js";

@Injectable()
export class InternalApiGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<RequestWithHeaders>();
    const authorization = request.headers.authorization;
    const token = authorization?.startsWith("Bearer ") ? authorization.slice("Bearer ".length) : undefined;

    if (token !== appConfig.internalApiToken) {
      throw new ForbiddenException("Internal API token is invalid");
    }

    return true;
  }
}

interface RequestWithHeaders {
  headers: {
    authorization?: string;
  };
}
