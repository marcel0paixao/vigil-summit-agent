import { createLogger } from "@flowpilot/logger";
import {
  AgentDecisionStatus,
  CadenceEnrollmentStatus,
  CommunicationChannel,
  ConsentPurpose,
  MessageDirection,
  MessageStatus,
  Prisma,
  PublicActionType,
  ScheduledActionStatus,
  ScheduledActionType,
  type PrismaClient
} from "@prisma/client/index";
import { createHash, randomBytes } from "node:crypto";
import { AiOrchestratorClient } from "../ai-orchestrator-client.js";
import { evaluateCommunicationPolicy } from "./communication-policy.js";
import { createEmailProvider, type EmailProvider } from "./email-provider.js";

const logger = createLogger("engagement-dispatcher", "debug");
const batchSize = 25;
const leaseMs = 60_000;
const intervalMs = 5_000;
const maxAttempts = 5;

type DispatcherDependencies = { emailProvider: EmailProvider; aiClient: AiOrchestratorClient; environment: NodeJS.ProcessEnv };

export function startScheduledActionDispatcher(prisma: PrismaClient) {
  const dependencies = createDependencies();
  const dispatch = () => void dispatchDueScheduledActions(prisma, new Date(), dependencies).catch((error) => logger.error("Scheduled action dispatch failed", { error: error instanceof Error ? error.message : String(error) }));
  dispatch();
  const timer = setInterval(dispatch, intervalMs);
  timer.unref();
  return timer;
}

export async function dispatchDueScheduledActions(prisma: PrismaClient, now = new Date(), dependencies = createDependencies()) {
  const candidates = await prisma.scheduledAction.findMany({ where: { OR: [{ status: ScheduledActionStatus.PENDING, dueAt: { lte: now } }, { status: ScheduledActionStatus.DISPATCHING, leaseUntil: { lte: now } }] }, orderBy: { dueAt: "asc" }, take: batchSize });
  let completed = 0; let failed = 0;
  for (const candidate of candidates) {
    const claim = await prisma.scheduledAction.updateMany({ where: { id: candidate.id, OR: [{ status: ScheduledActionStatus.PENDING }, { status: ScheduledActionStatus.DISPATCHING, leaseUntil: { lte: now } }] }, data: { status: ScheduledActionStatus.DISPATCHING, leaseUntil: new Date(now.getTime() + leaseMs), attempts: { increment: 1 } } });
    if (claim.count === 0) continue;
    try {
      await processScheduledAction(prisma, candidate.id, candidate.type, candidate.payload, now, dependencies);
      completed += 1;
    } catch (error) {
      failed += 1;
      const attempts = candidate.attempts + 1;
      await prisma.scheduledAction.update({ where: { id: candidate.id }, data: { status: attempts >= maxAttempts ? ScheduledActionStatus.FAILED : ScheduledActionStatus.PENDING, dueAt: new Date(now.getTime() + Math.min(300_000, 10_000 * 2 ** (attempts - 1))), leaseUntil: null, lastError: error instanceof Error ? error.message : String(error) } });
    }
  }
  return { fetched: candidates.length, completed, failed };
}

async function processScheduledAction(prisma: PrismaClient, actionId: string, type: ScheduledActionType, payload: Prisma.JsonValue, now: Date, dependencies: DispatcherDependencies) {
  if (type === ScheduledActionType.SEND_MESSAGE) return processMessageSend(prisma, actionId, payload, now, dependencies.emailProvider);
  return processAgentDecision(prisma, actionId, type, payload, now, dependencies);
}

