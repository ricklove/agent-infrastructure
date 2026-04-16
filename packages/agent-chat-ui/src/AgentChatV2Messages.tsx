import { dashboardSessionFetch } from "@agent-infrastructure/dashboard-plugin"
import { useRenderCounter } from "@agent-infrastructure/render-diagnostics"
import { Fragment, type ReactNode, useEffect, useState } from "react"
import type { AgentChatV2Message } from "./AgentChatV2Store"

type ImageReference = {
  sourceUrl: string
  altText: string
}

export type TranscriptItem =
  | { type: "message"; message: AgentChatV2Message }
  | { type: "actions"; messages: AgentChatV2Message[] }

export type OutboxMessage = AgentChatV2Message & {
  pendingStatus: "pending" | "queued"
}

const messageBodyScrollClassName =
  "max-h-[min(34rem,calc(100dvh-14rem))] overflow-y-auto overscroll-contain pr-2"
const largeMessageCharacterThreshold = 12_000
const largeMessagePreviewCharacterLimit = 120_000
const largeMessageLineThreshold = 260

type MessageTextStats = {
  characterCount: number
  lineCount: number
  large: boolean
}

export function messageText(message: AgentChatV2Message): string {
  return message.content
    .map((block) => (block.type === "text" ? block.text : "[image]"))
    .join("\n")
    .trim()
}

export function formatTime(value: number): string {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value))
}

function normalizeImageSource(sourceUrl: string): string {
  const trimmed = sourceUrl.trim()
  if (trimmed.startsWith("~/")) {
    return `/home/ec2-user/${trimmed.slice(2)}`
  }
  return trimmed
}

function isLikelyImageTarget(value: string): boolean {
  const normalized = normalizeImageSource(value).split(/[?#]/u)[0] ?? ""
  return (
    /^\/api\/agent-chat\/sessions\/[^/]+\/attachments\//u.test(value) ||
    /^\/home\/ec2-user\/temp\/.+\.(?:apng|avif|gif|jpe?g|png|webp)$/iu.test(
      normalized,
    ) ||
    /\.(?:apng|avif|gif|jpe?g|png|webp|svg)$/iu.test(normalized)
  )
}

function parseMarkdownImageLine(line: string): ImageReference | null {
  const match = /^\s*!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)\s*$/u.exec(line)
  if (!match) {
    return null
  }
  return {
    altText: match[1]?.trim() || "Shared image",
    sourceUrl: match[2]?.trim() || "",
  }
}

function parseStandaloneMarkdownLinkLine(line: string): ImageReference | null {
  const match = /^\s*\[([^\]]+)\]\(([^)]+)\)\s*$/u.exec(line)
  if (!match) {
    return null
  }
  const sourceUrl = match[2]?.trim() || ""
  if (!isLikelyImageTarget(sourceUrl)) {
    return null
  }
  return {
    altText: match[1]?.trim() || "Linked image",
    sourceUrl,
  }
}

function parseRawImageReferenceLine(line: string): ImageReference | null {
  const sourceUrl = line.trim()
  if (!sourceUrl || /\s/u.test(sourceUrl) || !isLikelyImageTarget(sourceUrl)) {
    return null
  }
  return {
    altText: "Linked image",
    sourceUrl,
  }
}

function textImageReferences(text: string): ImageReference[] {
  return text
    .split(/\r?\n/u)
    .map(
      (line) =>
        parseMarkdownImageLine(line) ??
        parseStandaloneMarkdownLinkLine(line) ??
        parseRawImageReferenceLine(line),
    )
    .filter((entry): entry is ImageReference => entry !== null)
}

