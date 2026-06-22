import { ApolloEnrichmentProvider } from "./apollo-enrichment-provider.js";
import { type EnrichmentProvider } from "./enrichment-provider.js";
import { SyntheticEnrichmentProvider } from "./synthetic-enrichment-provider.js";

export function createEnrichmentProvider(environment: NodeJS.ProcessEnv = process.env): EnrichmentProvider {
  if ((environment.ENRICHMENT_PROVIDER ?? "synthetic") === "apollo") return new ApolloEnrichmentProvider(environment.APOLLO_API_KEY ?? "");
  return new SyntheticEnrichmentProvider();
}