async function processAgentDecision(prisma: PrismaClient, actionId: string, type: ScheduledActionType, payload: Prisma.JsonValue, now: Date, dependencies: DispatcherDependencies) {
  const registrationId = readString(payload, "registrationId");
  const enrollment = await prisma.cadenceEnrollment.findUnique({ where: { registrationId }, include: { registration: { include: { lead: true, event: true, qualification: true, enrichmentSnapshot: true, interestSignals: { orderBy: { occurredAt: "desc" }, take: 8 }, conversation: { include: { messages: { orderBy: { createdAt: "desc" }, take: 8 } } } } } } });
  if (!enrollment) throw new Error("Cadence enrollment not found");
  const { registration } = enrollment;
  const purpose = readOptionalString(payload, "purpose") === ConsentPurpose.COMMERCIAL_FOLLOW_UP ? ConsentPurpose.COMMERCIAL_FOLLOW_UP : ConsentPurpose.EVENT_COMMUNICATION;
  const [consent, suppression, deliveredCount, meeting] = await Promise.all([
    prisma.consentRecord.findFirst({ where: { eventId: registration.eventId, leadId: registration.leadId, purpose, channel: CommunicationChannel.EMAIL, withdrawnAt: null } }),
    prisma.suppression.findFirst({ where: { workspaceId: registration.workspaceId, leadId: registration.leadId, purpose, channel: CommunicationChannel.EMAIL, active: true } }),
    prisma.message.count({ where: { eventId: registration.eventId, leadId: registration.leadId, purpose, direction: MessageDirection.OUTBOUND, status: { in: [MessageStatus.SENT, MessageStatus.DELIVERED] } } }),
    prisma.meeting.findFirst({ where: { registrationId, status: "BOOKED" } })
  ]);
  const policy = evaluateCommunicationPolicy({ now, timezone: registration.event.timezone, purpose, deliveredCount, registrationStatus: registration.status, hasConsent: Boolean(consent), isSuppressed: Boolean(suppression || registration.lead.suppressedAt), hasMeeting: Boolean(meeting) });
  if (!policy.allowed && policy.retryAt) {
    await prisma.scheduledAction.update({ where: { id: actionId }, data: { status: ScheduledActionStatus.PENDING, dueAt: policy.retryAt, leaseUntil: null, lastError: policy.reason } });
    return;
  }
  if (!policy.allowed) {
    await prisma.$transaction([
      prisma.agentDecision.create({ data: { workspaceId: registration.workspaceId, eventId: registration.eventId, leadId: registration.leadId, registrationId, action: readOptionalString(payload, "action") ?? type, status: AgentDecisionStatus.REJECTED, reasonCodes: [policy.reason], rationale: "Communication policy rejected the action.", input: { actionId }, policyVersion: "communication-v2", policyResult: policy } }),
      prisma.scheduledAction.update({ where: { id: actionId }, data: { status: ScheduledActionStatus.CANCELLED, completedAt: now, leaseUntil: null, lastError: policy.reason } })
    ]);
    return;
  }

  const action = readOptionalString(payload, "action") ?? type.toLowerCase();
  const tokens = await createPublicActionTokens(prisma, registration, purpose, now);
  const context = buildContext(registration, action, purpose, tokens, dependencies.environment.PUBLIC_APP_URL ?? "http://localhost:5173");
  const draft = await draftMessage(context, registration.workspaceId, registration.id, action, dependencies);
  const contextHash = createHash("sha256").update(JSON.stringify(context)).digest("hex");
  await prisma.$transaction(async (tx) => {
    const conversation = await tx.conversation.upsert({ where: { registrationId }, create: { workspaceId: registration.workspaceId, eventId: registration.eventId, leadId: registration.leadId, registrationId }, update: {} });
    const message = await tx.message.create({ data: { workspaceId: registration.workspaceId, eventId: registration.eventId, leadId: registration.leadId, conversationId: conversation.id, direction: MessageDirection.OUTBOUND, channel: CommunicationChannel.EMAIL, purpose, status: MessageStatus.SCHEDULED, subject: draft.subject, body: draft.body, scheduledAt: now } });
    await tx.agentDecision.create({ data: { workspaceId: registration.workspaceId, eventId: registration.eventId, leadId: registration.leadId, registrationId, action, status: AgentDecisionStatus.APPROVED, reasonCodes: ["POLICY_APPROVED", draft.provider === "deterministic" ? "SAFE_FALLBACK" : "LLM_STRUCTURED_DRAFT"], rationale: draft.rationale, input: { actionId, qualification: registration.qualification?.status ?? null, contextKeys: Object.keys(context) }, output: { messageId: message.id, subject: draft.subject }, policyVersion: "communication-v2", policyResult: policy, promptVersion: "engagement-draft-v1", contextHash, model: draft.model } });
    await tx.scheduledAction.update({ where: { id: actionId }, data: { status: ScheduledActionStatus.COMPLETED, completedAt: now, leaseUntil: null } });
    await tx.scheduledAction.upsert({ where: { idempotencyKey: `send-message:${message.id}` }, create: { workspaceId: registration.workspaceId, enrollmentId: enrollment.id, type: ScheduledActionType.SEND_MESSAGE, dueAt: now, idempotencyKey: `send-message:${message.id}`, payload: { messageId: message.id, registrationId } }, update: {} });
    await tx.cadenceEnrollment.update({ where: { id: enrollment.id }, data: { currentStep: { increment: 1 } } });
  });
}