function isLikelyLocalFileReferenceTarget(value: string): boolean {
  const normalized = normalizeImageSource(value).split(/[?#]/u)[0] ?? ""
  return (
    normalized.startsWith("/home/ec2-user/") ||
    normalized.startsWith("~/") ||
    /^\.[./]/u.test(normalized)
  )
}

function parseStandaloneLocalFileLine(line: string): string | null {
  const trimmed = line.trim()
  if (!trimmed || /\s/u.test(trimmed)) {
    return null
  }
  return isLikelyLocalFileReferenceTarget(trimmed) ? trimmed : null
}

function FileReferenceLink(props: { pathname: string; label?: string }) {
  useRenderCounter("AgentChatV2.FileReferenceLink")
  const [copied, setCopied] = useState(false)
  const label = props.label || props.pathname

  async function copyPath() {
    await navigator.clipboard.writeText(normalizeImageSource(props.pathname))
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1200)
  }

  return (
    <button
      type="button"
      onClick={() => void copyPath()}
      className="break-all rounded border border-cyan-400/25 bg-cyan-950/30 px-1.5 py-0.5 font-mono text-[0.92em] text-cyan-100 hover:border-cyan-300"
      title={copied ? "Copied path" : "Copy path"}
    >
      {label}
    </button>
  )
}

function CodeBlock(props: { language: string; code: string }) {
  useRenderCounter("AgentChatV2.CodeBlock")
  const [copied, setCopied] = useState(false)

  async function copyCode() {
    await navigator.clipboard.writeText(props.code)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1200)
  }

  return (
    <div className="overflow-hidden rounded border border-zinc-700 bg-zinc-950">
      <div className="flex items-center justify-between gap-3 border-b border-zinc-800 px-3 py-2 text-[11px] uppercase text-zinc-500">
        <span className="truncate">{props.language || "code"}</span>
        <button
          type="button"
          onClick={() => void copyCode()}
          className="rounded border border-zinc-700 px-2 py-1 text-[11px] text-zinc-300 hover:border-cyan-500 hover:text-cyan-100"
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="overflow-x-auto px-3 py-3 text-[13px] leading-6 text-zinc-100">
        <code className="font-mono">{props.code}</code>
      </pre>
    </div>
  )
}

function renderStyledInlineMarkdown(
  text: string,
  keyPrefix: string,
): ReactNode[] {
  const occurrences = new Map<string, number>()
  return text
    .split(/(\[[^\]]+\]\([^)]+\)|\*\*[^*]+\*\*|\*[^*]+\*)/gu)
    .filter(Boolean)
    .map((segment) => {
      const occurrence = occurrences.get(segment) ?? 0
      occurrences.set(segment, occurrence + 1)
      const key = `${keyPrefix}-styled-${occurrence}-${segment}`
      const linkMatch = /^\[([^\]]+)\]\(([^)]+)\)$/u.exec(segment)
      if (linkMatch) {
        const label = linkMatch[1] ?? ""
        const target = linkMatch[2] ?? ""
        if (isLikelyLocalFileReferenceTarget(target)) {
          return <FileReferenceLink key={key} pathname={target} label={label} />
        }
        return (
          <a
            key={key}
            href={target}
            target="_blank"
            rel="noreferrer"
            className="text-cyan-200 underline decoration-cyan-400/50 underline-offset-2 hover:text-cyan-100"
          >
            {label}
          </a>
        )
      }
      if (segment.startsWith("**") && segment.endsWith("**")) {
        return (
          <strong key={key} className="font-semibold text-white">
            {segment.slice(2, -2)}
          </strong>
        )
      }
      if (
        segment.startsWith("*") &&
        segment.endsWith("*") &&
        segment.length > 2
      ) {
        return (
          <em key={key} className="italic text-zinc-50">
            {segment.slice(1, -1)}
          </em>
        )
      }
      return <Fragment key={key}>{segment}</Fragment>
    })
}

function renderInlineMarkdown(text: string, keyPrefix: string): ReactNode[] {
  const occurrences = new Map<string, number>()
  return text
    .split(/(`[^`]+`)/gu)
    .filter(Boolean)
    .map((segment) => {
      const occurrence = occurrences.get(segment) ?? 0
      occurrences.set(segment, occurrence + 1)
      const key = `${keyPrefix}-inline-${occurrence}-${segment}`
      if (
        segment.startsWith("`") &&
        segment.endsWith("`") &&
        segment.length >= 2
      ) {
        return (
          <code
            key={key}
            className="rounded bg-zinc-950 px-1.5 py-0.5 font-mono text-[0.92em] text-cyan-100"
          >
            {segment.slice(1, -1)}
          </code>
        )
      }
      return (
        <Fragment key={key}>
          {renderStyledInlineMarkdown(segment, key)}
        </Fragment>
      )
    })
}

