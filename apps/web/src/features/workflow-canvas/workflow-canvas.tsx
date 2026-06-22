import type { WorkflowDefinition, WorkflowNode } from "@flowpilot/contracts";
import {
  addEdge,
  Background,
  applyEdgeChanges,
  applyNodeChanges,
  BaseEdge,
  Controls,
  EdgeLabelRenderer,
  Handle,
  getBezierPath,
  MiniMap,
  Position,
  ReactFlow,
  MarkerType,
  Panel,
  type Connection,
  type Edge,
  type EdgeChange,
  type EdgeProps,
  type Node,
  type NodeChange,
  type NodeProps,
  type ReactFlowInstance
} from "@xyflow/react";
import {
  Bot,
  Braces,
  GitBranch,
  Globe2,
  Maximize2,
  Play,
  RotateCcw,
  Workflow as WorkflowIcon,
  X
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { humanizeIdentifier, cn } from "@/shared/lib/utils";
import { useTheme } from "@/features/theme/theme-provider";
import { Badge } from "@/shared/ui/badge";

interface FlowPilotNodeData extends Record<string, unknown> {
  editable: boolean;
  node: WorkflowNode;
  incomingCount: number;
  outgoingCount: number;
}

interface FlowPilotEdgeData extends Record<string, unknown> {
  editable: boolean;
  onDelete: (edgeId: string) => void;
}

const nodeTypes = {
  flowpilot: FlowPilotNode
};

const edgeTypes = {
  flowpilot: FlowPilotEdge
};

export function WorkflowCanvas({
  definition,
  selectedNodeId,
  selectedEdgeId,
  canvasToolbar,
  editable = false,
  onDefinitionChange,
  onSelectEdge,
  onSelectNode,
  onEditNode
}: {
  definition: WorkflowDefinition;
  selectedNodeId?: string;
  selectedEdgeId?: string;
  canvasToolbar?: ReactNode;
  editable?: boolean;
  onDefinitionChange?: (definition: WorkflowDefinition) => void;
  onSelectEdge?: (edgeId: string | undefined) => void;
  onSelectNode?: (nodeId: string) => void;
  onEditNode?: (nodeId: string) => void;
}) {
  const theme = useTheme();
  const initialElements = useMemo(
    () => toReactFlowElements(definition, selectedNodeId, selectedEdgeId, theme.theme, editable),
    [definition, editable, selectedEdgeId, selectedNodeId, theme.theme]
  );
  const [nodes, setNodes] = useState(initialElements.nodes);
  const [edges, setEdges] = useState(initialElements.edges);
  const [flowInstance, setFlowInstance] =
    useState<ReactFlowInstance<Node<FlowPilotNodeData>, Edge<FlowPilotEdgeData>>>();
  const previousNodeModelKey = useRef(getNodeModelKey(definition));

  useEffect(() => {
    const nextElements = toReactFlowElements(definition, selectedNodeId, selectedEdgeId, theme.theme, editable);
    const nextNodeModelKey = getNodeModelKey(definition);
    const shouldPreservePositions = nextNodeModelKey === previousNodeModelKey.current;

    setNodes((currentNodes) =>
      shouldPreservePositions ? preserveNodePositions(nextElements.nodes, currentNodes) : nextElements.nodes
    );
    setEdges(nextElements.edges);
    previousNodeModelKey.current = nextNodeModelKey;
  }, [definition, editable, selectedEdgeId, selectedNodeId, theme.theme]);

  function updateDefinitionFromEdges(nextEdges: Edge[]) {
    onDefinitionChange?.({
      ...definition,
      edges: nextEdges.map((edge) => ({
        id: edge.id,
        sourceNodeId: edge.source,
        targetNodeId: edge.target
      }))
    });
  }

  function updateDefinitionFromNodePosition(nextNode: Node<FlowPilotNodeData>) {
    onDefinitionChange?.({
      ...definition,
      nodes: definition.nodes.map((node) =>
        node.id === nextNode.id
          ? {
              ...node,
              position: {
                x: Math.round(nextNode.position.x),
                y: Math.round(nextNode.position.y)
              }
            }
          : node
      )
    });
  }

  function handleNodesChange(changes: NodeChange<Node<FlowPilotNodeData>>[]) {
    setNodes((currentNodes) => applyNodeChanges(changes, currentNodes));

    const removedNodeIds = changes
      .filter((change) => change.type === "remove")
      .map((change) => change.id);

    if (removedNodeIds.length > 0) {
      onDefinitionChange?.({
        nodes: definition.nodes.filter((node) => !removedNodeIds.includes(node.id)),
        edges: definition.edges.filter(
          (edge) => !removedNodeIds.includes(edge.sourceNodeId) && !removedNodeIds.includes(edge.targetNodeId)
        )
      });
    }
  }

  function handleEdgesChange(changes: EdgeChange<Edge<FlowPilotEdgeData>>[]) {
    setEdges((currentEdges) => {
      const nextEdges = applyEdgeChanges(changes, currentEdges) as Edge<FlowPilotEdgeData>[];
      if (changes.some((change) => change.type === "remove")) {
        updateDefinitionFromEdges(nextEdges);
      }
      return nextEdges;
    });
  }

  function handleConnect(connection: Connection) {
    if (!connection.source || !connection.target || connection.source === connection.target) {
      return;
    }

    const edgeId = `${connection.source}-to-${connection.target}`;
    const nextEdges = addEdge(
      {
        ...connection,
        id: edgeId
      },
      edges
    ) as Edge<FlowPilotEdgeData>[];

    setEdges(nextEdges);
    updateDefinitionFromEdges(nextEdges);
    onSelectEdge?.(edgeId);
  }

  function deleteEdge(edgeId: string) {
    const nextEdges = edges.filter((edge) => edge.id !== edgeId);
    setEdges(nextEdges);
    updateDefinitionFromEdges(nextEdges);
    onSelectEdge?.(undefined);
  }

  const renderedEdges = useMemo(
    () =>
      edges.map((edge) => ({
        ...edge,
        data: {
          ...edge.data,
          editable,
          onDelete: deleteEdge
        }
      })),
    [editable, edges]
  );

  return (
    <ReactFlow
      className="liquid-glass h-full min-h-[36rem] rounded-lg border border-border bg-card lg:min-h-[40rem] 2xl:min-h-[44rem]"
      colorMode={theme.theme}
      deleteKeyCode={editable ? ["Backspace", "Delete"] : null}
      edges={renderedEdges}
      edgeTypes={edgeTypes}
      fitView
      fitViewOptions={{ padding: 0.25 }}
      minZoom={0.45}
      nodes={nodes}
      nodesConnectable={editable}
      nodesDraggable={editable}
      nodesFocusable
      nodeTypes={nodeTypes}
      onConnect={editable ? handleConnect : undefined}
      onEdgesChange={editable ? handleEdgesChange : undefined}
      onEdgeClick={(_, edge) => {
        onSelectEdge?.(edge.id);
      }}
      onInit={setFlowInstance}
      onNodeDragStop={editable ? (_, node) => updateDefinitionFromNodePosition(node) : undefined}
      onNodesChange={editable ? handleNodesChange : undefined}
      panOnScroll
      onNodeClick={(_, node) => {
        onSelectEdge?.(undefined);
        onSelectNode?.(node.id);
      }}
      onNodeDoubleClick={(_, node) => {
        onSelectEdge?.(undefined);
        onSelectNode?.(node.id);
        onEditNode?.(node.id);
      }}
      proOptions={{ hideAttribution: true }}
    >
      {canvasToolbar ? (
        <Panel position="top-left" className="pointer-events-auto">
          {canvasToolbar}
        </Panel>
      ) : null}
      <Panel position="top-right" className="flex items-center gap-2">
        <div className="liquid-glass flex items-center gap-1 rounded-md border border-border bg-card/80 p-1 shadow-sm">
          <span className="px-2 text-xs font-medium text-muted-foreground">
            {editable ? "Editing" : "Viewing"}
          </span>
          <button
            aria-label="Fit view"
            className="flex size-8 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-all hover:-translate-y-px hover:bg-accent hover:text-accent-foreground hover:shadow-sm active:translate-y-0"
            type="button"
            onClick={() => flowInstance?.fitView({ padding: 0.25, duration: 240 })}
          >
            <Maximize2 className="size-4" />
          </button>
          <button
            aria-label="Reset zoom"
            className="flex size-8 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-all hover:-translate-y-px hover:bg-accent hover:text-accent-foreground hover:shadow-sm active:translate-y-0"
            type="button"
            onClick={() => flowInstance?.setViewport({ x: 32, y: 32, zoom: 1 }, { duration: 240 })}
          >
            <RotateCcw className="size-4" />
          </button>
        </div>
      </Panel>
      <Background color={theme.theme === "dark" ? "#6d4c93" : "#d4cee8"} gap={20} />
      <MiniMap pannable zoomable className="!border !border-border !bg-card dark:!bg-card/70" />
      <Controls showInteractive={false} />
    </ReactFlow>
  );
}

function FlowPilotEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  markerEnd,
  selected,
  style,
  data
}: EdgeProps<Edge<FlowPilotEdgeData>>) {
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition
  });
  const editable = Boolean(data?.editable);

  return (
    <>
      <BaseEdge id={id} markerEnd={markerEnd} path={edgePath} style={style} />
      {editable ? (
        <EdgeLabelRenderer>
          <button
            aria-label={`Remove connection ${id}`}
            className={cn(
              "nodrag nopan absolute flex size-6 cursor-pointer items-center justify-center rounded-full border border-border bg-card text-muted-foreground shadow-sm transition-all hover:-translate-y-px hover:bg-destructive hover:text-destructive-foreground hover:shadow-md active:translate-y-0",
              selected && "border-violet-400 text-foreground"
            )}
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              pointerEvents: "all"
            }}
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              data?.onDelete(id);
            }}
          >
            <X className="size-3.5" />
          </button>
        </EdgeLabelRenderer>
      ) : null}
    </>
  );
}

