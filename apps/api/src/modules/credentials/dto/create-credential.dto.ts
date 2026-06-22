import { ApiProperty } from "@nestjs/swagger";
import { z } from "zod";

export const credentialTypeSchema = z.enum(["openrouter", "ollama", "openai", "claude", "gemini"]);
export const credentialKindSchema = z.enum(["llm", "database", "search", "webhook", "email"]);

const defaultCapabilitiesByKind = {
  llm: ["llm.chat", "llm.structured_output"],
  database: ["db.query"],
  search: ["search.web"],
  webhook: ["webhook.invoke"],
  email: ["email.send"]
} as const satisfies Record<z.infer<typeof credentialKindSchema>, string[]>;

export const createCredentialSchema = z
  .object({
    name: z.string().min(1).max(120),
    type: credentialTypeSchema,
    kind: credentialKindSchema.default("llm"),
    capabilities: z.array(z.string().min(1).max(120)).max(20).optional(),
    value: z.string().min(1).max(10_000)
  })
  .strict()
  .transform((credential) => ({
    ...credential,
    capabilities:
      credential.capabilities && credential.capabilities.length > 0
        ? credential.capabilities
        : [...defaultCapabilitiesByKind[credential.kind]]
  }));

export type CreateCredentialDto = z.infer<typeof createCredentialSchema>;

export class CreateCredentialSwaggerDto {
  @ApiProperty({ type: String, example: "Personal OpenRouter key" })
  name!: string;

  @ApiProperty({ enum: ["openrouter", "ollama", "openai", "claude", "gemini"], example: "openrouter" })
  type!: "openrouter" | "ollama" | "openai" | "claude" | "gemini";

  @ApiProperty({ enum: ["llm", "database", "search", "webhook", "email"], example: "llm" })
  kind!: "llm" | "database" | "search" | "webhook" | "email";

  @ApiProperty({ type: [String], example: ["llm.chat", "llm.structured_output"], required: false })
  capabilities?: string[];

  @ApiProperty({ type: String, example: "sk-or-v1-..." })
  value!: string;
}