function renderMarkdownParagraph(
  lines: string[],
  keyPrefix: string,
): ReactNode {
  const lineOccurrences = new Map<string, number>()
  return lines.map((line, index) => {
    const occurrence = lineOccurrences.get(line) ?? 0
    lineOccurrences.set(line, occurrence + 1)
    return (
      <Fragment key={`${keyPrefix}-line-${occurrence}-${line}`}>
        {index > 0 ? <br /> : null}
        {renderInlineMarkdown(line, `${keyPrefix}-${occurrence}`)}
      </Fragment>
    )
  })
}

function renderStructuredTextBlock(
  lines: string[],
  keyPrefix: string,
): ReactNode {
  const headingMatch = /^(#{1,3})\s+(.*)$/u.exec(lines[0] ?? "")
  if (headingMatch && lines.length === 1) {
    const level = headingMatch[1]?.length ?? 1
    const headingClass =
      level === 1
        ? "text-lg font-semibold text-white"
        : level === 2
          ? "text-base font-semibold text-zinc-100"
          : "text-sm font-semibold uppercase text-zinc-300"
    return (
      <p className={headingClass}>
        {renderInlineMarkdown(headingMatch[2] ?? "", `${keyPrefix}-heading`)}
      </p>
    )
  }

  if (lines.length === 1 && /^[-*_]{3,}$/u.test((lines[0] ?? "").trim())) {
    return <hr className="border-zinc-700" />
  }

  if (lines.every((line) => /^>\s?/u.test(line))) {
    const quoteLines = lines.map((line) => line.replace(/^>\s?/u, ""))
    return (
      <blockquote className="border-l-2 border-cyan-500/50 pl-3 text-sm leading-6 text-zinc-300">
        {renderMarkdownParagraph(quoteLines, `${keyPrefix}-quote`)}
      </blockquote>
    )
  }

  if (lines.every((line) => /^[-*]\s+\[[ xX]\]\s+/u.test(line))) {
    const lineOccurrences = new Map<string, number>()
    return (
      <ul className="space-y-1 text-sm leading-6 text-zinc-100">
        {lines.map((line) => {
          const occurrence = lineOccurrences.get(line) ?? 0
          lineOccurrences.set(line, occurrence + 1)
          const checked = /^[-*]\s+\[[xX]\]/u.test(line)
          return (
            <li
              key={`${keyPrefix}-task-${occurrence}-${line}`}
              className="flex items-start gap-2"
            >
              <input
                type="checkbox"
                checked={checked}
                readOnly
                className="mt-1 h-3.5 w-3.5 shrink-0 accent-cyan-400"
                aria-label={checked ? "Completed task" : "Open task"}
              />
              <span className="min-w-0">
                {renderInlineMarkdown(
                  line.replace(/^[-*]\s+\[[ xX]\]\s+/u, ""),
                  `${keyPrefix}-task-${occurrence}-${line}`,
                )}
              </span>
            </li>
          )
        })}
      </ul>
    )
  }

  if (lines.every((line) => /^[-*]\s+/u.test(line))) {
    const lineOccurrences = new Map<string, number>()
    return (
      <ul className="list-disc space-y-1 pl-5 text-sm leading-6 text-zinc-100">
        {lines.map((line) => {
          const occurrence = lineOccurrences.get(line) ?? 0
          lineOccurrences.set(line, occurrence + 1)
          return (
            <li key={`${keyPrefix}-ul-${occurrence}-${line}`}>
              {renderInlineMarkdown(
                line.replace(/^[-*]\s+/u, ""),
                `${keyPrefix}-ul-${occurrence}-${line}`,
              )}
            </li>
          )
        })}
      </ul>
    )
  }

  if (lines.every((line) => /^\d+\.\s+/u.test(line))) {
    const lineOccurrences = new Map<string, number>()
    return (
      <ol className="list-decimal space-y-1 pl-5 text-sm leading-6 text-zinc-100">
        {lines.map((line) => {
          const occurrence = lineOccurrences.get(line) ?? 0
          lineOccurrences.set(line, occurrence + 1)
          return (
            <li key={`${keyPrefix}-ol-${occurrence}-${line}`}>
              {renderInlineMarkdown(
                line.replace(/^\d+\.\s+/u, ""),
                `${keyPrefix}-ol-${occurrence}-${line}`,
              )}
            </li>
          )
        })}
      </ol>
    )
  }

  const localFileReference =
    lines.length === 1 ? parseStandaloneLocalFileLine(lines[0] ?? "") : null
  if (localFileReference) {
    return (
      <p className="break-words whitespace-pre-wrap text-sm leading-6 text-zinc-100">
        <FileReferenceLink pathname={localFileReference} />
      </p>
    )
  }

  return (
    <p className="break-words whitespace-pre-wrap text-sm leading-6 text-zinc-100">
      {renderMarkdownParagraph(lines, keyPrefix)}
    </p>
  )
}

function renderMarkdownBlocks(text: string, keyPrefix: string): ReactNode[] {
  const normalized = text.replace(/\r\n/gu, "\n").trim()
  if (!normalized) {
    return []
  }

  const nodes: ReactNode[] = []
  const codeBlockPattern = /```([a-zA-Z0-9_-]+)?\n([\s\S]*?)```/gu
  let lastIndex = 0
  let match: RegExpExecArray | null = codeBlockPattern.exec(normalized)
  let blockIndex = 0

  const pushTextBlocks = (chunk: string) => {
    const trimmed = chunk.trim()
    if (!trimmed) {
      return
    }
    for (const block of trimmed.split(/\n\s*\n/gu).filter(Boolean)) {
      const lines = block.split("\n")
      const pendingLines: string[] = []
      const flushPendingLines = () => {
        if (pendingLines.length === 0) {
          return
        }
        nodes.push(
          <Fragment key={`${keyPrefix}-text-${blockIndex}`}>
            {renderStructuredTextBlock(
              [...pendingLines],
              `${keyPrefix}-text-${blockIndex}`,
            )}
          </Fragment>,
        )
        blockIndex += 1
        pendingLines.length = 0
      }

      for (const line of lines) {
        const markdownImage = parseMarkdownImageLine(line)
        if (markdownImage) {
          flushPendingLines()
          continue
        }
        pendingLines.push(line)
      }
      flushPendingLines()
    }
  }

  while (match) {
    pushTextBlocks(normalized.slice(lastIndex, match.index))
    nodes.push(
      <CodeBlock
        key={`${keyPrefix}-code-${blockIndex}`}
        language={match[1]?.trim() ?? ""}
        code={match[2]?.replace(/\n$/u, "") ?? ""}
      />,
    )
    blockIndex += 1
    lastIndex = codeBlockPattern.lastIndex
    match = codeBlockPattern.exec(normalized)
  }
  pushTextBlocks(normalized.slice(lastIndex))
  return nodes
}

function messageTextStats(blocks: { text: string }[]): MessageTextStats {
  let characterCount = 0
  let lineCount = 0
  for (const block of blocks) {
    characterCount += block.text.length
    lineCount += 1
    let newlineIndex = block.text.indexOf("\n")
    while (newlineIndex !== -1) {
      lineCount += 1
      if (lineCount > largeMessageLineThreshold) {
        break
      }
      newlineIndex = block.text.indexOf("\n", newlineIndex + 1)
    }
    if (
      characterCount > largeMessageCharacterThreshold ||
      lineCount > largeMessageLineThreshold
    ) {
      return { characterCount, lineCount, large: true }
    }
  }
  return { characterCount, lineCount, large: false }
}

function largeMessagePreviewText(blocks: { text: string }[]): {
  text: string
  truncated: boolean
} {
  let remaining = largeMessagePreviewCharacterLimit
  const chunks: string[] = []
  for (const block of blocks) {
    if (remaining <= 0) {
      return { text: chunks.join("\n\n").trim(), truncated: true }
    }
    if (chunks.length > 0) {
      chunks.push("\n\n")
      remaining -= 2
    }
    if (block.text.length > remaining) {
      chunks.push(block.text.slice(0, remaining))
      return { text: chunks.join("").trim(), truncated: true }
    }
    chunks.push(block.text)
    remaining -= block.text.length
  }
  return { text: chunks.join("").trim(), truncated: false }
}

function LargeMessageContent(props: {
  blocks: { text: string }[]
  stats: MessageTextStats
}) {
  useRenderCounter("AgentChatV2.LargeMessageContent")
  const preview = largeMessagePreviewText(props.blocks)
  return (
    <div className="space-y-2">
      <div className="rounded border border-amber-400/30 bg-amber-950/20 px-3 py-2 text-xs leading-5 text-amber-100">
        Large message shown as raw text to keep the dashboard responsive. Full
        size: {props.stats.characterCount.toLocaleString()} characters.
        {preview.truncated
          ? ` Showing the first ${largeMessagePreviewCharacterLimit.toLocaleString()} characters.`
          : null}
      </div>
      <pre className="whitespace-pre-wrap break-words text-sm leading-6 text-zinc-100">
        {preview.text}
      </pre>
    </div>
  )
}

export function queuedMessageLabel(message: AgentChatV2Message): string {
  if (message.kind === "directoryInstruction") {
    return "Next-turn instruction"
  }
  if (message.kind === "watchdogPrompt") {
    return "Watchdog prompt"
  }
  return `${message.role} ${message.kind}`
}

export function queuedMessagePreview(message: AgentChatV2Message): string {
  const text = messageText(message).replace(/\s+/gu, " ").trim()
  if (!text) {
    return "(empty message)"
  }
  return text
}

export function messageDisplayKey(message: AgentChatV2Message): string {
  return `${message.role}:${JSON.stringify(message.content)}`
}

export function queuedMessageKeys(messages: AgentChatV2Message[]): Set<string> {
  return new Set(messages.map((message) => messageDisplayKey(message)))
}

function isActionMessage(message: AgentChatV2Message): boolean {
  return message.role === "system" || message.kind !== "chat"
}

export function transcriptItems(
  messages: AgentChatV2Message[],
): TranscriptItem[] {
  const items: TranscriptItem[] = []
  let actionMessages: AgentChatV2Message[] = []

  const flushActionMessages = () => {
    if (actionMessages.length === 0) {
      return
    }
    items.push({ type: "actions", messages: actionMessages })
    actionMessages = []
  }

  for (const message of messages) {
    if (isActionMessage(message)) {
      actionMessages.push(message)
      if (message.kind === "streamCheckpoint") {
        flushActionMessages()
      }
      continue
    }

    flushActionMessages()
    items.push({ type: "message", message })
  }

  flushActionMessages()

  return items
}

function actionIcon(message: AgentChatV2Message): string {
  const text = messageText(message).toLowerCase()
  if (text.includes("error") || text.includes("failed")) {
    return "!"
  }
  if (text.includes("command")) {
    return "$"
  }
  if (message.kind === "ticketEvent") {
    return "#"
  }
  return ">"
}

function actionTitle(message: AgentChatV2Message): string {
  const text = messageText(message) || "(empty action)"
  return `${message.kind} action at ${formatTime(message.createdAtMs)}: ${text}`
}

function actionPreviewText(message: AgentChatV2Message): string {
  const lines = (messageText(message) || "(empty action)")
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean)
  return lines.slice(-3).join("\n")
}

