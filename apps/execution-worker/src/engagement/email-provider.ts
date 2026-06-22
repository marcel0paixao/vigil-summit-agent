export type EmailDelivery = {
  providerMessageId: string;
  acceptedAt: Date;
  deliveredAt?: Date;
};

export interface EmailProvider {
  readonly name: string;
  send(input: { messageId: string; to: string; subject: string; body: string }): Promise<EmailDelivery>;
}

export class SyntheticEmailProvider implements EmailProvider {
  readonly name = "synthetic";

  async send(input: { messageId: string; to: string; subject: string; body: string }) {
    if (!input.to.endsWith(".test")) throw new Error("Synthetic email provider only accepts reserved .test recipients");
    const deliveredAt = new Date();
    return { providerMessageId: `synthetic:${input.messageId}`, acceptedAt: deliveredAt, deliveredAt };
  }
}

export class ResendEmailProvider implements EmailProvider {
  readonly name = "resend";

  constructor(private readonly apiKey: string, private readonly from: string) {
    if (!apiKey || !from) throw new Error("Resend requires RESEND_API_KEY and RESEND_FROM_EMAIL");
  }

  async send(input: { messageId: string; to: string; subject: string; body: string }) {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${this.apiKey}`, "content-type": "application/json", "idempotency-key": input.messageId },
      body: JSON.stringify({ from: this.from, to: [input.to], subject: input.subject, text: input.body })
    });
    if (!response.ok) throw new Error(`Resend request failed with status ${response.status}`);
    const payload = await response.json() as { id?: string };
    if (!payload.id) throw new Error("Resend response did not include a message id");
    return { providerMessageId: payload.id, acceptedAt: new Date() };
  }
}

export function createEmailProvider(environment: NodeJS.ProcessEnv = process.env): EmailProvider {
  if ((environment.EMAIL_PROVIDER ?? "synthetic") === "resend") {
    return new ResendEmailProvider(environment.RESEND_API_KEY ?? "", environment.RESEND_FROM_EMAIL ?? "");
  }
  return new SyntheticEmailProvider();
}
