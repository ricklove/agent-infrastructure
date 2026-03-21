import { useEffect, useMemo, useRef } from "react";
import {
  applyNodeChanges,
  Background,
  Controls,
  MarkerType,
  MiniMap,
  ReactFlow,
  useOnSelectionChange,
  SelectionMode,
  useEdgesState,
  useNodesState,
  type Edge,
  type Node,
  type NodeChange,
  type NodeMouseHandler,
  type ReactFlowInstance,
} from "reactflow";
import "reactflow/dist/style.css";
import { observer, useSelector } from "@legendapp/state/react";
import type { AgentGraphStore } from "@agent-infrastructure/agent-graph-store";
import type {
  GraphEdge,
  GraphNode as AgentGraphNode,
  GraphSnapshot,
} from "@agent-infrastructure/agent-graph-core";
import { DerivedEdgeRenderer } from "../renderers/DerivedEdgeRenderer";
import { DirectEdgeRenderer } from "../renderers/DirectEdgeRenderer";
import { HiddenContextPortalNode } from "../renderers/HiddenContextPortalNode";
import { SemanticGraphNode } from "../renderers/SemanticGraphNode";

const nodeTypes = {
  semanticNode: SemanticGraphNode,
  hiddenContextPortal: HiddenContextPortalNode,
};

const edgeTypes = {
  direct: DirectEdgeRenderer,
  derived: DerivedEdgeRenderer,
};

type CanvasProps = {
  store: AgentGraphStore;
  leftSidebarWidth?: number;
  rightSidebarWidth?: number;
  hidePreview?: {
    layerId: string | null;
    sourceNodeIds: string[];
  };
  beginHidePreview(layerId: string | null, sourceNodeIds: string[]): void;
  endHidePreview(): void;
  actions: {
    selectNode(nodeId: string | null): void;
    selectEdge(edgeId: string | null): void;
    setCanvasSelection(nodeIds: string[], edgeIds: string[]): void;
    setPhysicsEnabled(enabled: boolean): void;
    setNodePinned(nodeId: string, pinned: boolean, position?: { x: number; y: number }): void;
    moveLayer(layerId: string, x: number, y: number): void;
    moveNode(nodeId: string, x: number, y: number): void;
    moveNodes(positions: Array<{ nodeId: string; x: number; y: number }>): void;
    hideNodeFromLayer(layerId: string, sourceNodeId: string): void;
    toggleLayerNodes(layerId: string, sourceNodeIds: string[], include: boolean): void;
    revealConnectedHiddenContext(sourceNodeId: string, layerId: string): void;
    revealHiddenNode(
      portalNodeId: string,
      hiddenNodeId: string,
      position?: { x: number; y: number },
    ): void;
    revealHiddenContext(portalNodeId: string): void;
    inspectDerivedEdge(edgeId: string, supportingPathIds: string[]): void;
  };
};

const REVEALED_HIDDEN_NODE_GAP = 28;
const SEMANTIC_NODE_WIDTH = 168;
const MAX_CLUSTER_VELOCITY = 42;
const MAX_CLUSTER_POSITION = 20_000;
const PHYSICS_FRAME_MS = 1000 / 60;
const PHYSICS_DAMPING_PER_FRAME = 0.88;
const PHYSICS_PERSIST_INTERVAL_MS = 500;
const PHYSICS_SETTLE_SPEED = 0.35;

type ForceNodeDatum = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  vx?: number;
  vy?: number;
  fx?: number | null;
  fy?: number | null;
};

type ClusterForceDatum = ForceNodeDatum & {
  memberNodeIds: string[];
  internalOffsets: Map<string, { x: number; y: number }>;
  pinned: boolean;
};

function clampVelocity(node: Pick<ForceNodeDatum, "vx" | "vy">, maxVelocity: number): void {
  const vx = node.vx ?? 0;
  const vy = node.vy ?? 0;
  const speed = Math.hypot(vx, vy);
  if (speed <= maxVelocity || speed === 0) {
    return;
  }

  const scale = maxVelocity / speed;
  node.vx = vx * scale;
  node.vy = vy * scale;
}

function clampPosition(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(-MAX_CLUSTER_POSITION, Math.min(MAX_CLUSTER_POSITION, value));
}

function sanitizePoint(position: { x: number; y: number }): { x: number; y: number } {
  return {
    x: clampPosition(position.x),
    y: clampPosition(position.y),
  };
}

function isValidPosition(position: { x: number; y: number }): boolean {
  return (
    Number.isFinite(position.x) &&
    Number.isFinite(position.y) &&
    Math.abs(position.x) <= MAX_CLUSTER_POSITION &&
    Math.abs(position.y) <= MAX_CLUSTER_POSITION
  );
}

function nodeDimensions(node: Node): { width: number; height: number } {
  if (typeof node.width === "number" && typeof node.height === "number") {
    return { width: node.width, height: node.height };
  }
  if (node.type === "hiddenContextPortal") {
    return { width: 96, height: 40 };
  }
  if (node.type === "group") {
    return {
      width: Number((node.style as { width?: number } | undefined)?.width ?? 520),
      height: Number((node.style as { height?: number } | undefined)?.height ?? 260),
    };
  }
  return { width: 168, height: 88 };
}

function clampSlotRows(count: number): number {
  if (count <= 0) {
    return 1;
  }
  return Math.min(8, Math.max(4, Math.ceil(Math.sqrt(count * 4))));
}

function dominantSideForNode(args: {
  nodeId: string;
  outgoing: Map<string, string[]>;
  incoming: Map<string, string[]>;
  nodesById: Map<string, ForceNodeDatum>;
}): "incoming" | "outgoing" {
  const { nodeId, outgoing, incoming, nodesById } = args;
  const outgoingCount = outgoing.get(nodeId)?.length ?? 0;
  const incomingCount = incoming.get(nodeId)?.length ?? 0;
  if (outgoingCount !== incomingCount) {
    return outgoingCount > incomingCount ? "outgoing" : "incoming";
  }

  const node = nodesById.get(nodeId);
  if (!node) {
    return "outgoing";
  }

  let outgoingScore = 0;
  for (const neighborId of outgoing.get(nodeId) ?? []) {
    const neighbor = nodesById.get(neighborId);
    if (!neighbor) {
      continue;
    }
    outgoingScore += (neighbor.x ?? 0) - (node.x ?? 0);
  }

  let incomingScore = 0;
  for (const neighborId of incoming.get(nodeId) ?? []) {
    const neighbor = nodesById.get(neighborId);
    if (!neighbor) {
      continue;
    }
    incomingScore += (node.x ?? 0) - (neighbor.x ?? 0);
  }

  return outgoingScore >= incomingScore ? "outgoing" : "incoming";
}

function sortChildIdsByRelativePosition(args: {
  childIds: string[];
  ownerTarget: { x: number; y: number };
  side: "incoming" | "outgoing";
  nodesById: Map<string, ForceNodeDatum>;
}): string[] {
  const { childIds, ownerTarget, side, nodesById } = args;
  const sideMultiplier = side === "incoming" ? -1 : 1;

  return [...childIds].sort((leftId, rightId) => {
    const left = nodesById.get(leftId);
    const right = nodesById.get(rightId);
    if (!left || !right) {
      return leftId.localeCompare(rightId);
    }

    const leftDx = ((left.x ?? 0) - ownerTarget.x) * sideMultiplier;
    const rightDx = ((right.x ?? 0) - ownerTarget.x) * sideMultiplier;
    const leftOnPreferredSide = leftDx >= 0 ? 0 : 1;
    const rightOnPreferredSide = rightDx >= 0 ? 0 : 1;
    if (leftOnPreferredSide !== rightOnPreferredSide) {
      return leftOnPreferredSide - rightOnPreferredSide;
    }

    const byY = (left.y ?? 0) - (right.y ?? 0);
    if (Math.abs(byY) > 1) {
      return byY;
    }

    const byDepth = Math.abs(leftDx) - Math.abs(rightDx);
    if (Math.abs(byDepth) > 1) {
      return byDepth;
    }

    return (left.x ?? 0) - (right.x ?? 0);
  });
}