function defaultActionSequenceExpandedMessageId(
  messages: AgentChatV2Message[],
): string | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (message?.kind === "streamCheckpoint") {
      return message.id
    }
  }
  return null
}

export function ActionSequence(props: {
  messages: AgentChatV2Message[]
  showPreview: boolean
  autoSelectStreamCheckpoint: boolean
  onToggle: () => void
}) {
  useRenderCounter("AgentChatV2.ActionSequence")
  const defaultExpandedMessageId = props.autoSelectStreamCheckpoint
    ? defaultActionSequenceExpandedMessageId(props.messages)
    : null
  const [expandedMessageId, setExpandedMessageId] = useState<string | null>(
    () => defaultExpandedMessageId,
  )

  useEffect(() => {
    setExpandedMessageId((currentValue) => {
      if (
        currentValue &&
        props.messages.some((message) => message.id === currentValue)
      ) {
        return currentValue
      }
      return defaultExpandedMessageId
    })
  }, [defaultExpandedMessageId, props.messages])

  const expandedMessage =
    props.messages.find((message) => message.id === expandedMessageId) ?? null
  const expandedText = expandedMessage
    ? messageText(expandedMessage) || "(empty action)"
    : ""
  const previewMessage = props.messages.at(-1) ?? null
  const previewText = previewMessage ? actionPreviewText(previewMessage) : ""

  return (
    <section className="max-w-4xl rounded border border-zinc-800 bg-zinc-900/60 px-2 py-2">
      <div className="flex flex-wrap gap-1">
        {props.messages.map((message) => {
          const title = actionTitle(message)
          const expanded = message.id === expandedMessageId
          return (
            <button
              key={message.id}
              type="button"
              onClick={() => {
                setExpandedMessageId((currentValue) =>
                  currentValue === message.id ? null : message.id,
                )
                props.onToggle()
              }}
              className={`flex h-7 w-7 items-center justify-center rounded border text-xs font-semibold ${
                expanded
                  ? "border-cyan-300 bg-cyan-950 text-cyan-100"
                  : "border-zinc-700 bg-zinc-950 text-cyan-200 hover:border-cyan-700"
              }`}
              title={title}
              aria-label={title}
            >
              {actionIcon(message)}
            </button>
          )
        })}
      </div>
      {expandedMessage ? (
        <div className="mt-2 rounded border border-zinc-700 bg-zinc-950 px-3 py-2">
          <div className="mb-2 flex items-center justify-between gap-3 text-[11px] uppercase text-zinc-500">
            <span>{expandedMessage.kind}</span>
            <span>{formatTime(expandedMessage.createdAtMs)}</span>
          </div>
          <p className="whitespace-pre-wrap text-xs leading-5 text-zinc-200">
            {expandedText}
          </p>
        </div>
      ) : props.showPreview && previewMessage ? (
        <div className="mt-2 rounded border border-zinc-800 bg-zinc-950/70 px-3 py-2">
          <div className="mb-1 flex items-center justify-between gap-3 text-[11px] uppercase text-zinc-600">
            <span>{previewMessage.kind}</span>
            <span>{formatTime(previewMessage.createdAtMs)}</span>
          </div>
          <p className="line-clamp-3 whitespace-pre-wrap text-xs leading-5 text-zinc-400">
            {previewText}
          </p>
        </div>
      ) : null}
    </section>
  )
}

