import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";

import { PrismaClient } from "@prisma/client/index";
import { WORKFLOW_NODE_TYPES, type WorkflowDefinition } from "@flowpilot/contracts";

import { createTestApp } from "../../test/create-test-app.js";

process.env.DATABASE_URL ??= "postgresql://flowpilot:flowpilot@localhost:5432/flowpilot_test";

const prisma = new PrismaClient();
let app: Awaited<ReturnType<typeof createTestApp>>;

before(async () => {
  app = await createTestApp();
});

beforeEach(async () => {
  await prisma.outboxMessage.deleteMany();
  await prisma.workflowAiTrace.deleteMany();
  await prisma.workflowExecutionEvent.deleteMany();
  await prisma.workflowNodeExecution.deleteMany();
  await prisma.workflowExecution.deleteMany();
  await prisma.workflowVersion.deleteMany();
  await prisma.workflow.deleteMany();
  await prisma.workspaceMember.deleteMany();
  await prisma.workspace.deleteMany();
  await prisma.user.deleteMany();
});

after(async () => {
  await app.close();
  await prisma.$disconnect();
});

test("workspace HTTP flow enforces auth, membership, and member management", async () => {
  const owner = await register("owner@example.test", "Owner Example");
  assert.equal(owner.statusCode, 201);

  const ownerLogin = await login("owner@example.test");
  assert.equal(ownerLogin.statusCode, 200);
  const ownerSession = ownerLogin.json<{
    accessToken: string;
    workspace: null;
  }>();

  const unauthorizedList = await app.inject({
    method: "GET",
    url: "/api/workspaces"
  });
  assert.equal(unauthorizedList.statusCode, 401);

  const workspaceResponse = await app.inject({
    method: "POST",
    url: "/api/workspaces",
    headers: bearer(ownerSession.accessToken),
    payload: {
      name: "Integration Workspace",
      slug: "integration-workspace"
    }
  });
  assert.equal(workspaceResponse.statusCode, 201);

  const workspace = workspaceResponse.json<{
    id: string;
    members: Array<{ id: string; role: string; user: { email: string } }>;
  }>();
  assert.equal(workspace.members[0]?.role, "OWNER");
  assert.equal(workspace.members[0]?.user.email, "owner@example.test");

  const member = await register("member@example.test", "Member Example");
  assert.equal(member.statusCode, 201);

  const createdMemberResponse = await app.inject({
    method: "POST",
    url: `/api/workspaces/${workspace.id}/members`,
    headers: bearer(ownerSession.accessToken),
    payload: {
      email: "member@example.test",
      role: "VIEWER"
    }
  });
  assert.equal(createdMemberResponse.statusCode, 201);

  const createdMember = createdMemberResponse.json<{ id: string; role: string }>();
  assert.equal(createdMember.role, "VIEWER");

  const updatedMemberResponse = await app.inject({
    method: "PATCH",
    url: `/api/workspaces/${workspace.id}/members/${createdMember.id}`,
    headers: bearer(ownerSession.accessToken),
    payload: {
      role: "MEMBER"
    }
  });
  assert.equal(updatedMemberResponse.statusCode, 200);
  assert.equal(updatedMemberResponse.json<{ role: string }>().role, "MEMBER");

  const memberLogin = await login("member@example.test", workspace.id);
  assert.equal(memberLogin.statusCode, 200);
  const memberSession = memberLogin.json<{ accessToken: string }>();

  const forbiddenAdd = await app.inject({
    method: "POST",
    url: `/api/workspaces/${workspace.id}/members`,
    headers: bearer(memberSession.accessToken),
    payload: {
      email: "blocked@example.test",
      role: "VIEWER"
    }
  });
  assert.equal(forbiddenAdd.statusCode, 403);

  const membersResponse = await app.inject({
    method: "GET",
    url: `/api/workspaces/${workspace.id}/members`,
    headers: bearer(ownerSession.accessToken)
  });
  assert.equal(membersResponse.statusCode, 200);
  assert.equal(membersResponse.json<unknown[]>().length, 2);

  const removeResponse = await app.inject({
    method: "DELETE",
    url: `/api/workspaces/${workspace.id}/members/${createdMember.id}`,
    headers: bearer(ownerSession.accessToken)
  });
  assert.equal(removeResponse.statusCode, 200);
  assert.deepEqual(removeResponse.json(), { removed: true });
});

