import {
  type EnrichmentLeadInput,
  type EnrichmentProvider,
  type EnrichmentResult
} from "./enrichment-provider.js";

type SyntheticCompanyProfile = {
  industry: string;
  employeeRange: string;
  securitySignals: string[];
};

const syntheticProfiles: Record<string, SyntheticCompanyProfile> = {
  "fintech-demo.test": {
    industry: "Financial services",
    employeeRange: "501-1000",
    securitySignals: ["SOC 2 compliance", "AI risk governance"]
  },
  "health-demo.test": {
    industry: "Health technology",
    employeeRange: "201-500",
    securitySignals: ["LGPD compliance", "continuous security monitoring"]
  },
  "industry-demo.test": {
    industry: "Industrial technology",
    employeeRange: "1001-5000",
    securitySignals: ["ISO 27001", "vulnerability remediation"]
  }
};

export class SyntheticEnrichmentProvider implements EnrichmentProvider {
  readonly name = "synthetic";
  readonly version = "v1";

  async enrich(input: EnrichmentLeadInput): Promise<EnrichmentResult> {
    const domain = input.companyDomain?.trim().toLowerCase() ?? null;
    const profile = domain ? syntheticProfiles[domain] : undefined;
    const jobTitle = input.jobTitle?.trim() || null;
    const confidence = profile ? 0.96 : 0.6;

    return {
      provider: this.name,
      providerVersion: this.version,
      jobTitle,
      seniority: classifySeniority(jobTitle),
      roleCategory: classifyRole(jobTitle),
      companyName: input.companyName.trim(),
      companyDomain: domain,
      companyIndustry: profile?.industry ?? null,
      companyEmployeeRange: profile?.employeeRange ?? null,
      professionalProfileUrl:
        profile && domain
          ? `https://professional-profiles.test/${encodeURIComponent(domain)}/${slugify(input.fullName)}`
          : null,
      securitySignals: profile?.securitySignals ?? [],
      confidence,
      evidence: [
        {
          field: "jobTitle",
          source: "declared_registration",
          detail: "Submitted by the attendee"
        },
        {
          field: "companyProfile",
          source: profile ? "synthetic_demo_dataset" : "no_external_match",
          detail: profile
            ? `Deterministic demo profile matched by ${domain}`
            : "No synthetic company profile matched"
        }
      ],
      providerPayload: {
        matchStrategy: profile ? "exact_demo_domain" : "declared_data_fallback",
        matchedDomain: profile ? domain : null
      }
    };
  }
}

function classifySeniority(jobTitle: string | null): string | null {
  if (!jobTitle) {
    return null;
  }

  if (/\b(ciso|cto|cio|chief|vp|vice president)\b/i.test(jobTitle)) {
    return "EXECUTIVE";
  }

  if (/\b(director|diretor|head)\b/i.test(jobTitle)) {
    return "DIRECTOR";
  }

  if (/\b(manager|gerente|lead)\b/i.test(jobTitle)) {
    return "MANAGER";
  }

  return "INDIVIDUAL_CONTRIBUTOR";
}

function classifyRole(jobTitle: string | null): string | null {
  if (!jobTitle) {
    return null;
  }

  if (/\b(ciso|security|seguranca|cyber|soc)\b/i.test(jobTitle)) {
    return "SECURITY";
  }

  if (/\b(risk|risco|compliance|privacy|privacidade)\b/i.test(jobTitle)) {
    return "RISK_AND_COMPLIANCE";
  }

  if (/\b(cto|cio|technology|tecnologia|it|ti)\b/i.test(jobTitle)) {
    return "TECHNOLOGY";
  }

  return "OTHER";
}

function slugify(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