function MessageImagePreview(props: {
  sessionId: string
  apiRootUrl: string
  sourceUrl: string
  altText: string
}) {
  useRenderCounter("AgentChatV2.MessageImagePreview")
  const [assetUrl, setAssetUrl] = useState("")
  const [error, setError] = useState("")
  const normalizedSourceUrl = normalizeImageSource(props.sourceUrl)

  useEffect(() => {
    let active = true
    let objectUrl = ""

    async function loadImage() {
      try {
        if (/^data:image\//iu.test(normalizedSourceUrl)) {
          setAssetUrl(normalizedSourceUrl)
          setError("")
          return
        }
        const apiRootUrl = props.apiRootUrl.replace(/\/+$/u, "")
        const response = (await dashboardSessionFetch(
          `${apiRootUrl}/sessions/${encodeURIComponent(props.sessionId)}/media?source=${encodeURIComponent(normalizedSourceUrl)}`,
        )) as Response
        if (!response.ok) {
          throw new Error(`Image request failed with ${response.status}.`)
        }
        const blob = await response.blob()
        objectUrl = URL.createObjectURL(blob)
        if (!active) {
          URL.revokeObjectURL(objectUrl)
          return
        }
        setAssetUrl(objectUrl)
        setError("")
      } catch (nextError) {
        if (!active) {
          return
        }
        if (/^https?:\/\//iu.test(normalizedSourceUrl)) {
          setAssetUrl(normalizedSourceUrl)
          setError("")
          return
        }
        setAssetUrl("")
        setError(
          nextError instanceof Error ? nextError.message : "Image unavailable.",
        )
      }
    }

    void loadImage()

    return () => {
      active = false
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl)
      }
    }
  }, [normalizedSourceUrl, props.apiRootUrl, props.sessionId])

  return (
    <div className="overflow-hidden rounded border border-zinc-700 bg-zinc-950">
      <div className="flex min-h-36 items-center justify-center bg-zinc-950 p-3">
        {assetUrl ? (
          <a href={assetUrl} target="_blank" rel="noreferrer">
            <img
              src={assetUrl}
              alt={props.altText || "Shared image"}
              className="max-h-80 max-w-full object-contain"
            />
          </a>
        ) : (
          <span className="text-xs text-zinc-500">
            {error || "Loading image"}
          </span>
        )}
      </div>
      <div className="border-t border-zinc-800 px-3 py-2 text-xs text-zinc-400">
        <a
          href={assetUrl || normalizedSourceUrl}
          target="_blank"
          rel="noreferrer"
        >
          {props.altText || "Open image"}
        </a>
      </div>
    </div>
  )
}