function FlowPilotNode({ data, selected }: NodeProps<Node<FlowPilotNodeData>>) {
  const workflowNode = data.node;
  const Icon = getNodeIcon(workflowNode.type);
  const nodeKind = getNodeKind(workflowNode.type);
  const summary = getNodeSummary(workflowNode);
  const canReceiveInput = data.editable && workflowNode.type !== "trigger.manual";
  const canEmitOutput = data.editable || data.outgoingCount > 0;

  return (
    <div
      className={cn(
        "liquid-glass w-64 rounded-lg border bg-card p-3 text-left shadow-sm transition-colors",
        selected
          ? "border-violet-500 ring-2 ring-violet-500/20 dark:border-purple-300 dark:ring-purple-300/24"
          : "border-border"
      )}
    >
      {data.incomingCount > 0 || canReceiveInput ? (
        <Handle
          className={cn(
            "!size-3 !border-2 !border-background !bg-violet-600 dark:!bg-purple-300",
            data.editable && "!size-4 hover:!scale-125"
          )}
          title="Input"
          type="target"
          position={Position.Left}
        />
      ) : null}
      <div className="flex items-start gap-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-accent text-accent-foreground">
          <Icon className="size-4" />
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant={workflowNode.type.startsWith("trigger.") ? "info" : "outline"}>{nodeKind}</Badge>
            <span className="text-xs text-muted-foreground">{workflowNode.id}</span>
          </div>
          <p className="mt-1 truncate text-sm font-semibold">{workflowNode.name}</p>
          <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">{summary}</p>
        </div>
      </div>
      {canEmitOutput ? (
        <Handle
          className={cn(
            "!size-3 !border-2 !border-background !bg-violet-600 dark:!bg-purple-300",
            data.editable && "!size-4 hover:!scale-125"
          )}
          title="Output"
          type="source"
          position={Position.Right}
        />
      ) : null}
    </div>
  );
}

