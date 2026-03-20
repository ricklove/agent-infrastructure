import type {
  ConflictPayload,
  GraphDiffSnapshot,
  GraphIntent,
  GraphSnapshot,
  ValidationPayload,
  WorkspaceSnapshot,
} from "@agent-infrastructure/agent-graph-core";

export type ClientMessage =
  | {
      type: "client/hello";
    }
  | {
      type: "client/intent";
      intent: GraphIntent;
    };

export type ServerMessage =
  | {
      type: "server/connected";
      workspace: WorkspaceSnapshot;
      graph: GraphSnapshot;
      diff: GraphDiffSnapshot | null;
    }
  | {
      type: "server/graph";
      graph: GraphSnapshot;
    }
  | {
      type: "server/diff";
      diff: GraphDiffSnapshot;
    }
  | {
      type: "server/validation";
      validation: ValidationPayload;
    }
  | {
      type: "server/conflict";
      conflict: ConflictPayload;
    }
  | {
      type: "server/external-change";
      revision: number;
      reason: string;
    };