function MessageContent(props: {
  message: AgentChatV2Message
  apiRootUrl: string
}) {
  useRenderCounter("AgentChatV2.MessageContent")
  const textBlocks = props.message.content.filter(
    (block): block is { type: "text"; text: string } => block.type === "text",
  )
  const textStats = messageTextStats(textBlocks)
  const largeTextMessage = textStats.large
  const imageReferences = [
    ...props.message.content
      .filter(
        (block): block is { type: "image"; url: string } =>
          block.type === "image",
      )
      .map((block) => ({
        sourceUrl: block.url,
        altText: "Attached image",
      })),
    ...(largeTextMessage
      ? []
      : textBlocks.flatMap((block) => textImageReferences(block.text))),
  ]

  return (
    <div className="space-y-3">
      {largeTextMessage ? (
        <LargeMessageContent blocks={textBlocks} stats={textStats} />
      ) : (
        textBlocks.flatMap((block, index) =>
          renderMarkdownBlocks(block.text, `${props.message.id}-text-${index}`),
        )
      )}
      {imageReferences.map((image) => (
        <MessageImagePreview
          key={`${props.message.id}-image-${image.sourceUrl}-${image.altText}`}
          sessionId={props.message.sessionId}
          apiRootUrl={props.apiRootUrl}
          sourceUrl={image.sourceUrl}
          altText={image.altText}
        />
      ))}
      {textBlocks.length === 0 && imageReferences.length === 0 ? (
        <p className="text-sm leading-6 text-zinc-100">(empty message)</p>
      ) : null}
    </div>
  )
}