function createHandleSlotForce(args: {
  links: Array<{ source: string; target: string }>;
  nodesById: Map<string, ForceNodeDatum>;
  pinnedNodeIds: Set<string>;
  assignmentCache: Map<
    string,
    {
      signature: string;
      orderedNeighborIds: string[];
    }
  >;
  relationCache: Map<
    string,
    {
      parentId: string | null;
      side: "incoming" | "outgoing" | null;
    }
  >;
  dirtyOwnerIds: Set<string>;
  strength?: number;
  gap?: number;
  rowGap?: number;
  columnGap?: number;
}) {
  const {
    links,
    nodesById,
    pinnedNodeIds,
    assignmentCache,
    relationCache,
    dirtyOwnerIds,
    strength = 0.18,
    gap = 138,
    rowGap = 92,
    columnGap = 140,
  } = args;

  return (alpha: number) => {
    if (strength <= 0) {
      return;
    }

    const outgoing = new Map<string, string[]>();
    const incoming = new Map<string, string[]>();
    const undirected = new Map<string, Set<string>>();

    for (const link of links) {
      if (!nodesById.has(link.source) || !nodesById.has(link.target)) {
        continue;
      }
      outgoing.set(link.source, [...(outgoing.get(link.source) ?? []), link.target]);
      incoming.set(link.target, [...(incoming.get(link.target) ?? []), link.source]);
      undirected.set(link.source, new Set([...(undirected.get(link.source) ?? []), link.target]));
      undirected.set(link.target, new Set([...(undirected.get(link.target) ?? []), link.source]));
    }

    const visited = new Set<string>();
    const parentByNode = new Map<string, { parentId: string; side: "incoming" | "outgoing" }>();
    const traversalOrder: string[] = [];
    const rootIds: string[] = [];

    function sortNodeIds(ids: string[]): string[] {
      return [...ids].sort((leftId, rightId) => {
        const left = nodesById.get(leftId);
        const right = nodesById.get(rightId);
        if (!left || !right) {
          return leftId.localeCompare(rightId);
        }
        const byX = (left.x ?? 0) - (right.x ?? 0);
        if (Math.abs(byX) > 1) {
          return byX;
        }
        const byY = (left.y ?? 0) - (right.y ?? 0);
        if (Math.abs(byY) > 1) {
          return byY;
        }
        const byDegree =
          ((undirected.get(rightId)?.size ?? 0) - (undirected.get(leftId)?.size ?? 0));
        if (byDegree !== 0) {
          return byDegree;
        }
        return (
          Math.abs((outgoing.get(rightId)?.length ?? 0) - (incoming.get(rightId)?.length ?? 0)) -
          Math.abs((outgoing.get(leftId)?.length ?? 0) - (incoming.get(leftId)?.length ?? 0))
        );
      });
    }

    function sortRootIds(ids: string[]): string[] {
      return [...ids].sort((leftId, rightId) => {
        const leftWasRoot = relationCache.get(leftId)?.parentId === null ? 0 : 1;
        const rightWasRoot = relationCache.get(rightId)?.parentId === null ? 0 : 1;
        if (leftWasRoot !== rightWasRoot) {
          return leftWasRoot - rightWasRoot;
        }
        return sortNodeIds([leftId, rightId])[0] === leftId ? -1 : 1;
      });
    }

    function rootComponent(startRootIds: string[]): void {
      const queue = [...sortNodeIds(startRootIds)];
      for (const rootId of queue) {
        if (!visited.has(rootId)) {
          visited.add(rootId);
          rootIds.push(rootId);
          traversalOrder.push(rootId);
        }
      }

        for (let index = 0; index < queue.length; index += 1) {
          const currentId = queue[index];
        const dominantSide = dominantSideForNode({
          nodeId: currentId,
          outgoing,
          incoming,
          nodesById,
        });
        const sideOrder =
          dominantSide === "outgoing"
            ? (["outgoing", "incoming"] as const)
            : (["incoming", "outgoing"] as const);

          for (const side of sideOrder) {
          const neighbors = [
            ...(side === "outgoing" ? outgoing.get(currentId) ?? [] : incoming.get(currentId) ?? []),
          ].sort((leftId, rightId) => {
            const leftMatchesCache =
              relationCache.get(leftId)?.parentId === currentId &&
              relationCache.get(leftId)?.side === side
                ? 0
                : 1;
            const rightMatchesCache =
              relationCache.get(rightId)?.parentId === currentId &&
              relationCache.get(rightId)?.side === side
                ? 0
                : 1;
            if (leftMatchesCache !== rightMatchesCache) {
              return leftMatchesCache - rightMatchesCache;
            }
            return sortNodeIds([leftId, rightId])[0] === leftId ? -1 : 1;
          });
          for (const neighborId of neighbors) {
            if (visited.has(neighborId)) {
              continue;
            }
            visited.add(neighborId);
            parentByNode.set(neighborId, { parentId: currentId, side });
            queue.push(neighborId);
            traversalOrder.push(neighborId);
          }
        }
      }
    }

    const pinnedRoots = sortRootIds(
      [...nodesById.keys()].filter((nodeId) => pinnedNodeIds.has(nodeId)),
    );
    if (pinnedRoots.length > 0) {
      rootComponent(pinnedRoots);
    }

    const remainingNodeIds = [...nodesById.keys()].filter((nodeId) => !visited.has(nodeId));
    for (const nodeId of sortRootIds(remainingNodeIds)) {
      if (visited.has(nodeId)) {
        continue;
      }
      rootComponent([nodeId]);
    }

    const childrenByParent = new Map<string, { incoming: string[]; outgoing: string[] }>();
    for (const [childId, relation] of parentByNode) {
      const groups = childrenByParent.get(relation.parentId) ?? { incoming: [], outgoing: [] };
      groups[relation.side].push(childId);
      childrenByParent.set(relation.parentId, groups);
    }

    const nextTargets = new Map<string, { x: number; y: number }>();
    for (const rootId of rootIds) {
      const root = nodesById.get(rootId);
      if (!root) {
        continue;
      }
      nextTargets.set(rootId, { x: root.x ?? 0, y: root.y ?? 0 });
    }

    relationCache.clear();
    for (const rootId of rootIds) {
      relationCache.set(rootId, { parentId: null, side: null });
    }
    for (const [childId, relation] of parentByNode) {
      relationCache.set(childId, relation);
    }

    for (const ownerId of traversalOrder) {
      const owner = nodesById.get(ownerId);
      if (!owner) {
        continue;
      }
      const ownerTarget = nextTargets.get(ownerId) ?? { x: owner.x ?? 0, y: owner.y ?? 0 };
      const groups = childrenByParent.get(ownerId);
      if (!groups) {
        continue;
      }

        for (const side of ["incoming", "outgoing"] as const) {
          const childIds = groups[side].filter((childId) => nodesById.has(childId));
          if (childIds.length === 0) {
            continue;
          }

          const cacheKey = `${ownerId}:${side}`;
          const childSignature = [...childIds].sort().join("|");
          const cachedAssignment = assignmentCache.get(cacheKey);
          const childIdSet = new Set(childIds);
          const isDirtyOwner = dirtyOwnerIds.has(ownerId);
          const canReuseCachedAssignment =
            !isDirtyOwner &&
            cachedAssignment &&
            cachedAssignment.signature === childSignature &&
            cachedAssignment.orderedNeighborIds.length === childIds.length &&
            cachedAssignment.orderedNeighborIds.every((childId) => childIdSet.has(childId));

          const orderedChildIds = canReuseCachedAssignment
            ? cachedAssignment.orderedNeighborIds
            : (() => {
                const geometryOrderedChildIds = sortChildIdsByRelativePosition({
                  childIds,
                  ownerTarget,
                  side,
                  nodesById,
                });
                if (!cachedAssignment) {
                  return geometryOrderedChildIds;
                }

                const previousOrderedChildIds = cachedAssignment.orderedNeighborIds.filter((childId) =>
                  childIdSet.has(childId),
                );
                const seenChildIds = new Set(previousOrderedChildIds);
                const newChildIds = geometryOrderedChildIds.filter((childId) => !seenChildIds.has(childId));
                return [...previousOrderedChildIds, ...newChildIds];
              })();

          if (!canReuseCachedAssignment) {
            assignmentCache.set(cacheKey, {
              signature: childSignature,
              orderedNeighborIds: orderedChildIds,
            });
          }

          const rowCount = clampSlotRows(orderedChildIds.length);
          const columnCount = Math.ceil(orderedChildIds.length / rowCount);
          const ownerLeft = ownerTarget.x - owner.width / 2;
          const ownerRight = ownerTarget.x + owner.width / 2;
          const ownerTop = ownerTarget.y - owner.height / 2;
          const rowHeights = Array.from({ length: rowCount }, () => 0);
          const columnWidths = Array.from({ length: columnCount }, () => 0);

          for (const [index, childId] of orderedChildIds.entries()) {
            const child = nodesById.get(childId);
            if (!child) {
              continue;
            }
            const row = index % rowCount;
            const column = Math.floor(index / rowCount);
            rowHeights[row] = Math.max(rowHeights[row], child.height);
            columnWidths[column] = Math.max(columnWidths[column], child.width);
          }

          const rowOffsets = rowHeights.map((height, row) => {
            const previousHeights = rowHeights
              .slice(0, row)
              .reduce((total, current) => total + current, 0);
            return previousHeights + row * rowGap + height / 2;
          });
          const outgoingColumnOffsets = columnWidths.map((width, column) => {
            const previousWidths = columnWidths
              .slice(0, column)
              .reduce((total, current) => total + current, 0);
            return previousWidths + column * columnGap + width / 2;
          });
          const incomingColumnOffsets = columnWidths.map((width, column) => {
            const previousWidths = columnWidths
              .slice(0, column)
              .reduce((total, current) => total + current, 0);
            return previousWidths + column * columnGap + width / 2;
          });

          for (const [index, childId] of orderedChildIds.entries()) {
            const child = nodesById.get(childId);
            if (!child) {
              continue;
            }
            const row = index % rowCount;
            const column = Math.floor(index / rowCount);
            const targetX =
              side === "incoming"
                ? ownerLeft - gap - incomingColumnOffsets[column]
                : ownerRight + gap + outgoingColumnOffsets[column];
            const targetY = ownerTop + rowOffsets[row];
            nextTargets.set(childId, { x: targetX, y: targetY });
          }
        }
        dirtyOwnerIds.delete(ownerId);
      }

    for (const [nodeId, target] of nextTargets) {
      if (pinnedNodeIds.has(nodeId)) {
        continue;
      }
      const node = nodesById.get(nodeId);
      if (!node) {
        continue;
      }
      const nudgeX = (target.x - (node.x ?? 0)) * strength * alpha;
      const nudgeY = (target.y - (node.y ?? 0)) * strength * alpha;
      node.vx = (node.vx ?? 0) + nudgeX;
      node.vy = (node.vy ?? 0) + nudgeY;
    }
  };
}

