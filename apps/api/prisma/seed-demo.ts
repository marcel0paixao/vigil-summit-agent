import { PrismaClient, WorkspaceRole } from "@prisma/client/index";
import { WORKFLOW_NODE_TYPES, type WorkflowDefinition } from "@flowpilot/contracts";
import { hash } from "bcryptjs";
import { createCipheriv, createHash, randomBytes } from "node:crypto";
import { config } from "dotenv";

config({ path: new URL("../../../.env", import.meta.url), quiet: true });

process.env.DATABASE_URL ??= "postgresql://flowpilot:flowpilot@localhost:5432/flowpilot";
process.env.JWT_SECRET ??= "local-demo-secret-with-at-least-twenty-four-characters";

const prisma = new PrismaClient();

const demoPassword = "correct horse battery staple";
const leadEnrichmentDefinition = {
  nodes: [
    {
      id: "manual-trigger",
      type: WORKFLOW_NODE_TYPES.manualTrigger,
      name: "Manual Trigger",
      config: {}
    },
    {
      id: "normalize-lead",
      type: WORKFLOW_NODE_TYPES.transformAction,
      name: "Normalize Lead",
      config: {
        mode: "pick",
        pick: ["leadId", "email"]
      }
    },
    {
      id: "enrichment-request",
      type: WORKFLOW_NODE_TYPES.httpRequestAction,
      name: "Request Enrichment",
      config: {
        mode: "mock",
        method: "POST",
        url: "https://example.com/api/enrich-lead",
        headers: {
          "content-type": "application/json"
        },
        body: {
          source: "flowpilot-demo"
        },
        timeoutMs: 5000
      }
    }
  ],
  edges: [
    {
      id: "edge-manual-to-normalize",
      sourceNodeId: "manual-trigger",
      targetNodeId: "normalize-lead"
    },
    {
      id: "edge-normalize-to-enrichment",
      sourceNodeId: "normalize-lead",
      targetNodeId: "enrichment-request"
    }
  ]
} satisfies WorkflowDefinition;

const incidentTriageDefinition = {
  nodes: [
    {
      id: "manual-trigger",
      type: WORKFLOW_NODE_TYPES.manualTrigger,
      name: "Incident Intake",
      config: {}
    },
    {
      id: "normalize-incident",
      type: WORKFLOW_NODE_TYPES.transformAction,
      name: "Normalize Incident",
      config: {
        mode: "pick",
        pick: [
          "incidentId",
          "customer",
          "severity",
          "service",
          "reportedBy",
          "slaMinutes",
          "message"
        ]
      }
    },
    {
      id: "severity-router",
      type: WORKFLOW_NODE_TYPES.conditionAction,
      name: "Severity Check",
      config: {
        field: "severity",
        operator: "equals",
        value: "high",
        trueLabel: "urgent_incident",
        falseLabel: "standard_incident"
      }
    },
    {
      id: "account-context",
      type: WORKFLOW_NODE_TYPES.httpRequestAction,
      name: "Customer Context Lookup",
      config: {
        mode: "mock",
        method: "POST",
        url: "https://api.flowpilot.local/customer-health",
        headers: {
          "x-demo": "incident-triage"
        },
        body: {
          source: "flowpilot-demo",
          dataset: "customer-health-snapshot"
        },
        timeoutMs: 5000
      }
    },
    {
      id: "ai-triage-plan",
      type: WORKFLOW_NODE_TYPES.aiPromptAction,
      name: "AI Triage Plan",
      config: {
        provider: "deterministic",
        model: "mock-flowpilot-llm",
        temperature: 0.2,
        systemPrompt:
          "You are an incident commander for a SaaS workflow automation platform. Be concise and operational.",
        prompt:
          "In Portuguese, create a compact incident triage plan with: severity rationale, first 3 actions, customer update, and metrics to watch. Use the workflow input as context."
      }
    },
    {
      id: "final-output",
      type: WORKFLOW_NODE_TYPES.transformAction,
      name: "Portfolio Output",
      config: {
        mode: "pick",
        pick: ["summary", "provider", "model", "tokens", "trace"]
      }
    }
  ],
  edges: [
    {
      id: "edge-manual-normalize",
      sourceNodeId: "manual-trigger",
      targetNodeId: "normalize-incident"
    },
    {
      id: "edge-normalize-condition",
      sourceNodeId: "normalize-incident",
      targetNodeId: "severity-router"
    },
    {
      id: "edge-condition-context",
      sourceNodeId: "severity-router",
      targetNodeId: "account-context"
    },
    {
      id: "edge-context-ai",
      sourceNodeId: "account-context",
      targetNodeId: "ai-triage-plan"
    },
    {
      id: "edge-ai-final",
      sourceNodeId: "ai-triage-plan",
      targetNodeId: "final-output"
    }
  ]
} satisfies WorkflowDefinition;
const demoUsers = [
  {
    email: "owner@acme.test",
    displayName: "Acme Owner",
    role: WorkspaceRole.OWNER
  },
  {
    email: "admin@acme.test",
    displayName: "Acme Admin",
    role: WorkspaceRole.ADMIN
  },
  {
    email: "member@acme.test",
    displayName: "Acme Member",
    role: WorkspaceRole.MEMBER
  },
  {
    email: "viewer@acme.test",
    displayName: "Acme Viewer",
    role: WorkspaceRole.VIEWER
  }
] as const;