function RawMessageContent(props: { message: AgentChatV2Message }) {
  useRenderCounter("AgentChatV2.RawMessageContent")
  const blockOccurrences = new Map<string, number>()
  return (
    <div className={`space-y-2 ${messageBodyScrollClassName}`}>
      {props.message.content.map((block) => {
        const value = block.type === "text" ? block.text : block.url
        const keySignature = `${block.type}-${value.length}-${value.slice(0, 48)}`
        const occurrence = blockOccurrences.get(keySignature) ?? 0
        blockOccurrences.set(keySignature, occurrence + 1)
        const truncated = value.length > largeMessagePreviewCharacterLimit
        const visibleValue = truncated
          ? value.slice(0, largeMessagePreviewCharacterLimit)
          : value
        return (
          <pre
            key={`${props.message.id}-raw-${occurrence}-${keySignature}`}
            className="overflow-x-auto whitespace-pre-wrap break-words rounded border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs leading-5 text-zinc-200"
          >
            <code className="font-mono">
              {visibleValue}
              {truncated
                ? `\n\n[raw view capped at ${largeMessagePreviewCharacterLimit.toLocaleString()} characters]`
                : null}
            </code>
          </pre>
        )
      })}
      {props.message.content.length === 0 ? (
        <p className="text-sm leading-6 text-zinc-100">(empty message)</p>
      ) : null}
    </div>
  )
}