function createRectRepelForce(args: {
  nodes: ForceNodeDatum[];
  pinnedNodeIds: Set<string>;
  strength?: number;
  padding?: number;
}) {
  const {
    nodes,
    pinnedNodeIds,
    strength = 420,
    padding = 24,
  } = args;

  return (alpha: number) => {
    const normalizedStrength = Math.max(0, strength) / 420;
    if (normalizedStrength <= 0) {
      return;
    }

    for (let index = 0; index < nodes.length; index += 1) {
      const left = nodes[index];
      for (let otherIndex = index + 1; otherIndex < nodes.length; otherIndex += 1) {
        const right = nodes[otherIndex];

        const dx = (right.x ?? 0) - (left.x ?? 0);
        const dy = (right.y ?? 0) - (left.y ?? 0);
        const overlapX = left.width / 2 + right.width / 2 + padding - Math.abs(dx);
        const overlapY = left.height / 2 + right.height / 2 + padding - Math.abs(dy);

        if (overlapX <= 0 || overlapY <= 0) {
          continue;
        }

        const leftPinned = pinnedNodeIds.has(left.id);
        const rightPinned = pinnedNodeIds.has(right.id);
        if (leftPinned && rightPinned) {
          continue;
        }

        const pushX = overlapX <= overlapY;
        const directionX = dx === 0 ? (index % 2 === 0 ? -1 : 1) : Math.sign(dx);
        const directionY = dy === 0 ? (otherIndex % 2 === 0 ? -1 : 1) : Math.sign(dy);
        const magnitude = (pushX ? overlapX : overlapY) * normalizedStrength * alpha * 0.5;
        const impulseX = pushX ? directionX * magnitude : 0;
        const impulseY = pushX ? 0 : directionY * magnitude;

        if (!leftPinned) {
          left.vx = (left.vx ?? 0) - impulseX;
          left.vy = (left.vy ?? 0) - impulseY;
        }
        if (!rightPinned) {
          right.vx = (right.vx ?? 0) + impulseX;
          right.vy = (right.vy ?? 0) + impulseY;
        }
      }
    }
  };
}

function createClusterAttractForce(args: {
  links: Array<{ source: string; target: string; weight: number }>;
  clustersById: Map<string, ClusterForceDatum>;
  strength?: number;
  gap?: number;
}) {
  const { links, clustersById, strength = 0.35, gap = 110 } = args;

  return (alpha: number) => {
    if (strength <= 0) {
      return;
    }

    for (const link of links) {
      const source = clustersById.get(link.source);
      const target = clustersById.get(link.target);
      if (!source || !target) {
        continue;
      }

      const actualDx = (target.x ?? 0) - (source.x ?? 0);
      const actualDy = (target.y ?? 0) - (source.y ?? 0);
      const desiredDx = source.width / 2 + target.width / 2 + gap;
      const desiredDy = 0;
      const nudgeX = (actualDx - desiredDx) * strength * alpha * link.weight * 0.5;
      const nudgeY = (actualDy - desiredDy) * strength * alpha * 0.25 * link.weight;

      if (!source.pinned) {
        source.vx = (source.vx ?? 0) + nudgeX;
        source.vy = (source.vy ?? 0) + nudgeY;
      }
      if (!target.pinned) {
        target.vx = (target.vx ?? 0) - nudgeX;
        target.vy = (target.vy ?? 0) - nudgeY;
      }
    }
  };
}

function buildClusterGrid(args: {
  orderedNodes: Array<{ id: string; width: number; height: number }>;
}): {
  width: number;
  height: number;
  offsets: Map<string, { x: number; y: number }>;
} {
  const { orderedNodes } = args;
  const count = orderedNodes.length;
  const columnCount = Math.max(1, Math.ceil(Math.sqrt(count)));
  const rowCount = Math.max(1, Math.ceil(count / columnCount));
  const rowGap = 28;
  const columnGap = 28;
  const rowHeights = Array.from({ length: rowCount }, () => 0);
  const columnWidths = Array.from({ length: columnCount }, () => 0);

  for (const [index, node] of orderedNodes.entries()) {
    const row = Math.floor(index / columnCount);
    const column = index % columnCount;
    rowHeights[row] = Math.max(rowHeights[row], node.height);
    columnWidths[column] = Math.max(columnWidths[column], node.width);
  }

  const totalWidth =
    columnWidths.reduce((sum, width) => sum + width, 0) + Math.max(0, columnCount - 1) * columnGap;
  const totalHeight =
    rowHeights.reduce((sum, height) => sum + height, 0) + Math.max(0, rowCount - 1) * rowGap;

  const offsets = new Map<string, { x: number; y: number }>();
  for (const [index, node] of orderedNodes.entries()) {
    const row = Math.floor(index / columnCount);
    const column = index % columnCount;
    const xBefore = columnWidths.slice(0, column).reduce((sum, width) => sum + width, 0);
    const yBefore = rowHeights.slice(0, row).reduce((sum, height) => sum + height, 0);
    const x =
      -totalWidth / 2 +
      xBefore +
      column * columnGap +
      columnWidths[column] / 2;
    const y =
      -totalHeight / 2 +
      yBefore +
      row * rowGap +
      rowHeights[row] / 2;
    offsets.set(node.id, { x, y });
  }

  return { width: totalWidth, height: totalHeight, offsets };
}

function SelectionSync({
  onChange,
}: {
  onChange(nodeIds: string[], edgeIds: string[]): void;
}) {
  useOnSelectionChange({
    onChange: ({ nodes, edges }) => {
      onChange(
        nodes.map((node) => node.id),
        edges.map((edge) => edge.id),
      );
    },
  });

  return null;
}

function mapLayerNodes(graph: GraphSnapshot): Node[] {
  const groupNodes: Node[] = graph.layers
    .filter((layer) => layer.visible)
    .map((layer) => ({
      id: layer.id,
      type: "group",
      data: { label: layer.label },
      position: { x: layer.x, y: layer.y },
      style: {
        width: layer.width,
        height: layer.height,
        background: "rgba(28, 25, 23, 0.6)",
        border: "1px dashed rgba(168, 162, 158, 0.28)",
        borderRadius: "20px",
        color: "rgba(245, 245, 244, 0.9)",
        padding: 12,
      },
      draggable: true,
      selectable: false,
    }));

  const semanticNodes: Node[] = graph.nodes.map((node) => mapSemanticNode(node));
  return [...groupNodes, ...semanticNodes];
}