async function main() {
  const passwordHash = await hash(demoPassword, 12);
  const workspace = await prisma.workspace.upsert({
    where: {
      slug: "acme-automation"
    },
    create: {
      name: "Acme Automation",
      slug: "acme-automation"
    },
    update: {
      name: "Acme Automation"
    }
  });

  const seededUsers = await Promise.all(
    demoUsers.map(async (demoUser) => {
      const user = await prisma.user.upsert({
        where: {
          email: demoUser.email
        },
        create: {
          email: demoUser.email,
          displayName: demoUser.displayName,
          passwordHash
        },
        update: {
          displayName: demoUser.displayName,
          passwordHash
        }
      });

      const membership = await prisma.workspaceMember.upsert({
        where: {
          workspaceId_userId: {
            workspaceId: workspace.id,
            userId: user.id
          }
        },
        create: {
          workspaceId: workspace.id,
          userId: user.id,
          role: demoUser.role
        },
        update: {
          role: demoUser.role
        }
      });

      return {
        user,
        membership
      };
    })
  );
  const ownerUser = seededUsers.find(({ membership }) => membership.role === WorkspaceRole.OWNER)?.user;
  const claudeCredential = encryptCredential("sk-ant-demo-placeholder");
  const geminiCredential = encryptCredential("gemini-demo-placeholder");

  await prisma.integrationCredential.upsert({
    where: {
      workspaceId_type_name: {
        workspaceId: workspace.id,
        type: "claude",
        name: "Demo Claude key"
      }
    },
    create: {
      workspaceId: workspace.id,
      createdByUserId: ownerUser?.id,
      name: "Demo Claude key",
      type: "claude",
      kind: "llm",
      capabilities: ["llm.chat", "llm.structured_output"],
      encryptedValue: claudeCredential.encryptedValue,
      iv: claudeCredential.iv,
      authTag: claudeCredential.authTag
    },
    update: {
      kind: "llm",
      capabilities: ["llm.chat", "llm.structured_output"],
      encryptedValue: claudeCredential.encryptedValue,
      iv: claudeCredential.iv,
      authTag: claudeCredential.authTag
    }
  });

  await prisma.integrationCredential.upsert({
    where: {
      workspaceId_type_name: {
        workspaceId: workspace.id,
        type: "gemini",
        name: "Demo Gemini key"
      }
    },
    create: {
      workspaceId: workspace.id,
      createdByUserId: ownerUser?.id,
      name: "Demo Gemini key",
      type: "gemini",
      kind: "llm",
      capabilities: ["llm.chat", "llm.structured_output"],
      encryptedValue: geminiCredential.encryptedValue,
      iv: geminiCredential.iv,
      authTag: geminiCredential.authTag
    },
    update: {
      kind: "llm",
      capabilities: ["llm.chat", "llm.structured_output"],
      encryptedValue: geminiCredential.encryptedValue,
      iv: geminiCredential.iv,
      authTag: geminiCredential.authTag
    }
  });

  const workflow = await prisma.workflow.upsert({
    where: {
      workspaceId_slug: {
        workspaceId: workspace.id,
        slug: "lead-enrichment"
      }
    },
    create: {
      workspaceId: workspace.id,
      name: "Lead Enrichment",
      slug: "lead-enrichment",
      description: "Demo workflow for testing workspace-scoped workflow APIs.",
      versions: {
        create: {
          version: 1,
          definition: leadEnrichmentDefinition
        }
      }
    },
    update: {
      name: "Lead Enrichment",
      description: "Demo workflow for testing workspace-scoped workflow APIs."
    }
  });

  await prisma.workflowVersion.upsert({
    where: {
      workflowId_version: {
        workflowId: workflow.id,
        version: 1
      }
    },
    create: {
      workflowId: workflow.id,
      version: 1,
      definition: leadEnrichmentDefinition
    },
    update: {
      definition: leadEnrichmentDefinition
    }
  });

  const incidentTriageWorkflow = await prisma.workflow.upsert({
    where: {
      workspaceId_slug: {
        workspaceId: workspace.id,
        slug: "demo-real-ai-incident-triage"
      }
    },
    create: {
      workspaceId: workspace.id,
      name: "Demo - Real AI Incident Triage",
      slug: "demo-real-ai-incident-triage",
      description:
        "Portfolio workflow that normalizes an incident, evaluates severity, enriches context, calls an AI prompt node, and records execution observability.",
      versions: {
        create: {
          version: 1,
          definition: incidentTriageDefinition
        }
      }
    },
    update: {
      name: "Demo - Real AI Incident Triage",
      description:
        "Portfolio workflow that normalizes an incident, evaluates severity, enriches context, calls an AI prompt node, and records execution observability."
    }
  });

  await prisma.workflowVersion.upsert({
    where: {
      workflowId_version: {
        workflowId: incidentTriageWorkflow.id,
        version: 1
      }
    },
    create: {
      workflowId: incidentTriageWorkflow.id,
      version: 1,
      definition: incidentTriageDefinition
    },
    update: {
      definition: incidentTriageDefinition
    }
  });

  console.log("Demo seed completed");
  console.log("");
  console.log(`Workspace: ${workspace.name}`);
  console.log(`Workspace ID: ${workspace.id}`);
  console.log(`Workspace slug: ${workspace.slug}`);
  console.log(`Workflow: ${workflow.name}`);
  console.log(`Workflow ID: ${workflow.id}`);
  console.log(`Workflow slug: ${workflow.slug}`);
  console.log(`Portfolio workflow: ${incidentTriageWorkflow.name}`);
  console.log(`Portfolio workflow ID: ${incidentTriageWorkflow.id}`);
  console.log(`Portfolio workflow slug: ${incidentTriageWorkflow.slug}`);
  console.log("Seeded credential: Demo Claude key / claude / placeholder secret");
  console.log("Seeded credential: Demo Gemini key / gemini / placeholder secret");
  console.log("");
  console.log("Demo credentials:");

  for (const { user, membership } of seededUsers) {
    console.log(`- ${membership.role}: ${user.email} / ${demoPassword}`);
  }

  console.log("");
  console.log("Example login:");
  console.log(
    `curl -X POST http://localhost:3000/api/auth/login -H "Content-Type: application/json" -d '{"email":"owner@acme.test","password":"${demoPassword}","workspaceId":"${workspace.id}"}'`
  );
}

function encryptCredential(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return {
    encryptedValue: encrypted.toString("base64"),
    iv: iv.toString("base64"),
    authTag: authTag.toString("base64")
  };
}

function getEncryptionKey() {
  const secret = process.env.CREDENTIAL_ENCRYPTION_KEY ?? process.env.JWT_SECRET;

  if (!secret) {
    throw new Error("CREDENTIAL_ENCRYPTION_KEY or JWT_SECRET is required to seed credentials");
  }

  return createHash("sha256").update(secret).digest();
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