async function processMessageSend(prisma: PrismaClient, actionId: string, payload: Prisma.JsonValue, now: Date, emailProvider: EmailProvider) {
  const messageId = readString(payload, "messageId");
  const message = await prisma.message.findUnique({ where: { id: messageId }, include: { lead: true, event: true, conversation: { include: { registration: true } } } });
  if (!message) throw new Error("Scheduled message not found");
  if (message.status === MessageStatus.DELIVERED || message.status === MessageStatus.SENT) {
    await prisma.scheduledAction.update({ where: { id: actionId }, data: { status: ScheduledActionStatus.COMPLETED, completedAt: now, leaseUntil: null } });
    return;
  }
  const [consent, suppression, deliveredCount, meeting] = await Promise.all([
    prisma.consentRecord.findFirst({ where: { eventId: message.eventId, leadId: message.leadId, purpose: message.purpose, channel: message.channel, withdrawnAt: null } }),
    prisma.suppression.findFirst({ where: { workspaceId: message.workspaceId, leadId: message.leadId, purpose: message.purpose, channel: message.channel, active: true } }),
    prisma.message.count({ where: { eventId: message.eventId, leadId: message.leadId, purpose: message.purpose, direction: MessageDirection.OUTBOUND, status: { in: [MessageStatus.SENT, MessageStatus.DELIVERED] } } }),
    prisma.meeting.findFirst({ where: { leadId: message.leadId, eventId: message.eventId, status: "BOOKED" } })
  ]);
  const policy = evaluateCommunicationPolicy({ now, timezone: message.event.timezone, purpose: message.purpose, deliveredCount, registrationStatus: message.conversation.registration.status, hasConsent: Boolean(consent), isSuppressed: Boolean(suppression || message.lead.suppressedAt), hasMeeting: Boolean(meeting) });
  if (!policy.allowed) {
    if (policy.retryAt) {
      await prisma.scheduledAction.update({ where: { id: actionId }, data: { status: ScheduledActionStatus.PENDING, dueAt: policy.retryAt, leaseUntil: null, lastError: policy.reason } });
      return;
    }
    await prisma.$transaction([prisma.message.update({ where: { id: message.id }, data: { status: MessageStatus.SUPPRESSED, failureCode: policy.reason } }), prisma.scheduledAction.update({ where: { id: actionId }, data: { status: ScheduledActionStatus.CANCELLED, completedAt: now, leaseUntil: null, lastError: policy.reason } })]);
    return;
  }
  const delivery = await emailProvider.send({ messageId: message.id, to: message.lead.workEmail, subject: message.subject ?? "Vigil Summit", body: message.body });
  await prisma.$transaction([
    prisma.message.update({ where: { id: message.id }, data: { status: delivery.deliveredAt ? MessageStatus.DELIVERED : MessageStatus.SENT, providerMessageId: delivery.providerMessageId, sentAt: delivery.acceptedAt, deliveredAt: delivery.deliveredAt } }),
    prisma.scheduledAction.update({ where: { id: actionId }, data: { status: ScheduledActionStatus.COMPLETED, completedAt: delivery.acceptedAt, leaseUntil: null } })
  ]);
}

async function createPublicActionTokens(prisma: PrismaClient, registration: { id: string; workspaceId: string; eventId: string; leadId: string }, purpose: ConsentPurpose, now: Date) {
  const values: Partial<Record<PublicActionType, string>> = {};
  for (const action of [PublicActionType.CONFIRM, PublicActionType.DECLINE, PublicActionType.UNSUBSCRIBE]) {
    const raw = randomBytes(24).toString("base64url");
    await prisma.publicActionToken.create({ data: { workspaceId: registration.workspaceId, eventId: registration.eventId, leadId: registration.leadId, registrationId: registration.id, tokenHash: createHash("sha256").update(raw).digest("hex"), action, purpose, expiresAt: new Date(now.getTime() + 30 * 86_400_000) } });
    values[action] = raw;
  }
  return values as Record<PublicActionType, string>;
}