test("workflow HTTP flow creates, lists, details, and enforces workspace roles", async () => {
  await register("owner@example.test", "Owner Example");
  const ownerLogin = await login("owner@example.test");
  const ownerToken = ownerLogin.json<{ accessToken: string }>().accessToken;
  const workspace = await app.inject({
    method: "POST",
    url: "/api/workspaces",
    headers: bearer(ownerToken),
    payload: {
      name: "Workflow Workspace",
      slug: "workflow-workspace"
    }
  });
  const workspaceId = workspace.json<{ id: string }>().id;

  const invalidWorkflowResponse = await app.inject({
    method: "POST",
    url: `/api/workspaces/${workspaceId}/workflows`,
    headers: bearer(ownerToken),
    payload: {}
  });
  assert.equal(invalidWorkflowResponse.statusCode, 400);

  const invalidWorkflowDefinitionResponse = await app.inject({
    method: "POST",
    url: `/api/workspaces/${workspaceId}/workflows`,
    headers: bearer(ownerToken),
    payload: {
      name: "Broken Workflow",
      slug: "broken-workflow",
      definition: {
        nodes: [
          {
            id: "manual-trigger",
            type: "trigger.manual",
            name: "Manual Trigger",
            config: {}
          }
        ],
        edges: [
          {
            id: "edge-to-missing-node",
            sourceNodeId: "manual-trigger",
            targetNodeId: "missing-node"
          }
        ]
      }
    }
  });
  assert.equal(invalidWorkflowDefinitionResponse.statusCode, 400);

  const workflowDefinition = workflowDefinitionFixture();
  const createWorkflowResponse = await app.inject({
    method: "POST",
    url: `/api/workspaces/${workspaceId}/workflows`,
    headers: bearer(ownerToken),
    payload: {
      name: "Lead Enrichment",
      slug: "lead-enrichment",
      definition: workflowDefinition
    }
  });
  assert.equal(createWorkflowResponse.statusCode, 201);

  const workflow = createWorkflowResponse.json<{
    id: string;
    status: string;
    currentVersion: {
      id: string;
      version: number;
      definition: { nodes: unknown[]; edges: unknown[] };
    };
  }>();
  assert.equal(workflow.status, "DRAFT");
  assert.equal(workflow.currentVersion.version, 1);
  assert.deepEqual(workflow.currentVersion.definition, workflowDefinition);

  const listResponse = await app.inject({
    method: "GET",
    url: `/api/workspaces/${workspaceId}/workflows`,
    headers: bearer(ownerToken)
  });
  assert.equal(listResponse.statusCode, 200);
  assert.equal(listResponse.json<unknown[]>().length, 1);

  const detailResponse = await app.inject({
    method: "GET",
    url: `/api/workspaces/${workspaceId}/workflows/${workflow.id}`,
    headers: bearer(ownerToken)
  });
  assert.equal(detailResponse.statusCode, 200);
  assert.equal(detailResponse.json<{ id: string }>().id, workflow.id);

  const invalidExecutionResponse = await app.inject({
    method: "POST",
    url: `/api/workspaces/${workspaceId}/workflows/${workflow.id}/executions`,
    headers: bearer(ownerToken),
    payload: {
      input: "not-an-object"
    }
  });
  assert.equal(invalidExecutionResponse.statusCode, 400);

  const executionResponse = await app.inject({
    method: "POST",
    url: `/api/workspaces/${workspaceId}/workflows/${workflow.id}/executions`,
    headers: bearer(ownerToken),
    payload: {
      input: {
        leadId: "lead-1"
      }
    }
  });
  assert.equal(executionResponse.statusCode, 201);

  const execution = executionResponse.json<{
    id: string;
    workflowId: string;
    workflowVersionId: string;
    requestedByUserId: string;
    status: string;
    input: { leadId: string };
  }>();
  assert.equal(execution.workflowId, workflow.id);
  assert.equal(execution.workflowVersionId, workflow.currentVersion.id);
  assert.equal(execution.status, "PENDING");
  assert.equal(execution.input.leadId, "lead-1");

  const executionListResponse = await app.inject({
    method: "GET",
    url: `/api/workspaces/${workspaceId}/workflows/${workflow.id}/executions`,
    headers: bearer(ownerToken)
  });
  assert.equal(executionListResponse.statusCode, 200);
  assert.equal(executionListResponse.json<{ id: string }[]>()[0]?.id, execution.id);

  const executionDetailResponse = await app.inject({
    method: "GET",
    url: `/api/workspaces/${workspaceId}/workflows/${workflow.id}/executions/${execution.id}`,
    headers: bearer(ownerToken)
  });
  assert.equal(executionDetailResponse.statusCode, 200);
  assert.equal(executionDetailResponse.json<{ id: string }>().id, execution.id);

  await prisma.workflowExecutionEvent.create({
    data: {
      workspaceId,
      workflowId: workflow.id,
      executionId: execution.id,
      eventName: "workflow.execution.started",
      eventId: "integration-started-event-1",
      occurredAt: new Date("2026-05-04T10:00:00.000Z"),
      producer: "execution-worker",
      payload: {
        workflowId: workflow.id,
        executionId: execution.id
      }
    }
  });

  const executionEventsResponse = await app.inject({
    method: "GET",
    url: `/api/workspaces/${workspaceId}/workflows/${workflow.id}/executions/${execution.id}/events`,
    headers: bearer(ownerToken)
  });
  assert.equal(executionEventsResponse.statusCode, 200);
  const executionEvents = executionEventsResponse.json<
    Array<{ executionId: string; eventName: string; eventId: string }>
  >();
  assert.equal(executionEvents.length, 1);
  assert.equal(executionEvents[0]?.executionId, execution.id);
  assert.equal(executionEvents[0]?.eventName, "workflow.execution.started");
  assert.equal(executionEvents[0]?.eventId, "integration-started-event-1");

  await prisma.workflowNodeExecution.create({
    data: {
      workspaceId,
      workflowId: workflow.id,
      executionId: execution.id,
      nodeId: "normalize-lead",
      nodeType: "action.transform",
      status: "PENDING",
      input: {
        leadId: "lead-1",
        email: "lead@example.test"
      }
    }
  });

  const executionNodesResponse = await app.inject({
    method: "GET",
    url: `/api/workspaces/${workspaceId}/workflows/${workflow.id}/executions/${execution.id}/nodes`,
    headers: bearer(ownerToken)
  });
  assert.equal(executionNodesResponse.statusCode, 200);
  const executionNodes = executionNodesResponse.json<
    Array<{ executionId: string; nodeId: string; nodeType: string; status: string }>
  >();
  assert.equal(executionNodes.length, 1);
  assert.equal(executionNodes[0]?.executionId, execution.id);
  assert.equal(executionNodes[0]?.nodeId, "normalize-lead");
  assert.equal(executionNodes[0]?.nodeType, "action.transform");
  assert.equal(executionNodes[0]?.status, "PENDING");

  const executionSummaryResponse = await app.inject({
    method: "GET",
    url: `/api/workspaces/${workspaceId}/workflows/${workflow.id}/executions/${execution.id}/summary`,
    headers: bearer(ownerToken)
  });
  assert.equal(executionSummaryResponse.statusCode, 200);
  const executionSummary = executionSummaryResponse.json<{
    execution: { id: string };
    nodes: Array<{ nodeId: string }>;
    events: Array<{ eventName: string }>;
    aiTraces: Array<{ id: string }>;
  }>();
  assert.equal(executionSummary.execution.id, execution.id);
  assert.equal(executionSummary.nodes[0]?.nodeId, "normalize-lead");
  assert.equal(executionSummary.events[0]?.eventName, "workflow.execution.started");
  assert.deepEqual(executionSummary.aiTraces, []);

  const missingExecutionResponse = await app.inject({
    method: "GET",
    url: `/api/workspaces/${workspaceId}/workflows/${workflow.id}/executions/00000000-0000-0000-0000-000000000000`,
    headers: bearer(ownerToken)
  });
  assert.equal(missingExecutionResponse.statusCode, 404);

  const missingExecutionEventsResponse = await app.inject({
    method: "GET",
    url: `/api/workspaces/${workspaceId}/workflows/${workflow.id}/executions/00000000-0000-0000-0000-000000000000/events`,
    headers: bearer(ownerToken)
  });
  assert.equal(missingExecutionEventsResponse.statusCode, 404);

  const missingExecutionNodesResponse = await app.inject({
    method: "GET",
    url: `/api/workspaces/${workspaceId}/workflows/${workflow.id}/executions/00000000-0000-0000-0000-000000000000/nodes`,
    headers: bearer(ownerToken)
  });
  assert.equal(missingExecutionNodesResponse.statusCode, 404);

  const missingExecutionSummaryResponse = await app.inject({
    method: "GET",
    url: `/api/workspaces/${workspaceId}/workflows/${workflow.id}/executions/00000000-0000-0000-0000-000000000000/summary`,
    headers: bearer(ownerToken)
  });
  assert.equal(missingExecutionSummaryResponse.statusCode, 404);

  await register("viewer@example.test", "Viewer Example");
  const viewerMember = await app.inject({
    method: "POST",
    url: `/api/workspaces/${workspaceId}/members`,
    headers: bearer(ownerToken),
    payload: {
      email: "viewer@example.test",
      role: "VIEWER"
    }
  });
  assert.equal(viewerMember.statusCode, 201);

  const viewerLogin = await login("viewer@example.test", workspaceId);
  const viewerToken = viewerLogin.json<{ accessToken: string }>().accessToken;
  const forbiddenCreate = await app.inject({
    method: "POST",
    url: `/api/workspaces/${workspaceId}/workflows`,
    headers: bearer(viewerToken),
    payload: {
      name: "Blocked Workflow",
      slug: "blocked-workflow"
    }
  });

  assert.equal(forbiddenCreate.statusCode, 403);

  const viewerExecutionList = await app.inject({
    method: "GET",
    url: `/api/workspaces/${workspaceId}/workflows/${workflow.id}/executions`,
    headers: bearer(viewerToken)
  });
  assert.equal(viewerExecutionList.statusCode, 200);

  const forbiddenExecution = await app.inject({
    method: "POST",
    url: `/api/workspaces/${workspaceId}/workflows/${workflow.id}/executions`,
    headers: bearer(viewerToken),
    payload: {
      input: {}
    }
  });

  assert.equal(forbiddenExecution.statusCode, 403);
});

