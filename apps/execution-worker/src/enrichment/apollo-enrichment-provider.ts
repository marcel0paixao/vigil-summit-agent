import { type EnrichmentLeadInput, type EnrichmentProvider, type EnrichmentResult } from "./enrichment-provider.js";

export class ApolloEnrichmentProvider implements EnrichmentProvider {
  readonly name = "apollo";
  readonly version = "people-match-v1";

  constructor(private readonly apiKey: string) {
    if (!apiKey) throw new Error("Apollo enrichment requires APOLLO_API_KEY");
  }

  async enrich(input: EnrichmentLeadInput): Promise<EnrichmentResult> {
    const response = await fetch("https://api.apollo.io/api/v1/people/match", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": this.apiKey },
      body: JSON.stringify({ email: input.workEmail, name: input.fullName, organization_name: input.companyName, domain: input.companyDomain, reveal_personal_emails: false, reveal_phone_number: false })
    });
    if (!response.ok) throw new Error(`Apollo enrichment failed with status ${response.status}`);
    const payload = await response.json() as Record<string, unknown>;
    const person = record(payload.person);
    const organization = record(person.organization);
    if (Object.keys(person).length === 0) throw new Error("Apollo did not match the lead");
    const title = string(person.title) ?? input.jobTitle;
    const employeeCount = number(organization.estimated_num_employees);
    const industry = string(organization.industry);
    return {
      provider: this.name,
      providerVersion: this.version,
      jobTitle: title,
      seniority: string(person.seniority),
      roleCategory: classifyRole(title),
      companyName: string(organization.name) ?? input.companyName,
      companyDomain: string(organization.primary_domain) ?? input.companyDomain,
      companyIndustry: industry,
      companyEmployeeRange: employeeCount === undefined ? null : employeeRange(employeeCount),
      professionalProfileUrl: string(person.linkedin_url),
      securitySignals: [...input.interestTopics, ...(industry ? [`${industry} security`] : [])],
      confidence: 0.85,
      evidence: [
        { field: "professionalProfile", source: "apollo_people_match", detail: "Matched with work identity fields" },
        { field: "companyProfile", source: "apollo_organization", detail: "Organization attached to the matched professional profile" }
      ],
      providerPayload: { matched: true, personId: string(person.id), organizationId: string(organization.id) }
    };
  }
}

function record(value: unknown): Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function string(value: unknown): string | null { return typeof value === "string" && value.trim() ? value.trim() : null; }
function number(value: unknown): number | undefined { return typeof value === "number" && Number.isFinite(value) ? value : undefined; }
function employeeRange(value: number) { if (value < 50) return "1-49"; if (value < 200) return "50-199"; if (value < 500) return "200-499"; if (value < 1_000) return "500-999"; if (value < 5_000) return "1000-4999"; return "5000+"; }
function classifyRole(title: string | null) { if (!title) return null; if (/security|cyber|ciso|soc/i.test(title)) return "SECURITY"; if (/risk|compliance|privacy/i.test(title)) return "RISK_AND_COMPLIANCE"; if (/cto|cio|technology|it|ti/i.test(title)) return "TECHNOLOGY"; return "OTHER"; }
