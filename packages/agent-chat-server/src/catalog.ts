export type AgentChatProviderKind =
  | "codex-app-server"
  | "openrouter"
  | "claude-agent-sdk"
  | "gemini";

export type AgentChatProviderCatalogEntry = {
  kind: AgentChatProviderKind;
  label: string;
  description: string;
  defaultModelRef: string;
  modelOptions: string[];
  authProfiles: string[];
  status: "ready" | "planned";
  supportsImageInput: boolean;
  supportsCachedContext: boolean;
  supportsInteractiveApprovals: boolean;
  transport: string;
};

export const providerCatalog: AgentChatProviderCatalogEntry[] = [
  {
    kind: "codex-app-server",
    label: "Codex App Server",
    description: "OpenAI Codex app-server thread runtime.",
    defaultModelRef: "openai-codex/gpt-5.4",
    modelOptions: ["openai-codex/gpt-5.4"],
    authProfiles: ["chatgpt", "api-key"],
    status: "ready",
    supportsImageInput: true,
    supportsCachedContext: true,
    supportsInteractiveApprovals: true,
    transport: "local-json-rpc",
  },
  {
    kind: "openrouter",
    label: "OpenRouter",
    description: "OpenRouter routed model API with provider-qualified refs.",
    defaultModelRef: "openrouter/anthropic/claude-sonnet-4-6",
    modelOptions: [
      "openrouter/anthropic/claude-sonnet-4-6",
      "openrouter/openai/gpt-5",
      "openrouter/google/gemini-2.5-pro",
    ],
    authProfiles: ["api-key"],
    status: "planned",
    supportsImageInput: true,
    supportsCachedContext: true,
    supportsInteractiveApprovals: false,
    transport: "https-stream",
  },
  {
    kind: "claude-agent-sdk",
    label: "Claude Agent SDK",
    description: "Anthropic Claude Agent SDK with tool loop and approvals.",
    defaultModelRef: "anthropic/claude-sonnet-4-5",
    modelOptions: [
      "anthropic/claude-sonnet-4-5",
      "anthropic/claude-opus-4-1",
      "anthropic/claude-haiku-4-5",
    ],
    authProfiles: ["api-key", "bedrock", "vertex", "foundry"],
    status: "ready",
    supportsImageInput: true,
    supportsCachedContext: true,
    supportsInteractiveApprovals: true,
    transport: "sdk-client",
  },
  {
    kind: "gemini",
    label: "Gemini",
    description: "Google Gemini via the official Google Gen AI SDK.",
    defaultModelRef: "google/gemini-2.5-flash",
    modelOptions: [
      "google/gemini-2.5-flash",
      "google/gemini-2.5-pro",
    ],
    authProfiles: ["api-key", "vertex"],
    status: "planned",
    supportsImageInput: true,
    supportsCachedContext: true,
    supportsInteractiveApprovals: false,
    transport: "google-genai-sdk",
  },
];

export function getProviderCatalogEntry(kind: AgentChatProviderKind) {
  return providerCatalog.find((entry) => entry.kind === kind) ?? null;
}
