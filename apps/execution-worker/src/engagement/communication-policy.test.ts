import assert from "node:assert/strict";
import { test } from "node:test";
import { ConsentPurpose, RegistrationStatus } from "@prisma/client/index";
import { evaluateCommunicationPolicy } from "./communication-policy.js";

const valid = { now: new Date("2026-06-21T15:00:00Z"), timezone: "America/Sao_Paulo", purpose: ConsentPurpose.EVENT_COMMUNICATION, deliveredCount: 0, registrationStatus: RegistrationStatus.CONFIRMED, hasConsent: true, isSuppressed: false, hasMeeting: false };

test("communication policy accepts eligible sends", () => assert.deepEqual(evaluateCommunicationPolicy(valid), { allowed: true }));
test("communication policy blocks consent, suppression, meetings and cadence limits", () => {
  assert.equal(evaluateCommunicationPolicy({ ...valid, hasConsent: false }).allowed, false);
  assert.equal(evaluateCommunicationPolicy({ ...valid, isSuppressed: true }).allowed, false);
  assert.equal(evaluateCommunicationPolicy({ ...valid, hasMeeting: true }).allowed, false);
  assert.equal(evaluateCommunicationPolicy({ ...valid, deliveredCount: 5 }).allowed, false);
});
test("communication policy reschedules quiet-hour sends", () => {
  const result = evaluateCommunicationPolicy({ ...valid, now: new Date("2026-06-21T02:00:00Z") });
  assert.equal(result.allowed, false);
  assert.equal(result.reason, "QUIET_HOURS");
  assert.ok(result.retryAt);
});
