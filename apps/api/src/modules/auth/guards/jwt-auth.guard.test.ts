import assert from "node:assert/strict";
import { test } from "node:test";

import { UnauthorizedException } from "@nestjs/common";

import type { AuthenticatedRequest, AuthenticatedUser } from "../types/current-user.js";
import { JwtAuthGuard } from "./jwt-auth.guard.js";

test("JwtAuthGuard attaches verified JWT payload to the request", async () => {
  const request = {
    headers: {
      authorization: "Bearer valid-token"
    }
  } as AuthenticatedRequest & { headers: { authorization: string } };
  const jwtService = {
    verifyAsync: mockJwtVerify({
      sub: "user-1",
      email: "owner@example.test"
    })
  };
  const guard = new JwtAuthGuard(jwtService);

  const result = await guard.canActivate(httpContext(request));

  assert.equal(result, true);
  assert.deepEqual(request.user, {
    sub: "user-1",
    email: "owner@example.test"
  });
  assert.equal(jwtService.verifyAsync.calls[0]?.[0], "valid-token");
});

test("JwtAuthGuard rejects missing bearer token", async () => {
  const guard = new JwtAuthGuard({
    verifyAsync: mockJwtVerify({})
  });

  await assert.rejects(() => guard.canActivate(httpContext({ headers: {} })), UnauthorizedException);
});

function httpContext(request: unknown) {
  return {
    switchToHttp: () => ({
      getRequest: () => request
    })
  } as never;
}

function mockJwtVerify(value: Partial<AuthenticatedUser>) {
  const calls: unknown[][] = [];
  const fn = async <T extends object = any>(...args: unknown[]) => {
    calls.push(args);
    return value as T;
  };

  return Object.assign(fn, { calls });
}