test("workspace detail rejects cross-tenant access", async () => {
  await register("owner-a@example.test", "Owner A");
  const ownerALogin = await login("owner-a@example.test");
  const ownerAToken = ownerALogin.json<{ accessToken: string }>().accessToken;
  const workspace = await app.inject({
    method: "POST",
    url: "/api/workspaces",
    headers: bearer(ownerAToken),
    payload: {
      name: "Tenant A",
      slug: "tenant-a"
    }
  });
  const workspaceId = workspace.json<{ id: string }>().id;

  await register("owner-b@example.test", "Owner B");
  const ownerBLogin = await login("owner-b@example.test");
  const ownerBToken = ownerBLogin.json<{ accessToken: string }>().accessToken;

  const response = await app.inject({
    method: "GET",
    url: `/api/workspaces/${workspaceId}`,
    headers: bearer(ownerBToken)
  });

  assert.equal(response.statusCode, 403);
});

test("event HTTP flow publishes and registers leads with consent and waitlist handling", async () => {
  await register("event-owner@example.test", "Event Owner");
  const ownerLogin = await login("event-owner@example.test");
  const ownerToken = ownerLogin.json<{ accessToken: string }>().accessToken;
  const workspaceResponse = await app.inject({
    method: "POST",
    url: "/api/workspaces",
    headers: bearer(ownerToken),
    payload: {
      name: "Vigil Integration",
      slug: "vigil-integration"
    }
  });
  assert.equal(workspaceResponse.statusCode, 201);
  const workspaceId = workspaceResponse.json<{ id: string }>().id;

  const createEventResponse = await app.inject({
    method: "POST",
    url: `/api/workspaces/${workspaceId}/events`,
    headers: bearer(ownerToken),
    payload: {
      name: "Vigil Summit Integration",
      slug: "vigil-summit-integration",
      description: "Security and AI leadership event",
      location: "Sao Paulo, SP",
      startsAt: "2026-09-18T09:00:00-03:00",
      endsAt: "2026-09-18T18:00:00-03:00",
      timezone: "America/Sao_Paulo",
      capacity: 1
    }
  });
  assert.equal(createEventResponse.statusCode, 201);
  const event = createEventResponse.json<{ id: string; status: string }>();
  assert.equal(event.status, "DRAFT");

  const unavailableEventResponse = await app.inject({
    method: "GET",
    url: `/api/public/events/${event.id}`
  });
  assert.equal(unavailableEventResponse.statusCode, 404);

  const publishEventResponse = await app.inject({
    method: "PATCH",
    url: `/api/workspaces/${workspaceId}/events/${event.id}/publish`,
    headers: bearer(ownerToken)
  });
  assert.equal(publishEventResponse.statusCode, 200);
  assert.equal(publishEventResponse.json<{ status: string }>().status, "PUBLISHED");

  const publicEventResponse = await app.inject({
    method: "GET",
    url: `/api/public/events/${event.id}`
  });
  assert.equal(publicEventResponse.statusCode, 200);

  const firstRegistrationPayload = {
    fullName: "Mariana Costa",
    workEmail: "mariana@fintech.example",
    jobTitle: "CISO",
    companyName: "Fintech Example",
    companyDomain: "fintech.example",
    interestTopics: ["AI risk", "SOC 2"],
    privacyNoticeVersion: "2026-06-20",
    eventCommunicationConsent: true,
    commercialFollowUpConsent: true
  };
  const firstRegistrationResponse = await app.inject({
    method: "POST",
    url: `/api/public/events/${event.id}/registrations`,
    payload: firstRegistrationPayload
  });
  assert.equal(firstRegistrationResponse.statusCode, 201);
  const firstRegistration = firstRegistrationResponse.json<{
    created: boolean;
    leadId: string;
    registrationId: string;
    status: string;
  }>();
  assert.equal(firstRegistration.created, true);
  assert.equal(firstRegistration.status, "REGISTERED");

  const duplicateRegistrationResponse = await app.inject({
    method: "POST",
    url: `/api/public/events/${event.id}/registrations`,
    payload: firstRegistrationPayload
  });
  assert.equal(duplicateRegistrationResponse.statusCode, 201);
  const duplicateRegistration = duplicateRegistrationResponse.json<{
    created: boolean;
    registrationId: string;
  }>();
  assert.equal(duplicateRegistration.created, false);
  assert.equal(duplicateRegistration.registrationId, firstRegistration.registrationId);

  const waitlistedRegistrationResponse = await app.inject({
    method: "POST",
    url: `/api/public/events/${event.id}/registrations`,
    payload: {
      ...firstRegistrationPayload,
      fullName: "Rafael Mendes",
      workEmail: "rafael@enterprise.example",
      companyName: "Enterprise Example",
      companyDomain: "enterprise.example",
      commercialFollowUpConsent: false
    }
  });
  assert.equal(waitlistedRegistrationResponse.statusCode, 201);
  assert.equal(waitlistedRegistrationResponse.json<{ status: string }>().status, "WAITLISTED");

  assert.equal(await prisma.registration.count({ where: { eventId: event.id } }), 2);
  assert.equal(
    await prisma.consentRecord.count({ where: { leadId: firstRegistration.leadId } }),
    2
  );
  assert.equal(
    await prisma.outboxMessage.count({
      where: { eventName: "lead.enrichment.requested" }
    }),
    2
  );
});

async function register(email: string, displayName: string) {
  return app.inject({
    method: "POST",
    url: "/api/auth/register",
    payload: {
      email,
      displayName,
      password: "correct horse battery staple"
    }
  });
}

async function login(email: string, workspaceId?: string) {
  return app.inject({
    method: "POST",
    url: "/api/auth/login",
    payload: {
      email,
      password: "correct horse battery staple",
      workspaceId
    }
  });
}

function workflowDefinitionFixture(): WorkflowDefinition {
  return {
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
      }
    ],
    edges: [
      {
        id: "edge-manual-to-normalize",
        sourceNodeId: "manual-trigger",
        targetNodeId: "normalize-lead"
      }
    ]
  };
}

function bearer(accessToken: string) {
  return {
    authorization: `Bearer ${accessToken}`
  };
}