function toReactFlowElements(
  definition: WorkflowDefinition,
  selectedNodeId: string | undefined,
  selectedEdgeId: string | undefined,
  theme: "light" | "dark",
  editable = false
) {
  const levels = getNodeLevels(definition);
  const lanes = new Map<number, number>();
  const degrees = getNodeDegrees(definition);
  const nodes: Node<FlowPilotNodeData>[] = definition.nodes.map((workflowNode, index) => {
    const level = levels.get(workflowNode.id) ?? index;
    const lane = lanes.get(level) ?? 0;
    lanes.set(level, lane + 1);

    return {
      id: workflowNode.id,
      type: "flowpilot",
      position: {
        x: workflowNode.position?.x ?? level * 300,
        y: workflowNode.position?.y ?? lane * 130
      },
      selected: workflowNode.id === selectedNodeId,
      data: {
        editable,
        node: workflowNode,
        incomingCount: degrees.incoming.get(workflowNode.id) ?? 0,
        outgoingCount: degrees.outgoing.get(workflowNode.id) ?? 0
      }
    };
  });
  const edges: Edge<FlowPilotEdgeData>[] = definition.edges.map((edge) => ({
    id: edge.id,
    type: "flowpilot",
    source: edge.sourceNodeId,
    target: edge.targetNodeId,
    animated: true,
    data: {
      editable,
      onDelete: () => undefined
    },
    selected: edge.id === selectedEdgeId,
    style: {
      stroke: edge.id === selectedEdgeId ? "#f59e0b" : theme === "dark" ? "#c084fc" : "#7c3aed",
      strokeWidth: edge.id === selectedEdgeId ? 3 : 2
    },
    markerEnd: {
      type: MarkerType.ArrowClosed,
      color: theme === "dark" ? "#c084fc" : "#7c3aed"
    }
  }));

  return { nodes, edges };
}

