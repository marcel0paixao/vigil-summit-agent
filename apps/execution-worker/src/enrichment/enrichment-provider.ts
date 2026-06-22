export type EnrichmentLeadInput = {
  fullName: string;
  workEmail: string;
  jobTitle: string | null;
  companyName: string;
  companyDomain: string | null;
  interestTopics: string[];
};

export type EnrichmentEvidence = {
  field: string;
  source: string;
  detail: string;
};

export type EnrichmentResult = {
  provider: string;
  providerVersion: string;
  jobTitle: string | null;
  seniority: string | null;
  roleCategory: string | null;
  companyName: string;
  companyDomain: string | null;
  companyIndustry: string | null;
  companyEmployeeRange: string | null;
  professionalProfileUrl: string | null;
  securitySignals: string[];
  confidence: number;
  evidence: EnrichmentEvidence[];
  providerPayload: Record<string, unknown>;
};

export interface EnrichmentProvider {
  readonly name: string;
  readonly version: string;
  enrich(input: EnrichmentLeadInput): Promise<EnrichmentResult>;
}
