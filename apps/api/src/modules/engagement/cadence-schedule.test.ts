import assert from "node:assert/strict";
import { test } from "node:test";
import { RegistrationStatus } from "@prisma/client/index";
import { buildPostEventSchedule, buildPreEventSchedule } from "./cadence-schedule.js";

test("pre-event schedule keeps only future timed steps plus welcome", () => {
  const now = new Date("2026-09-10T12:00:00Z");
  const steps = buildPreEventSchedule(new Date("2026-09-18T12:00:00Z"), now);
  assert.deepEqual(steps.map((step) => step.key), ["welcome", "d7", "d3", "d1"]);
});

test("post-event schedule branches by attendance", () => {
  const anchor = new Date("2026-09-18T21:00:00Z");
  assert.deepEqual(buildPostEventSchedule(RegistrationStatus.ATTENDED, anchor).map((step) => step.key), ["attendee-h2", "attendee-d2", "attendee-d7"]);
  assert.deepEqual(buildPostEventSchedule(RegistrationStatus.NO_SHOW, anchor).map((step) => step.key), ["no-show-d1", "no-show-d3", "no-show-d7"]);
});