export function MessageBubble(props: {
  message: AgentChatV2Message
  apiRootUrl: string
  onCopyMessageLink: (sessionId: string, messageId: string) => Promise<void>
}) {
  useRenderCounter("AgentChatV2.MessageBubble")
  const [raw, setRaw] = useState(false)
  const tone =
    props.message.role === "user"
      ? "ml-auto border-cyan-500/30 bg-cyan-950/30"
      : props.message.role === "assistant"
        ? "border-zinc-700 bg-zinc-900"
        : "border-amber-500/30 bg-amber-950/20"
  return (
    <article
      id={`message-${props.message.id}`}
      className={`max-w-3xl rounded border px-4 py-3 ${tone}`}
    >
      <div className="mb-2 flex items-center justify-between gap-3 text-[11px] uppercase text-zinc-500">
        <span>{props.message.role}</span>
        <span className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setRaw((current) => !current)}
            className="flex h-6 w-6 items-center justify-center rounded border border-zinc-800 text-[11px] text-zinc-400 hover:border-cyan-500 hover:text-cyan-100"
            title={raw ? "Show rendered message" : "Show raw message"}
            aria-label={raw ? "Show rendered message" : "Show raw message"}
          >
            {raw ? "R" : "{}"}
          </button>
          <button
            type="button"
            onClick={() =>
              void props.onCopyMessageLink(
                props.message.sessionId,
                props.message.id,
              )
            }
            className="rounded px-1 text-[11px] uppercase text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200 focus:outline-none focus:ring-1 focus:ring-cyan-400"
            title="Copy message link"
          >
            {formatTime(props.message.createdAtMs)}
          </button>
        </span>
      </div>
      {raw ? (
        <RawMessageContent message={props.message} />
      ) : (
        <div className={messageBodyScrollClassName}>
          <MessageContent
            message={props.message}
            apiRootUrl={props.apiRootUrl}
          />
        </div>
      )}
    </article>
  )
}

export function OutboxMessageBubble(props: {
  message: OutboxMessage
  index: number
  apiRootUrl: string
}) {
  useRenderCounter("AgentChatV2.OutboxMessageBubble")
  const statusLabel =
    props.message.pendingStatus === "pending" ? "Pending" : "Queued"
  const statusIcon = "⏳"
  const tone = "ml-auto border-amber-300/40 bg-amber-950/20"
  const preview = queuedMessagePreview(props.message)

  return (
    <article
      className={`max-w-3xl rounded border border-dashed px-4 py-3 opacity-90 ${tone}`}
      title={preview}
    >
      <div className="mb-2 flex items-center justify-between gap-3 text-[11px] uppercase text-cyan-100/80">
        <span className="flex min-w-0 items-center gap-2">
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded border border-current/30 bg-white/5 text-[10px] font-semibold">
            {statusIcon}
          </span>
          <span className="truncate">
            {statusLabel} {props.index + 1} ·{" "}
            {queuedMessageLabel(props.message)}
          </span>
        </span>
        <span className="shrink-0">
          {formatTime(props.message.createdAtMs)}
        </span>
      </div>
      <MessageContent message={props.message} apiRootUrl={props.apiRootUrl} />
    </article>
  )
}
