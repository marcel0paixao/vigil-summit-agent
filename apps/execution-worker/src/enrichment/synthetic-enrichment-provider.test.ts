import assert from "node:assert/strict";
import { test } from "node:test";

import { SyntheticEnrichmentProvider } from "./synthetic-enrichment-provider.js";

test("enriches Vigil demo personas deterministically with explicit provenance", async () => {
  const provider = new SyntheticEnrichmentProvider();
  const result = await provider.enrich({
    fullName: "Mariana Costa (Demo)",
    workEmail: "mariana.costa@fintech-demo.test",
    jobTitle: "CISO",
    companyName: "Fintech Demo",
    companyDomain: "fintech-demo.test",
    interestTopics: ["AI risk", "SOC 2"]
  });

  assert.equal(result.provider, "synthetic");
  assert.equal(result.providerVersion, "v1");
  assert.equal(result.companyIndustry, "Financial services");
  assert.equal(result.companyEmployeeRange, "501-1000");
  assert.equal(result.seniority, "EXECUTIVE");
  assert.equal(result.roleCategory, "SECURITY");
  assert.equal(result.confidence, 0.96);
  assert.match(result.professionalProfileUrl ?? "", /^https:\/\/professional-profiles\.test\//);
  assert.deepEqual(result.providerPayload, {
    matchStrategy: "exact_demo_domain",
    matchedDomain: "fintech-demo.test"
  });
  assert.equal("workEmail" in result.providerPayload, false);
});

test("falls back to declared professional data without inventing company facts", async () => {
  const provider = new SyntheticEnrichmentProvider();
  const result = await provider.enrich({
    fullName: "Pat Example",
    workEmail: "pat@unknown.example",
    jobTitle: "Risk Manager",
    companyName: "Unknown Example",
    companyDomain: "unknown.example",
    interestTopics: ["ISO 27001", "ISO 27001", "AI governance"]
  });

  assert.equal(result.companyIndustry, null);
  assert.equal(result.companyEmployeeRange, null);
  assert.equal(result.professionalProfileUrl, null);
  assert.equal(result.seniority, "MANAGER");
  assert.equal(result.roleCategory, "RISK_AND_COMPLIANCE");
  assert.equal(result.confidence, 0.6);
  assert.deepEqual(result.securitySignals, []);
});
