export const qualificationPolicyVersion = "v1";

export type QualificationInput = {
  jobTitle: string | null;
  seniority: string | null;
  roleCategory: string | null;
  companyIndustry: string | null;
  companyEmployeeRange: string | null;
  securitySignals: string[];
  audienceProfile: Record<string, unknown> | null;
};

export type QualificationResult = {
  status: "QUALIFIED" | "REVIEW" | "DISQUALIFIED";
  score: number;
  reasonCodes: string[];
  policyVersion: typeof qualificationPolicyVersion;
};

export function qualifyLead(input: QualificationInput): QualificationResult {
  let score = 0;
  const reasonCodes: string[] = [];
  const targetRoles = readStringArray(input.audienceProfile?.targetRoles).map(normalize);
  const minimumEmployees = readPositiveNumber(input.audienceProfile?.companyMinimumEmployees);
  const normalizedTitle = normalize(input.jobTitle ?? "");

  if (input.seniority === "EXECUTIVE") {
    score += 30;
    reasonCodes.push("EXECUTIVE_SENIORITY");
  } else if (input.seniority === "DIRECTOR") {
    score += 25;
    reasonCodes.push("DIRECTOR_SENIORITY");
  } else if (input.seniority === "MANAGER") {
    score += 15;
    reasonCodes.push("MANAGER_SENIORITY");
  }

  if (targetRoles.some((role) => normalizedTitle.includes(role))) {
    score += 25;
    reasonCodes.push("TARGET_ROLE_MATCH");
  } else if (input.roleCategory === "SECURITY" || input.roleCategory === "RISK_AND_COMPLIANCE") {
    score += 20;
    reasonCodes.push("RELEVANT_ROLE_CATEGORY");
  }

  const minimumRangeEmployees = parseEmployeeRangeMinimum(input.companyEmployeeRange);
  if (minimumEmployees && minimumRangeEmployees !== null) {
    if (minimumRangeEmployees >= minimumEmployees) {
      score += 25;
      reasonCodes.push("COMPANY_SIZE_MATCH");
    } else {
      reasonCodes.push("COMPANY_BELOW_TARGET_SIZE");
    }
  } else {
    reasonCodes.push("COMPANY_SIZE_UNKNOWN");
  }

  if (input.companyIndustry && /financial|health|industrial|technology/i.test(input.companyIndustry)) {
    score += 10;
    reasonCodes.push("REGULATED_OR_TECH_INDUSTRY");
  }

  if (input.securitySignals.length > 0) {
    score += 10;
    reasonCodes.push("SECURITY_INTEREST_SIGNAL");
  }

  const boundedScore = Math.min(100, score);
  return {
    status: boundedScore >= 70 ? "QUALIFIED" : boundedScore >= 40 ? "REVIEW" : "DISQUALIFIED",
    score: boundedScore,
    reasonCodes,
    policyVersion: qualificationPolicyVersion
  };
}

function parseEmployeeRangeMinimum(value: string | null): number | null {
  if (!value) return null;
  const match = value.match(/\d+/);
  return match ? Number.parseInt(match[0], 10) : null;
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string") ? value : [];
}

function readPositiveNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

function normalize(value: string): string {
  return value.trim().toLowerCase();
}