function mapNodes(
  graph: GraphSnapshot,
  activeLayerId: string | null,
  pinnedNodeIds: string[],
  selectedSemanticNodeIds: string[],
  selectedHiddenNeighborCount: number,
  hidePreview: { layerId: string | null; sourceNodeIds: string[] },
  hideNodeFromLayer: (layerId: string, sourceNodeId: string) => void,
  toggleNodePinned: (nodeId: string, pinned: boolean, fallbackPosition: { x: number; y: number }) => void,
  revealHiddenNode: (portalNodeId: string, hiddenNodeId: string) => void,
  expandSelectionHidden: () => void,
  copySelectionReferences: () => void,
  hideSelection: () => void,
  beginHidePreview: (layerId: string | null, sourceNodeIds: string[]) => void,
  endHidePreview: () => void,
): Node[] {
  const pinnedSet = new Set(pinnedNodeIds);
  const selectionToolbarAnchorId = selectedSemanticNodeIds[0] ?? null;
  const previewSourceNodeIds = new Set(hidePreview.sourceNodeIds);
  const nodes = mapLayerNodes(graph);
  return nodes.map((node) => {
    const isGroup = node.type === "group";
    const nodeLayerId = isGroup
      ? node.id
      : String((node.data as { layerId?: string }).layerId ?? node.parentId ?? "");
    const isActiveLayer = !activeLayerId || nodeLayerId === activeLayerId;
    const sourceId = String((node.data as { sourceId?: string }).sourceId ?? "");
    const isHidePreviewTarget =
      !isGroup &&
      ((!hidePreview.layerId || hidePreview.layerId === nodeLayerId) &&
        ((node.type === "semanticNode" && previewSourceNodeIds.has(sourceId)) ||
          (node.type === "hiddenContextPortal" &&
            previewSourceNodeIds.has(sourceId))));

    return {
      ...node,
      draggable: isGroup ? isActiveLayer : isActiveLayer && node.draggable !== false,
      selectable: isGroup ? false : isActiveLayer,
      style: {
        ...node.style,
        opacity: isActiveLayer ? (isHidePreviewTarget ? 0.25 : 1) : 0.38,
      },
      data: {
        ...(node.data as object),
        isActiveLayer,
        isPinned: !isGroup && pinnedSet.has(node.id),
        onTogglePin:
          !isGroup && node.type === "semanticNode"
            ? () => toggleNodePinned(node.id, !pinnedSet.has(node.id), node.position)
            : undefined,
        showSelectionToolbar:
          !isGroup &&
          node.type === "semanticNode" &&
          node.id === selectionToolbarAnchorId &&
          selectedSemanticNodeIds.length > 0,
        selectionToolbarNodeIds:
          !isGroup && node.type === "semanticNode" && node.id === selectionToolbarAnchorId
            ? selectedSemanticNodeIds
            : undefined,
        selectionHiddenCount:
          !isGroup && node.type === "semanticNode" && node.id === selectionToolbarAnchorId
            ? selectedHiddenNeighborCount
            : undefined,
        onExpandSelectionHidden:
          !isGroup &&
          node.type === "semanticNode" &&
          node.id === selectionToolbarAnchorId &&
          selectedSemanticNodeIds.length > 0
            ? expandSelectionHidden
            : undefined,
        onHideSelection:
          !isGroup &&
          node.type === "semanticNode" &&
          node.id === selectionToolbarAnchorId &&
          selectedSemanticNodeIds.length > 0
            ? hideSelection
            : undefined,
        onCopySelectionReferences:
          !isGroup &&
          node.type === "semanticNode" &&
          node.id === selectionToolbarAnchorId &&
          selectedSemanticNodeIds.length > 0
            ? copySelectionReferences
            : undefined,
        onHide:
          !isGroup && isActiveLayer && node.type === "semanticNode"
            ? () =>
                hideNodeFromLayer(
                  nodeLayerId,
                  String((node.data as { sourceId?: string }).sourceId),
                )
            : undefined,
        onPreviewHide:
          !isGroup && isActiveLayer && node.type === "semanticNode"
            ? () => beginHidePreview(nodeLayerId, [sourceId])
            : undefined,
        onPreviewHideSelection:
          !isGroup &&
          node.type === "semanticNode" &&
          node.id === selectionToolbarAnchorId &&
          selectedSemanticNodeIds.length > 0
            ? () => {
                const sourceIds = graph.nodes
                  .filter((candidate) => selectedSemanticNodeIds.includes(candidate.id))
                  .map((candidate) => candidate.sourceId);
                beginHidePreview(activeLayerId, sourceIds);
              }
            : undefined,
        onClearHidePreview: endHidePreview,
        onRevealHiddenNode:
          !isGroup && isActiveLayer && node.type === "hiddenContextPortal"
            ? (hiddenNodeId: string) => revealHiddenNode(node.id, hiddenNodeId)
            : undefined,
        isHidePreview: isHidePreviewTarget,
      },
    } satisfies Node;
  });
}

function mapSemanticNode(node: AgentGraphNode): Node {
  if (node.kind === "hidden-context-portal") {
    return {
      id: node.id,
      parentId: node.ownerNodeId ?? node.parentLayerId,
      type: "hiddenContextPortal",
      data: {
        label: node.label,
        summary: node.summary,
        sourceId: node.sourceId,
        hiddenCount: node.hiddenCount ?? 0,
        hiddenNodes: node.hiddenNodes ?? [],
        layerId: node.parentLayerId,
        sourcePath: node.sourcePath,
        independentlyPositioned: node.independentlyPositioned ?? false,
      },
      position: sanitizePoint(node.position),
      draggable: false,
    };
  }

  return {
    id: node.id,
    parentId: node.parentLayerId,
    type: "semanticNode",
    data: {
      label: node.label,
      summary: node.summary,
      sourceId: node.sourceId,
      sourcePath: node.sourcePath,
      kind: node.kind,
      layerId: node.parentLayerId,
    },
    position: sanitizePoint(node.position),
    draggable: true,
  };
}

function mapEdges(
  graphEdges: GraphEdge[],
  hidePreviewNodeIds: Set<string>,
): Edge[] {
  return graphEdges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    type:
      edge.kind === "derived"
        ? "derived"
        : edge.kind === "hidden-context"
          ? "direct"
          : "direct",
    label:
      edge.kind === "derived" && edge.multiplicity > 1
        ? `${edge.label} ×${edge.multiplicity}`
        : edge.label,
    markerEnd: {
      type: MarkerType.ArrowClosed,
      color: edge.kind === "derived" ? "#fbbf24" : "#60a5fa",
    },
    data: {
      ...edge,
      hidePreview: hidePreviewNodeIds.has(edge.source) || hidePreviewNodeIds.has(edge.target),
    },
    animated: edge.kind === "derived",
    style:
      hidePreviewNodeIds.has(edge.source) || hidePreviewNodeIds.has(edge.target)
        ? { opacity: 0.4 }
        : undefined,
  }));
}

function mergeMappedNodesWithLocalPositions(mappedNodes: Node[], currentNodes: Node[]): Node[] {
  const currentNodeById = new Map(currentNodes.map((node) => [node.id, node]));
  const mappedNodeById = new Map(mappedNodes.map((node) => [node.id, node]));
  return mappedNodes.map((mappedNode) => {
    const currentNode = currentNodeById.get(mappedNode.id);
    if (!currentNode) {
      return mappedNode;
    }

    if (mappedNode.type === "hiddenContextPortal") {
      const ownerNodeId = String(mappedNode.parentId ?? "");
      const ownerNode = currentNodeById.get(ownerNodeId) ?? mappedNodeById.get(ownerNodeId);
      const ownerWidth = ownerNode ? nodeDimensions(ownerNode).width : SEMANTIC_NODE_WIDTH;
      const portalWidth = currentNode.width ?? nodeDimensions(mappedNode).width;
      const anchoredPosition = sanitizePoint({
        x:
          mappedNode.id.startsWith("portal:incoming:")
            ? -portalWidth - REVEALED_HIDDEN_NODE_GAP
            : ownerWidth + REVEALED_HIDDEN_NODE_GAP,
        y: 0,
      });

      return {
        ...mappedNode,
        position: anchoredPosition,
        selected: currentNode.selected,
        dragging: false,
        width: currentNode.width,
        height: currentNode.height,
      };
    }

    return {
      ...mappedNode,
      position: sanitizePoint(currentNode.position),
      selected: currentNode.selected,
      dragging: currentNode.dragging,
      width: currentNode.width,
      height: currentNode.height,
    };
  });
}

