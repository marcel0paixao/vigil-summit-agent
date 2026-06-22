import { RegistrationStatus, ScheduledActionType } from "@prisma/client/index";

export type CadenceStep = {
  key: string;
  dueAt: Date;
  type: ScheduledActionType;
  purpose: "EVENT_COMMUNICATION" | "COMMERCIAL_FOLLOW_UP";
};

const day = 86_400_000;
const hour = 3_600_000;

export function buildPreEventSchedule(startsAt: Date, now: Date): CadenceStep[] {
  const candidates: CadenceStep[] = [
    { key: "welcome", dueAt: now, type: ScheduledActionType.AGENT_DECISION, purpose: "EVENT_COMMUNICATION" },
    { key: "d14", dueAt: new Date(startsAt.getTime() - 14 * day), type: ScheduledActionType.REQUEST_CONFIRMATION, purpose: "EVENT_COMMUNICATION" },
    { key: "d7", dueAt: new Date(startsAt.getTime() - 7 * day), type: ScheduledActionType.REQUEST_CONFIRMATION, purpose: "EVENT_COMMUNICATION" },
    { key: "d3", dueAt: new Date(startsAt.getTime() - 3 * day), type: ScheduledActionType.FOLLOW_UP, purpose: "EVENT_COMMUNICATION" },
    { key: "d1", dueAt: new Date(startsAt.getTime() - day), type: ScheduledActionType.FOLLOW_UP, purpose: "EVENT_COMMUNICATION" }
  ];

  return candidates.filter((step, index) => index === 0 || step.dueAt > now);
}

export function buildPostEventSchedule(status: RegistrationStatus, anchor: Date): CadenceStep[] {
  if (status === RegistrationStatus.ATTENDED) {
    return [
      { key: "attendee-h2", dueAt: new Date(anchor.getTime() + 2 * hour), type: ScheduledActionType.AGENT_DECISION, purpose: "COMMERCIAL_FOLLOW_UP" },
      { key: "attendee-d2", dueAt: new Date(anchor.getTime() + 2 * day), type: ScheduledActionType.PROPOSE_MEETING, purpose: "COMMERCIAL_FOLLOW_UP" },
      { key: "attendee-d7", dueAt: new Date(anchor.getTime() + 7 * day), type: ScheduledActionType.FOLLOW_UP, purpose: "COMMERCIAL_FOLLOW_UP" }
    ];
  }
  if (status === RegistrationStatus.NO_SHOW) {
    return [
      { key: "no-show-d1", dueAt: new Date(anchor.getTime() + day), type: ScheduledActionType.AGENT_DECISION, purpose: "COMMERCIAL_FOLLOW_UP" },
      { key: "no-show-d3", dueAt: new Date(anchor.getTime() + 3 * day), type: ScheduledActionType.FOLLOW_UP, purpose: "COMMERCIAL_FOLLOW_UP" },
      { key: "no-show-d7", dueAt: new Date(anchor.getTime() + 7 * day), type: ScheduledActionType.FOLLOW_UP, purpose: "COMMERCIAL_FOLLOW_UP" }
    ];
  }
  return [];
}