function preserveNodePositions(
  nextNodes: Node<FlowPilotNodeData>[],
  currentNodes: Node<FlowPilotNodeData>[]
) {
  const currentPositions = new Map(currentNodes.map((node) => [node.id, node.position]));

  return nextNodes.map((node) => ({
    ...node,
    position: currentPositions.get(node.id) ?? node.position
  }));
}

function getNodeModelKey(definition: WorkflowDefinition) {
  return JSON.stringify(
    definition.nodes.map((node) => ({
      id: node.id,
      type: node.type,
      name: node.name,
      config: node.config,
      position: node.position
    }))
  );
}

function getNodeLevels(definition: WorkflowDefinition) {
  const outgoing = new Map<string, string[]>();
  const incomingCount = new Map<string, number>();
  const levels = new Map<string, number>();

  for (const node of definition.nodes) {
    incomingCount.set(node.id, 0);
  }

  for (const edge of definition.edges) {
    outgoing.set(edge.sourceNodeId, [...(outgoing.get(edge.sourceNodeId) ?? []), edge.targetNodeId]);
    incomingCount.set(edge.targetNodeId, (incomingCount.get(edge.targetNodeId) ?? 0) + 1);
  }

  const queue = definition.nodes.filter((node) => (incomingCount.get(node.id) ?? 0) === 0);

  for (const node of queue) {
    levels.set(node.id, 0);
  }

  while (queue.length > 0) {
    const node = queue.shift();

    if (!node) {
      continue;
    }

    const nextLevel = (levels.get(node.id) ?? 0) + 1;

    for (const targetNodeId of outgoing.get(node.id) ?? []) {
      levels.set(targetNodeId, Math.max(levels.get(targetNodeId) ?? 0, nextLevel));
      const targetNode = definition.nodes.find((candidate) => candidate.id === targetNodeId);

      if (targetNode) {
        queue.push(targetNode);
      }
    }
  }

  return levels;
}

function getNodeDegrees(definition: WorkflowDefinition) {
  const incoming = new Map<string, number>();
  const outgoing = new Map<string, number>();

  for (const node of definition.nodes) {
    incoming.set(node.id, 0);
    outgoing.set(node.id, 0);
  }

  for (const edge of definition.edges) {
    outgoing.set(edge.sourceNodeId, (outgoing.get(edge.sourceNodeId) ?? 0) + 1);
    incoming.set(edge.targetNodeId, (incoming.get(edge.targetNodeId) ?? 0) + 1);
  }

  return { incoming, outgoing };
}

function getNodeIcon(type: string) {
  if (type === "trigger.manual") {
    return Play;
  }

  if (type === "action.transform") {
    return Braces;
  }

  if (type === "action.condition") {
    return GitBranch;
  }

  if (type === "action.httpRequest") {
    return Globe2;
  }

  if (type === "action.aiPrompt") {
    return Bot;
  }

  return WorkflowIcon;
}

function getNodeKind(type: string) {
  return type.startsWith("trigger.") ? "Trigger" : "Action";
}

function getNodeSummary(node: WorkflowNode) {
  if (node.type === "trigger.manual") {
    return "Receives manual run input and starts the workflow.";
  }

  if (node.type === "action.transform") {
    return node.config.mode === "pick"
      ? `Pick fields: ${node.config.pick?.join(", ")}`
      : "Pass input through unchanged.";
  }

  if (node.type === "action.condition") {
    return `${node.config.field} ${node.config.operator} ${String(node.config.value ?? "")}`;
  }

  if (node.type === "action.httpRequest") {
    return `${node.config.mode ?? "mock"} ${node.config.method} ${node.config.url}`;
  }

  if (node.type === "action.aiPrompt") {
    return `${node.config.model}: ${node.config.prompt}`;
  }

  return "Workflow node";
}