function anchorHiddenPortalNodes(nodes: Node[]): Node[] {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  let changed = false;

  const nextNodes = nodes.map((node) => {
    if (node.type !== "hiddenContextPortal") {
      return node;
    }

    const ownerNodeId = String(node.parentId ?? "");
    const ownerNode = nodeById.get(ownerNodeId);
    const ownerWidth = ownerNode ? nodeDimensions(ownerNode).width : SEMANTIC_NODE_WIDTH;
    const portalWidth = node.width ?? nodeDimensions(node).width;
    const anchoredPosition = sanitizePoint({
      x:
        node.id.startsWith("portal:incoming:")
          ? -portalWidth - REVEALED_HIDDEN_NODE_GAP
          : ownerWidth + REVEALED_HIDDEN_NODE_GAP,
      y: 0,
    });

    if (
      node.position.x === anchoredPosition.x &&
      node.position.y === anchoredPosition.y
    ) {
      return node;
    }

    changed = true;
    return {
      ...node,
      position: anchoredPosition,
      dragging: false,
    };
  });

  return changed ? nextNodes : nodes;
}

export const AgentGraphCanvas = observer(function AgentGraphCanvas({
  store,
  leftSidebarWidth = 280,
  rightSidebarWidth = 300,
  hidePreview = { layerId: null, sourceNodeIds: [] },
  beginHidePreview,
  endHidePreview,
  actions,
}: CanvasProps) {
  const graph = useSelector(store.state$.graph);
  const activeLayerId = useSelector(store.state$.activeLayerId);
  const selectedNodeIds = useSelector(store.state$.selection.nodeIds);
  const selectedEdgeId = useSelector(store.state$.selection.edgeId);
  const physicsEnabled = useSelector(store.state$.layout.physicsEnabled);
  const pinnedNodeIds = useSelector(store.state$.layout.pinnedNodeIds);
  const springStrength = useSelector(store.state$.layout.springStrength);
  const springLength = useSelector(store.state$.layout.springLength);
  const repulsionStrength = useSelector(store.state$.layout.repulsionStrength);
  const reactFlowRef = useRef<ReactFlowInstance<Node, Edge> | null>(null);
  const hasFittedInitialViewRef = useRef(false);
  const localNodesRef = useRef<Node[]>([]);
  const localEdgesRef = useRef<Edge[]>([]);
  const pinnedNodeIdsRef = useRef<string[]>([]);
  const physicsModelRef = useRef<{
    nodes: ClusterForceDatum[];
    movableNodeIds: string[];
    applyForces(alpha: number): void;
  } | null>(null);
  const physicsFrameRef = useRef<number | null>(null);
  const physicsLastTickRef = useRef<number | null>(null);
  const physicsTickRef = useRef<((timestamp: number) => void) | null>(null);
  const persistenceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const heldNodeTimeoutsRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const selectedSemanticNodeIds = useMemo(
    () =>
      graph
        ? graph.nodes
            .filter(
              (node) =>
                selectedNodeIds.includes(node.id) &&
                node.kind === "semantic-node" &&
                (!activeLayerId || node.parentLayerId === activeLayerId),
            )
            .map((node) => node.id)
        : [],
    [activeLayerId, graph, selectedNodeIds],
  );
  const selectedHiddenNeighborCount = useMemo(() => {
    if (!graph || selectedSemanticNodeIds.length === 0) {
      return 0;
    }

    const selectedNodeIdSet = new Set(selectedSemanticNodeIds);
    const hiddenNodeSourceIds = new Set<string>();
    for (const node of graph.nodes) {
      if (
        node.kind !== "hidden-context-portal" ||
        !node.ownerNodeId ||
        !selectedNodeIdSet.has(node.ownerNodeId)
      ) {
        continue;
      }
      for (const hiddenNode of node.hiddenNodes ?? []) {
        hiddenNodeSourceIds.add(hiddenNode.sourceId);
      }
    }
    return hiddenNodeSourceIds.size;
  }, [graph, selectedSemanticNodeIds]);
  const selectedNodeReferenceText = useMemo(() => {
    const selectedNodes = (graph?.nodes ?? []).filter(
      (node) =>
        node.kind === "semantic-node" &&
        selectedSemanticNodeIds.includes(node.id) &&
        (!activeLayerId || node.parentLayerId === activeLayerId),
    );
    return selectedNodes
      .map((node) => {
        const parts = [`- ${node.label}`, `[${node.sourceId}]`];
        if (node.sourcePath) {
          parts.push(node.sourcePath);
        }
        return parts.join(" ");
      })
      .join("\n");
  }, [activeLayerId, graph, selectedSemanticNodeIds]);
  const hidePreviewNodeIds = useMemo(
    () =>
      new Set(
        (graph?.nodes ?? []).flatMap((node) => {
          if (hidePreview.layerId && node.parentLayerId !== hidePreview.layerId) {
            return [];
          }

          if (
            node.kind === "semantic-node" &&
            hidePreview.sourceNodeIds.includes(node.sourceId)
          ) {
            return [node.id];
          }

          if (
            node.kind === "hidden-context-portal" &&
            hidePreview.sourceNodeIds.includes(node.sourceId)
          ) {
            return [node.id];
          }

          return [];
        }),
      ),
    [graph, hidePreview],
  );

  function selectedSemanticDragTargets(
    draggedNode: Node,
  ): Array<{ nodeId: string; x: number; y: number }> {
    const selectedNodeIdSet = new Set(selectedNodeIds);
    const currentNodes = reactFlowRef.current?.getNodes() ?? localNodesRef.current;
    const draggedIsPartOfSelection = selectedNodeIdSet.has(draggedNode.id);
    const selectedSemanticNodes = currentNodes.filter(
      (node) =>
        selectedNodeIdSet.has(node.id) &&
        node.type === "semanticNode" &&
        String((node.data as { layerId?: string } | undefined)?.layerId ?? node.parentId ?? "") ===
          (activeLayerId ?? String((draggedNode.data as { layerId?: string } | undefined)?.layerId ?? draggedNode.parentId ?? "")),
    );

    if (!draggedIsPartOfSelection || selectedSemanticNodes.length <= 1) {
      return [
        {
          nodeId: draggedNode.id,
          x: draggedNode.position.x,
          y: draggedNode.position.y,
        },
      ];
    }

    return selectedSemanticNodes.map((node) =>
      node.id === draggedNode.id
        ? {
            nodeId: node.id,
            x: draggedNode.position.x,
            y: draggedNode.position.y,
          }
        : {
            nodeId: node.id,
            x: node.position.x,
            y: node.position.y,
          },
    );
  }

  const mappedNodes = useMemo(
    () =>
      graph
        ? mapNodes(
            graph,
            activeLayerId,
            pinnedNodeIds,
            selectedSemanticNodeIds,
            selectedHiddenNeighborCount,
            hidePreview,
            actions.hideNodeFromLayer,
            (nodeId, pinned, fallbackPosition) => {
              const currentPosition =
                reactFlowRef.current?.getNode(nodeId)?.position ??
                localNodesRef.current.find((candidate) => candidate.id === nodeId)?.position ??
                fallbackPosition;
              if (pinned) {
                lockNodeToCurrentPosition(nodeId, currentPosition.x, currentPosition.y);
              }
              actions.setNodePinned(nodeId, pinned, currentPosition);
            },
            (portalNodeId, hiddenNodeId) => {
              const portalNode =
                reactFlowRef.current?.getNode(portalNodeId) ??
                localNodesRef.current.find((candidate) => candidate.id === portalNodeId);
              if (!portalNode) {
                actions.revealHiddenNode(portalNodeId, hiddenNodeId);
                return;
              }

              const layerId = String(
                (portalNode.data as { layerId?: string } | undefined)?.layerId ?? portalNode.parentId ?? "",
              );
              const layerNode =
                reactFlowRef.current?.getNode(layerId) ??
                localNodesRef.current.find((candidate) => candidate.id === layerId);
              const portalAbsolutePosition =
                portalNode.positionAbsolute ?? portalNode.position;
              const layerAbsolutePosition =
                layerNode?.positionAbsolute ?? layerNode?.position ?? { x: 0, y: 0 };
              const direction = String(
                portalNode.id.startsWith("portal:incoming:") ? "incoming" : "outgoing",
              );
              const nextPosition = {
                x:
                  portalAbsolutePosition.x -
                  layerAbsolutePosition.x +
                  (direction === "incoming"
                    ? -SEMANTIC_NODE_WIDTH - REVEALED_HIDDEN_NODE_GAP
                    : (portalNode.width ?? 56) + REVEALED_HIDDEN_NODE_GAP),
                y: portalAbsolutePosition.y - layerAbsolutePosition.y,
              };
              actions.revealHiddenNode(portalNodeId, hiddenNodeId, nextPosition);
            },
            () => {
              if (!activeLayerId) {
                return;
              }

              const selectedNodeIdSet = new Set(selectedSemanticNodeIds);
              const revealedSourceNodeIds = new Set<string>();
              for (const node of graph.nodes) {
                if (
                  node.kind !== "hidden-context-portal" ||
                  !node.ownerNodeId ||
                  !selectedNodeIdSet.has(node.ownerNodeId)
                ) {
                  continue;
                }
                for (const hiddenNode of node.hiddenNodes ?? []) {
                  revealedSourceNodeIds.add(hiddenNode.sourceId);
                }
              }

              if (revealedSourceNodeIds.size > 0) {
                actions.toggleLayerNodes(activeLayerId, [...revealedSourceNodeIds], true);
              }
            },
            () => {
              if (!selectedNodeReferenceText) {
                return;
              }

              void navigator.clipboard.writeText(selectedNodeReferenceText);
            },
            () => {
              if (!activeLayerId) {
                return;
              }

              const sourceNodeIds = [
                ...new Set(
                  graph.nodes
                    .filter(
                      (node) =>
                        node.kind === "semantic-node" && selectedSemanticNodeIds.includes(node.id),
                    )
                    .map((node) => node.sourceId),
                ),
              ];
              if (sourceNodeIds.length > 0) {
                actions.toggleLayerNodes(activeLayerId, sourceNodeIds, false);
              }
              actions.setCanvasSelection([], []);
            },
            beginHidePreview,
            endHidePreview,
          )
        : [],
    [actions.hideNodeFromLayer, actions.revealHiddenNode, actions.setCanvasSelection, actions.setNodePinned, actions.toggleLayerNodes, beginHidePreview, endHidePreview, graph, activeLayerId, hidePreview, pinnedNodeIds, selectedHiddenNeighborCount, selectedNodeReferenceText, selectedSemanticNodeIds],
  );
  const mappedEdges = useMemo(
    () => (graph ? mapEdges(graph.edges, hidePreviewNodeIds) : []),
    [graph, hidePreviewNodeIds],
  );
  const graphTopologyKey = useMemo(
    () =>
      graph
        ? `${graph.revision}:${graph.nodes.map((node) => node.id).join("|")}:${graph.edges
            .map((edge) => edge.id)
            .join("|")}`
        : "no-graph",
    [graph],
  );
  const [localNodes, setLocalNodes] = useNodesState(mappedNodes);
  const [localEdges, setLocalEdges, onEdgesChange] = useEdgesState(mappedEdges);

  function handleNodesChange(changes: NodeChange[]): void {
    setLocalNodes((current) => applyNodeChanges(changes, current));

    if (physicsEnabled) {
      return;
    }

    const completedDragNodeIds = changes
      .filter(
        (change): change is Extract<NodeChange, { type: "position" }> =>
          change.type === "position" && change.dragging === false,
      )
      .map((change) => change.id);

    if (completedDragNodeIds.length === 0) {
      return;
    }

    const currentNodes = reactFlowRef.current?.getNodes() ?? localNodesRef.current;
    const selectedNodeIdSet = new Set(selectedNodeIds);
    const persistedTargets = new Map<string, { nodeId: string; x: number; y: number }>();

    for (const completedNodeId of completedDragNodeIds) {
      const draggedNode = currentNodes.find((node) => node.id === completedNodeId);
      if (!draggedNode || draggedNode.type !== "semanticNode") {
        continue;
      }

      const selectedSemanticNodes = currentNodes.filter(
        (node) => selectedNodeIdSet.has(node.id) && node.type === "semanticNode",
      );
      const nodesToPersist =
        selectedNodeIdSet.has(completedNodeId) && selectedSemanticNodes.length > 1
          ? selectedSemanticNodes
          : [draggedNode];

      for (const node of nodesToPersist) {
        persistedTargets.set(node.id, {
          nodeId: node.id,
          x: node.position.x,
          y: node.position.y,
        });
      }
    }

    if (persistedTargets.size > 0) {
      actions.moveNodes([...persistedTargets.values()]);
    }
  }

  useEffect(() => {
    if (!graph) {
      hasFittedInitialViewRef.current = false;
    }
  }, [graph]);

  useEffect(() => {
    setLocalNodes((current) => mergeMappedNodesWithLocalPositions(mappedNodes, current));
  }, [mappedNodes, physicsEnabled, setLocalNodes]);

  useEffect(() => {
    setLocalNodes((current) => anchorHiddenPortalNodes(current));
  }, [localNodes, setLocalNodes]);

  useEffect(() => {
    setLocalEdges(mappedEdges);
  }, [mappedEdges, setLocalEdges]);

  useEffect(() => {
    const selectedNodeIdSet = new Set(selectedNodeIds);
    setLocalNodes((current) =>
      current.map((node) => {
        const nextSelected = selectedNodeIdSet.has(node.id);
        return node.selected === nextSelected ? node : { ...node, selected: nextSelected };
      }),
    );
    setLocalEdges((current) =>
      current.map((edge) => {
        const nextSelected = edge.id === selectedEdgeId;
        return edge.selected === nextSelected ? edge : { ...edge, selected: nextSelected };
      }),
    );
  }, [selectedEdgeId, selectedNodeIds, setLocalEdges, setLocalNodes]);

  useEffect(() => {
    localNodesRef.current = localNodes;
  }, [localNodes]);

  useEffect(() => {
    localEdgesRef.current = localEdges;
  }, [localEdges]);

  useEffect(() => {
    pinnedNodeIdsRef.current = pinnedNodeIds;
  }, [pinnedNodeIds]);

  useEffect(() => {
    if (!graph || hasFittedInitialViewRef.current || !reactFlowRef.current) {
      return;
    }

    reactFlowRef.current.fitView({
      padding: 0.18,
      duration: 0,
      includeHiddenNodes: false,
    });
    hasFittedInitialViewRef.current = true;
  }, [graph]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      const target = event.target;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        (target instanceof HTMLElement && target.isContentEditable)
      ) {
        return;
      }

      if (!event.ctrlKey && !event.metaKey) {
        return;
      }

      const key = event.key.toLowerCase();
      if (key === "c") {
        if (!selectedNodeReferenceText) {
          return;
        }
        event.preventDefault();
        void navigator.clipboard.writeText(selectedNodeReferenceText);
        return;
      }

      if (key !== "a") {
        return;
      }

      const selectableNodeIds = (graph?.nodes ?? [])
        .filter(
          (node) =>
            node.kind === "semantic-node" &&
            (!activeLayerId || node.parentLayerId === activeLayerId),
        )
        .map((node) => node.id);

      if (selectableNodeIds.length === 0) {
        return;
      }

      event.preventDefault();
      actions.setCanvasSelection(selectableNodeIds, []);
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [actions, activeLayerId, graph, selectedNodeReferenceText]);

  const onNodeClick: NodeMouseHandler = (_, node) => {
    const nodeLayerId =
      node.type === "group"
        ? node.id
        : String((node.data as { layerId?: string }).layerId ?? node.parentId ?? "");
    if (activeLayerId && nodeLayerId !== activeLayerId) {
      return;
    }

  };

  function clearHeldNodeTimeout(nodeId: string): void {
    const timeout = heldNodeTimeoutsRef.current.get(nodeId);
    if (timeout) {
      clearTimeout(timeout);
      heldNodeTimeoutsRef.current.delete(nodeId);
    }
  }

  function schedulePhysicsPersistence(): void {
    if (persistenceTimeoutRef.current) {
      return;
    }

    persistenceTimeoutRef.current = setTimeout(() => {
      persistenceTimeoutRef.current = null;
      const movableNodeIds = physicsModelRef.current?.movableNodeIds ?? [];
      if (movableNodeIds.length === 0) {
        return;
      }

      const movableSet = new Set(movableNodeIds);
      const positions = localNodesRef.current
        .filter((node) => movableSet.has(node.id))
        .map((node) => ({
          nodeId: node.id,
          x: clampPosition(node.position.x),
          y: clampPosition(node.position.y),
        }))
        .filter(isValidPosition);

      if (positions.length > 0) {
        actions.moveNodes(positions);
      }
    }, PHYSICS_PERSIST_INTERVAL_MS);
  }

  function flushPhysicsPersistence(): void {
    if (!persistenceTimeoutRef.current) {
      return;
    }

    clearTimeout(persistenceTimeoutRef.current);
    persistenceTimeoutRef.current = null;
  }

  function wakePhysicsLoop(): void {
    if (physicsFrameRef.current !== null || !physicsTickRef.current) {
      return;
    }

    physicsFrameRef.current = window.requestAnimationFrame(physicsTickRef.current);
  }

  function lockNodeToCurrentPosition(nodeId: string, x: number, y: number): void {
    const cluster = physicsModelRef.current?.nodes.find((candidate) =>
      candidate.memberNodeIds.includes(nodeId),
    );
    if (!cluster) {
      return;
    }
    const offset = cluster.internalOffsets.get(nodeId);
    const currentNode = localNodesRef.current.find((candidate) => candidate.id === nodeId);
    if (!offset || !currentNode) {
      return;
    }
    const { width, height } = nodeDimensions(currentNode);
    const centerX = x + width / 2 - offset.x;
    const centerY = y + height / 2 - offset.y;
    cluster.x = centerX;
    cluster.y = centerY;
    cluster.fx = centerX;
    cluster.fy = centerY;
    wakePhysicsLoop();
  }

  function releaseNodeAfterTimeout(nodeId: string): void {
    if (!physicsEnabled) {
      return;
    }
    clearHeldNodeTimeout(nodeId);
    const timeout = setTimeout(() => {
      heldNodeTimeoutsRef.current.delete(nodeId);
      const cluster = physicsModelRef.current?.nodes.find((candidate) =>
        candidate.memberNodeIds.includes(nodeId),
      );
      if (!cluster || pinnedNodeIdsRef.current.includes(nodeId)) {
        return;
      }
      cluster.fx = null;
      cluster.fy = null;
      wakePhysicsLoop();
    }, 1200);
    heldNodeTimeoutsRef.current.set(nodeId, timeout);
  }

  function buildForceModel(): {
    nodes: ClusterForceDatum[];
    movableNodeIds: string[];
    applyForces(alpha: number): void;
  } | null {
    if (!activeLayerId) {
      return null;
    }

    const layerNodes = localNodesRef.current.filter(
      (node) => {
        const data = node.data as
          | { layerId?: string; independentlyPositioned?: boolean }
          | undefined;
        if (data?.layerId !== activeLayerId) {
          return false;
        }
        return node.type === "semanticNode";
      },
    );
    const pinnedSet = new Set(pinnedNodeIds);
    const movableNodeIds = layerNodes.map((node) => node.id).filter((nodeId) => !pinnedSet.has(nodeId));

    if (movableNodeIds.length === 0) {
      return null;
    }

    const semanticNodeIds = new Set(layerNodes.map((node) => node.id));
    const semanticLinks = localEdgesRef.current
      .filter(
        (edge) => semanticNodeIds.has(String(edge.source)) && semanticNodeIds.has(String(edge.target)),
      )
      .map((edge) => ({
        source: String(edge.source),
        target: String(edge.target),
      }));
    const incomingByNode = new Map<string, string[]>();
    const outgoingByNode = new Map<string, string[]>();
    for (const link of semanticLinks) {
      outgoingByNode.set(link.source, [
        ...(outgoingByNode.get(link.source) ?? []),
        link.target,
      ]);
      incomingByNode.set(link.target, [
        ...(incomingByNode.get(link.target) ?? []),
        link.source,
      ]);
    }

    const groupsBySignature = new Map<string, Node[]>();
    for (const node of layerNodes) {
      const incomingSignature = [...new Set(incomingByNode.get(node.id) ?? [])].sort().join("|");
      const outgoingSignature = [...new Set(outgoingByNode.get(node.id) ?? [])].sort().join("|");
      const hasAnyAttachment = incomingSignature.length > 0 || outgoingSignature.length > 0;
      const signature =
        pinnedSet.has(node.id) || !hasAnyAttachment
          ? `singleton:${node.id}`
          : `in:${incomingSignature}::out:${outgoingSignature}`;
      groupsBySignature.set(signature, [...(groupsBySignature.get(signature) ?? []), node]);
    }

    const nodeToGroupId = new Map<string, string>();
    const groupNodes: ClusterForceDatum[] = [];
    for (const [signature, members] of groupsBySignature) {
      const orderedMembers = [...members].sort((left, right) => {
        const byY = left.position.y - right.position.y;
        if (Math.abs(byY) > 1) {
          return byY;
        }
        return left.position.x - right.position.x;
      });
      const memberLayouts = orderedMembers.map((member) => {
        const { width, height } = nodeDimensions(member);
        return { id: member.id, width, height };
      });
      const grid = buildClusterGrid({ orderedNodes: memberLayouts });
      const memberCenters = orderedMembers.map((member) => {
        const { width, height } = nodeDimensions(member);
        return {
          x: member.position.x + width / 2,
          y: member.position.y + height / 2,
        };
      });
      const centerX =
        memberCenters.reduce((sum, member) => sum + member.x, 0) / Math.max(memberCenters.length, 1);
      const centerY =
        memberCenters.reduce((sum, member) => sum + member.y, 0) / Math.max(memberCenters.length, 1);
      const memberNodeIds = orderedMembers.map((member) => member.id);
      const pinned = memberNodeIds.some((nodeId) => pinnedSet.has(nodeId));
      for (const nodeId of memberNodeIds) {
        nodeToGroupId.set(nodeId, signature);
      }
      groupNodes.push({
        id: signature,
        memberNodeIds,
        internalOffsets: grid.offsets,
        width: Math.max(grid.width, SEMANTIC_NODE_WIDTH),
        height: Math.max(grid.height, 88),
        x: centerX,
        y: centerY,
        fx: pinned ? centerX : null,
        fy: pinned ? centerY : null,
        pinned,
      });
    }

    const collapsedLinks = new Map<string, { source: string; target: string; weight: number }>();
    for (const link of semanticLinks) {
      const sourceGroupId = nodeToGroupId.get(link.source);
      const targetGroupId = nodeToGroupId.get(link.target);
      if (!sourceGroupId || !targetGroupId || sourceGroupId === targetGroupId) {
        continue;
      }
      const collapsedKey = `${sourceGroupId}->${targetGroupId}`;
      const current = collapsedLinks.get(collapsedKey);
      collapsedLinks.set(
        collapsedKey,
        current
          ? { ...current, weight: current.weight + 1 }
          : { source: sourceGroupId, target: targetGroupId, weight: 1 },
      );
    }

    const clustersById = new Map(groupNodes.map((group) => [group.id, group]));
    const applyClusterAttract = createClusterAttractForce({
      links: [...collapsedLinks.values()],
      clustersById,
      strength: springStrength,
      gap: springLength + 28,
    });
    const applyRectRepel = createRectRepelForce({
      nodes: groupNodes,
      pinnedNodeIds: new Set(groupNodes.filter((group) => group.pinned).map((group) => group.id)),
      strength: repulsionStrength,
    });

    return {
      nodes: groupNodes,
      movableNodeIds,
      applyForces(alpha: number) {
        applyClusterAttract(alpha);
        applyRectRepel(alpha);
      },
    };
  }

  function applyForcePositions(nodes: ClusterForceDatum[]): void {
    const nextPositions = new Map<string, { x: number; y: number }>();
    for (const cluster of nodes) {
      const clusterX = clampPosition(cluster.x ?? 0);
      const clusterY = clampPosition(cluster.y ?? 0);
      for (const memberNodeId of cluster.memberNodeIds) {
        const offset = cluster.internalOffsets.get(memberNodeId);
        const currentNode = localNodesRef.current.find((candidate) => candidate.id === memberNodeId);
        if (!offset || !currentNode) {
          continue;
        }
        const { width, height } = nodeDimensions(currentNode);
        nextPositions.set(memberNodeId, {
          x: clampPosition(clusterX + offset.x - width / 2),
          y: clampPosition(clusterY + offset.y - height / 2),
        });
      }
    }

    setLocalNodes((current) =>
      current.map((node) =>
        nextPositions.has(node.id)
          ? {
              ...node,
              position: nextPositions.get(node.id)!,
            }
          : node,
      ),
    );
  }

  useEffect(() => {
    if (!physicsEnabled) {
      if (physicsFrameRef.current !== null) {
        window.cancelAnimationFrame(physicsFrameRef.current);
        physicsFrameRef.current = null;
      }
      physicsLastTickRef.current = null;
      flushPhysicsPersistence();
      physicsModelRef.current = null;
      return;
    }

    const model = buildForceModel();
    if (!model) {
      actions.setPhysicsEnabled(false);
      return;
    }

    physicsModelRef.current = model;
    physicsLastTickRef.current = null;

    const tick = (timestamp: number) => {
      physicsFrameRef.current = null;
      const lastTick = physicsLastTickRef.current ?? timestamp;
      physicsLastTickRef.current = timestamp;
      const dtMs = Math.min(PHYSICS_FRAME_MS * 2, Math.max(8, timestamp - lastTick));
      const alpha = dtMs / PHYSICS_FRAME_MS;
      const damping = PHYSICS_DAMPING_PER_FRAME ** alpha;

      model.applyForces(alpha);

      let maxSpeed = 0;
      for (const node of model.nodes) {
        if (node.fx != null && node.fy != null) {
          node.x = clampPosition(node.fx);
          node.y = clampPosition(node.fy);
          node.vx = 0;
          node.vy = 0;
          continue;
        }

        node.vx = (node.vx ?? 0) * damping;
        node.vy = (node.vy ?? 0) * damping;
        clampVelocity(node, MAX_CLUSTER_VELOCITY);

        node.x = clampPosition((node.x ?? 0) + (node.vx ?? 0) * alpha);
        node.y = clampPosition((node.y ?? 0) + (node.vy ?? 0) * alpha);
        maxSpeed = Math.max(maxSpeed, Math.hypot(node.vx ?? 0, node.vy ?? 0));
      }

      applyForcePositions(model.nodes);

      if (maxSpeed >= PHYSICS_SETTLE_SPEED) {
        schedulePhysicsPersistence();
        wakePhysicsLoop();
        return;
      }

      physicsLastTickRef.current = null;
      schedulePhysicsPersistence();
    };

    physicsTickRef.current = tick;
    wakePhysicsLoop();

    return () => {
      if (physicsFrameRef.current !== null) {
        window.cancelAnimationFrame(physicsFrameRef.current);
        physicsFrameRef.current = null;
      }
      physicsLastTickRef.current = null;
      physicsTickRef.current = null;
      schedulePhysicsPersistence();
      physicsModelRef.current = null;
    };
  }, [
    physicsEnabled,
    graphTopologyKey,
    activeLayerId,
    pinnedNodeIds.join("|"),
    springStrength,
    springLength,
    repulsionStrength,
  ]);

  useEffect(() => {
    if (!physicsEnabled) {
      return;
    }
    const pinnedSet = new Set(pinnedNodeIds);
    for (const nodeId of pinnedSet) {
      clearHeldNodeTimeout(nodeId);
      const localNode = localNodesRef.current.find((candidate) => candidate.id === nodeId);
      if (localNode) {
        lockNodeToCurrentPosition(nodeId, localNode.position.x, localNode.position.y);
      }
    }
  }, [physicsEnabled, pinnedNodeIds.join("|")]);

  useEffect(() => {
    if (!physicsEnabled) {
      for (const timeout of heldNodeTimeoutsRef.current.values()) {
        clearTimeout(timeout);
      }
      heldNodeTimeoutsRef.current.clear();
      return;
    }
    actions.setPhysicsEnabled(false);
  }, [activeLayerId]);

  useEffect(
    () => () => {
      for (const timeout of heldNodeTimeoutsRef.current.values()) {
        clearTimeout(timeout);
      }
      heldNodeTimeoutsRef.current.clear();
    },
    [],
  );

  return (
    <section className="relative h-full min-h-[720px] overflow-hidden">
      <div className="h-full w-full">
        <ReactFlow
          className="[&_.react-flow__pane]:bg-transparent [&_.react-flow__renderer]:bg-transparent [&_.react-flow__viewport]:bg-transparent"
          nodes={localNodes}
          edges={localEdges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          proOptions={{ hideAttribution: true }}
          onlyRenderVisibleElements
          autoPanOnNodeDrag
          selectionOnDrag
          selectionMode={SelectionMode.Partial}
          onNodesChange={handleNodesChange}
          onEdgesChange={onEdgesChange}
          onInit={(instance) => {
            reactFlowRef.current = instance;
          }}
          onNodeClick={onNodeClick}
          onEdgeClick={(_, edge) => {
            const data = edge.data as GraphEdge | undefined;
            if (data?.kind === "derived") {
              actions.inspectDerivedEdge(edge.id, data.supportingPathIds);
            }
          }}
          onNodeDragStart={(_, node) => {
            if (!physicsEnabled) {
              return;
            }
            if (graph?.layers.some((layer) => layer.id === node.id)) {
              return;
            }
            clearHeldNodeTimeout(node.id);
            lockNodeToCurrentPosition(node.id, node.position.x, node.position.y);
          }}
          onNodeDrag={(_, node) => {
            if (!physicsEnabled) {
              return;
            }
            if (graph?.layers.some((layer) => layer.id === node.id)) {
              return;
            }
            lockNodeToCurrentPosition(node.id, node.position.x, node.position.y);
          }}
          onNodeDragStop={(_, node) => {
            const nodeLayerId =
              node.type === "group"
                ? node.id
                : String((node.data as { layerId?: string }).layerId ?? node.parentId ?? "");
            if (activeLayerId && nodeLayerId !== activeLayerId) {
              return;
            }

            if (graph?.layers.some((layer) => layer.id === node.id)) {
              actions.moveLayer(node.id, node.position.x, node.position.y);
            } else {
              const persistedTargets = selectedSemanticDragTargets(node);
              const validTargets = persistedTargets
                .map((target) => ({
                  nodeId: target.nodeId,
                  x: clampPosition(target.x),
                  y: clampPosition(target.y),
                }))
                .filter(isValidPosition);
              if (physicsEnabled) {
                if (validTargets.length > 0) {
                  actions.moveNodes(validTargets);
                }
              } else {
                if (validTargets.length > 0) {
                  actions.moveNodes(validTargets);
                }
              }
              if (physicsEnabled) {
                releaseNodeAfterTimeout(node.id);
              }
              if (physicsEnabled && pinnedNodeIds.includes(node.id) && physicsModelRef.current) {
                const forceNode = physicsModelRef.current.nodes.find(
                  (candidate) => candidate.memberNodeIds.includes(node.id),
                );
                if (forceNode) {
                  const offset = forceNode.internalOffsets.get(node.id);
                  if (!offset) {
                    return;
                  }
                  const { width, height } = nodeDimensions(node);
                  forceNode.x = node.position.x + width / 2 - offset.x;
                  forceNode.y = node.position.y + height / 2 - offset.y;
                  forceNode.fx = forceNode.x;
                  forceNode.fy = forceNode.y;
                  wakePhysicsLoop();
                }
              }
            }
          }}
          minZoom={0.2}
          maxZoom={1.8}
          defaultEdgeOptions={{
            markerEnd: { type: MarkerType.ArrowClosed },
          }}
        >
          <SelectionSync onChange={actions.setCanvasSelection} />
          <Background gap={24} color="rgba(120, 113, 108, 0.16)" />
          <MiniMap
            pannable
            zoomable
            position="bottom-right"
            maskColor="rgba(20, 17, 15, 0.72)"
            nodeColor={(node) =>
              node.type === "group"
                ? "rgba(120, 113, 108, 0.22)"
                : node.type === "hiddenContextPortal"
                  ? "#f59e0b"
                  : "#e7e5e4"
            }
            nodeStrokeColor={(node) =>
              node.type === "group"
                ? "rgba(168, 162, 158, 0.36)"
                : node.type === "hiddenContextPortal"
                  ? "#f59e0b"
                  : "#60a5fa"
            }
            nodeBorderRadius={8}
            style={{
              zIndex: 30,
              right: rightSidebarWidth + 24,
              bottom: 12,
              backgroundColor: "rgba(18, 17, 15, 0.88)",
              border: "1px solid rgba(41, 37, 36, 0.95)",
              borderRadius: 16,
            }}
          />
          <Controls
            position="bottom-left"
            style={{
              zIndex: 30,
              left: leftSidebarWidth + 24,
              bottom: 12,
              background: "rgba(18, 17, 15, 0.88)",
              border: "1px solid rgba(41, 37, 36, 0.95)",
              borderRadius: 16,
            }}
          />
        </ReactFlow>
      </div>
    </section>
  );
});
