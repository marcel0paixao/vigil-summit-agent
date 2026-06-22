import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";

import type { AuthenticatedRequest, AuthenticatedUser } from "../types/current-user.js";

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(@Inject(JwtService) private readonly jwtService: Pick<JwtService, "verifyAsync">) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest & RequestWithHeaders>();
    const token = this.extractBearerToken(request.headers.authorization);

    if (!token) {
      throw new UnauthorizedException("Missing bearer token");
    }

    try {
      request.user = await this.jwtService.verifyAsync<AuthenticatedUser>(token);
      return true;
    } catch {
      throw new UnauthorizedException("Invalid bearer token");
    }
  }

  private extractBearerToken(authorizationHeader?: string): string | undefined {
    const [scheme, token] = authorizationHeader?.split(" ") ?? [];

    if (scheme !== "Bearer" || !token) {
      return undefined;
    }

    return token;
  }
}

interface RequestWithHeaders {
  headers: {
    authorization?: string;
  };
}
