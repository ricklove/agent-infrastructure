declare module "@anthropic-ai/claude-agent-sdk" {
  export type Query = AsyncIterable<unknown> & {
    abortController?: AbortController
    supportedModels(): Promise<ModelInfo[]>
    accountInfo(): Promise<{
      apiProvider?: ClaudeAccountProvider | null
    } | null>
    interrupt(): Promise<void>
    return(): Promise<void>
  }

  export type ModelInfo = {
    value: string
    displayName: string
    description: string
  }

  export type ClaudeAccountProvider =
    | "firstParty"
    | "bedrock"
    | "vertex"
    | "foundry"

  export function query(options: unknown): Query
}
