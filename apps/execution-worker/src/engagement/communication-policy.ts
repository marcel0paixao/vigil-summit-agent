import { ConsentPurpose, RegistrationStatus } from "@prisma/client/index";

export type CommunicationPolicyInput = {
  now: Date;
  timezone: string;
  purpose: ConsentPurpose;
  deliveredCount: number;
  registrationStatus: RegistrationStatus;
  hasConsent: boolean;
  isSuppressed: boolean;
  hasMeeting: boolean;
};

export type CommunicationPolicyResult = { allowed: true } | { allowed: false; reason: string; retryAt?: Date };

export function evaluateCommunicationPolicy(input: CommunicationPolicyInput): CommunicationPolicyResult {
  if (!input.hasConsent) return { allowed: false, reason: "MISSING_CONSENT" };
  if (input.isSuppressed) return { allowed: false, reason: "LEAD_SUPPRESSED" };
  if (input.hasMeeting) return { allowed: false, reason: "MEETING_BOOKED" };
  if (input.registrationStatus === RegistrationStatus.DECLINED) return { allowed: false, reason: "REGISTRATION_DECLINED" };
  const limit = input.purpose === ConsentPurpose.EVENT_COMMUNICATION ? 5 : 4;
  if (input.deliveredCount >= limit) return { allowed: false, reason: "CADENCE_LIMIT_REACHED" };
  const hour = localHour(input.now, input.timezone);
  if (hour < 8 || hour >= 18) return { allowed: false, reason: "QUIET_HOURS", retryAt: nextLocalWindow(input.now, hour) };
  return { allowed: true };
}

function localHour(date: Date, timezone: string) {
  const value = new Intl.DateTimeFormat("en-US", { timeZone: timezone, hour: "2-digit", hourCycle: "h23" }).format(date);
  return Number(value);
}

function nextLocalWindow(now: Date, localHourValue: number) {
  const hours = localHourValue < 8 ? 8 - localHourValue : 24 - localHourValue + 8;
  return new Date(now.getTime() + hours * 3_600_000);
}
