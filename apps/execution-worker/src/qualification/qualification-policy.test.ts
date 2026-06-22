import assert from "node:assert/strict";
import { test } from "node:test";

import { qualifyLead } from "./qualification-policy.js";

test("qualifies a target executive from a matching company", () => {
  const result = qualifyLead({
    jobTitle: "CISO",
    seniority: "EXECUTIVE",
    roleCategory: "SECURITY",
    companyIndustry: "Financial services",
    companyEmployeeRange: "501-1000",
    securitySignals: ["SOC 2 compliance"],
    audienceProfile: { companyMinimumEmployees: 200, targetRoles: ["CISO", "CTO"] }
  });

  assert.equal(result.status, "QUALIFIED");
  assert.equal(result.score, 100);
  assert.ok(result.reasonCodes.includes("TARGET_ROLE_MATCH"));
});

test("routes incomplete enrichment to review without inventing fit", () => {
  const result = qualifyLead({
    jobTitle: "Security Manager",
    seniority: "MANAGER",
    roleCategory: "SECURITY",
    companyIndustry: null,
    companyEmployeeRange: null,
    securitySignals: [],
    audienceProfile: { companyMinimumEmployees: 200, targetRoles: ["CISO"] }
  });

  assert.equal(result.status, "DISQUALIFIED");
  assert.equal(result.score, 35);
  assert.ok(result.reasonCodes.includes("COMPANY_SIZE_UNKNOWN"));
});