function buildContext(registration: any, action: string, purpose: ConsentPurpose, tokens: Record<PublicActionType, string>, publicUrl: string) {
  return {
    action, purpose,
    lead: { firstName: registration.lead.fullName.trim().split(/\s+/)[0], jobTitle: registration.enrichmentSnapshot?.jobTitle ?? registration.lead.jobTitle, companyName: registration.enrichmentSnapshot?.companyName ?? registration.lead.companyName, industry: registration.enrichmentSnapshot?.companyIndustry, employeeRange: registration.enrichmentSnapshot?.companyEmployeeRange },
    event: { name: registration.event.name, startsAt: registration.event.startsAt, location: registration.event.location, agenda: registration.event.agenda },
    interests: registration.interestSignals.map((signal: any) => ({ source: signal.source, kind: signal.kind, value: signal.value, confidence: signal.confidence })),
    memory: { summary: registration.conversation?.summary ?? null, recentMessages: (registration.conversation?.messages ?? []).map((message: any) => ({ direction: message.direction, body: message.body.slice(0, 500) })) },
    links: { confirm: `${publicUrl}/engagement/action/${tokens.CONFIRM}`, decline: `${publicUrl}/engagement/action/${tokens.DECLINE}`, unsubscribe: `${publicUrl}/engagement/action/${tokens.UNSUBSCRIBE}` }
  };
}

async function draftMessage(context: any, workspaceId: string, registrationId: string, action: string, dependencies: DispatcherDependencies) {
  const provider = dependencies.environment.ENGAGEMENT_AI_PROVIDER ?? "deterministic";
  const fallback = deterministicDraft(context);
  if (provider === "deterministic") return fallback;
  const result = await dependencies.aiClient.runPrompt({ workspaceId, workflowId: context.event.name, executionId: registrationId, nodeExecutionId: `engagement:${action}`, nodeId: "engagement-draft", correlationId: `registration:${registrationId}`, input: context, prompt: "Draft one concise B2B event email. Return strict JSON with subject, body, rationale. Use only provided facts and include the appropriate links.", systemPrompt: "You are Vigil Summit's bounded engagement writer. Never invent facts. Respect purpose, consent and the supplied links.", provider, credentialId: dependencies.environment.ENGAGEMENT_AI_CREDENTIAL_ID, model: dependencies.environment.ENGAGEMENT_AI_MODEL ?? "claude-sonnet-4-20250514", temperature: 0.2 });
  const summary = typeof result.summary === "string" ? result.summary : "";
  try {
    const parsed = JSON.parse(summary) as { subject?: unknown; body?: unknown; rationale?: unknown };
    if (typeof parsed.subject === "string" && typeof parsed.body === "string") return { subject: parsed.subject.slice(0, 160), body: parsed.body.slice(0, 10_000), rationale: typeof parsed.rationale === "string" ? parsed.rationale : "Claude generated a fact-grounded draft.", provider, model: typeof result.model === "string" ? result.model : provider };
  } catch { logger.warn("Engagement model returned non-JSON output; using safe fallback", { registrationId }); }
  return { ...fallback, rationale: "Model output failed schema validation; deterministic fallback used." };
}

function deterministicDraft(context: any) {
  const followUp = context.purpose === ConsentPurpose.COMMERCIAL_FOLLOW_UP;
  const subject = followUp ? `Proximo passo apos o ${context.event.name}` : `${context.lead.firstName}, sua participacao no ${context.event.name}`;
  const body = followUp
    ? `Ola, ${context.lead.firstName}. Obrigado pelo interesse no ${context.event.name}. Podemos conversar sobre ${context.interests[0]?.value ?? "os temas do evento"}?\n\nResponda com um horario conveniente.\n\nCancelar contato: ${context.links.unsubscribe}`
    : `Ola, ${context.lead.firstName}. Sua inscricao no ${context.event.name} esta registrada.\n\nConfirmar: ${context.links.confirm}\nNao poderei: ${context.links.decline}\n\nCancelar comunicacoes: ${context.links.unsubscribe}`;
  return { subject, body, rationale: "Deterministic fact-grounded fallback.", provider: "deterministic", model: "engagement-template-v2" };
}

function createDependencies(): DispatcherDependencies {
  return { emailProvider: createEmailProvider(), aiClient: new AiOrchestratorClient(process.env.AI_ORCHESTRATOR_URL ?? "http://ai-orchestrator:8000", Number(process.env.AI_ORCHESTRATOR_TIMEOUT_MS ?? 30_000)), environment: process.env };
}

function readString(payload: Prisma.JsonValue, key: string): string {
  const value = readOptionalString(payload, key);
  if (!value) throw new Error(`Missing action payload field: ${key}`);
  return value;
}

function readOptionalString(payload: Prisma.JsonValue, key: string): string | undefined {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) throw new Error("Invalid action payload");
  const value = payload[key];
  return typeof value === "string" && value ? value : undefined;
}
