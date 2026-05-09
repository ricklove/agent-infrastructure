import { mkdirSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"
import type {
  DraftRecord,
  GenerateImageDraftRequest,
  GenerateImageDraftResponse,
  GenerateTextDraftsRequest,
  GenerateTextDraftsResponse,
} from "@agent-infrastructure/facebook-content-dashboard-core"

const outputRoot = "/home/ec2-user/workspace/tmp/content-creation-generated"

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function requireOpenAiKey(): string {
  const apiKey = process.env.OPENAI_API_KEY?.trim()
  if (!apiKey) {
    throw new Error("Codex provider is not configured. Set OPENAI_API_KEY on the worker.")
  }
  return apiKey
}

function escapeSvgText(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;")
}

function buildMockImagePreview(
  title: string,
  captionPreview: string,
  index: number,
  timestamp: number,
): string {
  const palettes = [
    { top: "#0f172a", bottom: "#1d4ed8", accent: "#f59e0b" },
    { top: "#111827", bottom: "#6d28d9", accent: "#22c55e" },
    { top: "#172554", bottom: "#991b1b", accent: "#fb7185" },
  ] as const

  const palette = palettes[index % palettes.length]
  const trimmedCaption = captionPreview.replace(/\s+/gu, " ").trim()
  const lines = [
    `[MOCK IMAGE ${index + 1}]`,
    title.slice(0, 44),
    trimmedCaption.slice(0, 96),
  ]

  const lineMarkup = lines
    .map(
      (line, lineIndex) =>
        `<text x="64" y="${150 + lineIndex * 86}" fill="#f8fafc" font-size="${
          lineIndex === 0 ? 34 : lineIndex === 1 ? 58 : 30
        }" font-family="Inter, Arial, sans-serif" font-weight="${
          lineIndex === 1 ? 700 : 500
        }">${escapeSvgText(line)}</text>`,
    )
    .join("")

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024" role="img" aria-label="Mock generated preview">
  <defs>
    <linearGradient id="mockGradient-${timestamp}-${index}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${palette.top}" />
      <stop offset="100%" stop-color="${palette.bottom}" />
    </linearGradient>
  </defs>
  <rect width="1024" height="1024" rx="48" fill="url(#mockGradient-${timestamp}-${index})" />
  <rect x="64" y="64" width="896" height="896" rx="40" fill="rgba(15, 23, 42, 0.16)" stroke="rgba(248, 250, 252, 0.24)" />
  <circle cx="156" cy="880" r="34" fill="${palette.accent}" />
  <rect x="214" y="846" width="544" height="18" rx="9" fill="rgba(248, 250, 252, 0.80)" />
  <rect x="214" y="886" width="420" height="16" rx="8" fill="rgba(248, 250, 252, 0.48)" />
  ${lineMarkup}
</svg>`

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}

function parseJsonArray<T>(raw: string): T[] {
  const trimmed = raw.trim()
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]+?)\s*```/u)?.[1] ?? trimmed
  const start = fenced.indexOf("[")
  const end = fenced.lastIndexOf("]")
  if (start === -1 || end === -1) {
    throw new Error("Codex provider returned non-JSON text.")
  }
  return JSON.parse(fenced.slice(start, end + 1)) as T[]
}

function responseOutputText(payload: any): string {
  if (typeof payload?.output_text === "string" && payload.output_text.trim()) {
    return payload.output_text.trim()
  }
  const textParts: string[] = []
  for (const item of payload?.output ?? []) {
    for (const content of item?.content ?? []) {
      if (typeof content?.text === "string") {
        textParts.push(content.text)
      }
    }
  }
  return textParts.join("\n").trim()
}

export async function generateTextDrafts(
  request: GenerateTextDraftsRequest,
): Promise<GenerateTextDraftsResponse> {
  const source = request.sourcePost
  if (!source) {
    return {
      ok: false,
      error: "Source post is required for text generation.",
    }
  }

  const destinationPage = request.destinationPage?.trim() || "Your page"

  if (request.provider === "mock") {
    await delay(900)
    const timestamp = Date.now()
    const captions = [
      `[MOCK TEXT VARIANT 1] Rebuilt from the source into a community-support message for ${destinationPage}. ${source.adaptationRule}`,
      `[MOCK TEXT VARIANT 2] THANK YOU TO THE PEOPLE WHO KEEP SHOWING UP. ${source.hook.toUpperCase()}`,
      `[MOCK TEXT VARIANT 3] ${source.whyItWorked} This draft deliberately reframes the source into a more protective and story-led post for ${destinationPage}.`,
    ] as const

    return {
      ok: true,
      drafts: [
        {
          id: `gen-${timestamp}-1`,
          sourceId: source.id,
          title: `[MOCK] ${destinationPage} - Community support`,
          format: "image",
          stage: "draft",
          positioning: "Supportive, civic, family-safe",
          captionPreview: captions[0],
          goal: "Generate a visibly transformed supportive derivative",
          originality: "Mock generation",
          tone: "warm, clear, civic",
          note: "Mock generation visibly transformed the source text.",
          previewMediaPath: buildMockImagePreview(
            `[MOCK] ${destinationPage} - Community support`,
            captions[0],
            0,
            timestamp,
          ),
          textProvider: "mock",
          imageProvider: "mock",
          generatedKind: "generated",
        },
        {
          id: `gen-${timestamp}-2`,
          sourceId: source.id,
          title: `[MOCK] ${destinationPage} - Gratitude statement`,
          format: "quote",
          stage: "draft",
          positioning: "Short gratitude-led statement",
          captionPreview: captions[1],
          goal: "Fast-scrolling agreement post",
          originality: "Mock generation",
          tone: "brief, respectful, declarative",
          note: "Mock generation converted the source into a loud gratitude-led variant.",
          previewMediaPath: buildMockImagePreview(
            `[MOCK] ${destinationPage} - Gratitude statement`,
            captions[1],
            1,
            timestamp,
          ),
          textProvider: "mock",
          imageProvider: "mock",
          generatedKind: "generated",
        },
        {
          id: `gen-${timestamp}-3`,
          sourceId: source.id,
          title: `[MOCK] ${destinationPage} - Story-led perspective`,
          format: "story",
          stage: "draft",
          positioning: "Empathy and public-service framing",
          captionPreview: captions[2],
          goal: "Broader reach beyond core followers",
          originality: "Mock generation",
          tone: "protective, grounded, useful",
          note: "Mock generation widened the structure and visibly changed the source language.",
          previewMediaPath: buildMockImagePreview(
            `[MOCK] ${destinationPage} - Story-led perspective`,
            captions[2],
            2,
            timestamp,
          ),
          textProvider: "mock",
          imageProvider: "mock",
          generatedKind: "generated",
        },
      ],
    }
  }

  try {
    const apiKey = requireOpenAiKey()
    const model = process.env.FACEBOOK_CONTENT_DASHBOARD_CODEX_TEXT_MODEL?.trim() || "gpt-5"
    const prompt = [
      `Destination page: ${destinationPage}`,
      `Source page: ${source.sourcePage}`,
      `Source title: ${source.title}`,
      `Pattern: ${source.pattern}`,
      `Angle: ${source.angle}`,
      `Hook: ${source.hook}`,
      `Why it worked: ${source.whyItWorked}`,
      `Adaptation rule: ${source.adaptationRule}`,
      `Caution: ${source.caution}`,
      "Return exactly JSON, as an array of 3 objects.",
      'Each object must contain: title, format, positioning, captionPreview, goal, originality, tone, note.',
      "Make the drafts clearly different from each other and suitable for a Facebook page.",
      "Do not include markdown.",
    ].join("\n")

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        input: prompt,
      }),
    })
    const payload = (await response.json()) as any
    if (!response.ok) {
      return {
        ok: false,
        error: payload?.error?.message ?? "Codex text generation failed.",
      }
    }

    const items = parseJsonArray<{
      title: string
      format: DraftRecord["format"]
      positioning: string
      captionPreview: string
      goal: string
      originality: string
      tone: string
      note: string
    }>(responseOutputText(payload))

    const timestamp = Date.now()
    return {
      ok: true,
      drafts: items.slice(0, 3).map((item, index) => ({
        id: `gen-${timestamp}-${index + 1}`,
        sourceId: source.id,
        title: item.title,
        format: item.format,
        stage: "draft",
        positioning: item.positioning,
        captionPreview: item.captionPreview,
        goal: item.goal,
        originality: item.originality || "Codex generation",
        tone: item.tone,
        note: item.note,
        previewMediaPath: source.mediaPath,
        textProvider: "codex",
        imageProvider: "seed",
        generatedKind: "generated",
      })),
    }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Codex text generation failed.",
    }
  }
}

export async function generateImageDraft(
  request: GenerateImageDraftRequest,
): Promise<GenerateImageDraftResponse> {
  const source = request.sourcePost
  if (!source) {
    return {
      ok: false,
      error: "Source post is required for image generation.",
    }
  }

  const destinationPage = request.destinationPage?.trim() || "Your page"

  if (request.provider === "mock") {
    const timestamp = Date.now()
    const imageIndex = Math.abs(
      request.draft.id
        .split("")
        .reduce((total, character) => total + character.charCodeAt(0), 0),
    ) % 3

    return {
      ok: true,
      previewMediaPath: buildMockImagePreview(
        request.draft.title,
        request.draft.captionPreview,
        imageIndex,
        timestamp,
      ),
      note: "Mock image generation applied a visible preview transformation.",
      imageProvider: "mock",
    }
  }

  try {
    const apiKey = requireOpenAiKey()
    const model = process.env.FACEBOOK_CONTENT_DASHBOARD_CODEX_IMAGE_MODEL?.trim() || "gpt-image-1"
    const prompt = [
      `Create a Facebook-ready image for destination page ${destinationPage}.`,
      `Source post title: ${source.title}`,
      `Winning pattern: ${source.pattern}`,
      `Angle: ${source.angle}`,
      `Draft title: ${request.draft.title}`,
      `Draft caption: ${request.draft.captionPreview}`,
      `Positioning: ${request.draft.positioning}`,
      `Tone: ${request.draft.tone}`,
      "Avoid logos, watermarks, and synthetic photojournalism. Make it feel supportive, civic, and shareable.",
    ].join("\n")

    const response = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        prompt,
        size: "1024x1024",
      }),
    })
    const payload = (await response.json()) as any
    if (!response.ok) {
      return {
        ok: false,
        error: payload?.error?.message ?? "Codex image generation failed.",
      }
    }

    const b64 = payload?.data?.[0]?.b64_json
    if (typeof b64 !== "string" || !b64) {
      return {
        ok: false,
        error: "Codex image generation returned no image data.",
      }
    }

    mkdirSync(outputRoot, { recursive: true })
    const filePath = resolve(outputRoot, `${request.draft.id}-${Date.now()}.png`)
    writeFileSync(filePath, Buffer.from(b64, "base64"))

    return {
      ok: true,
      previewMediaPath: filePath,
      note: "Codex generated a new preview image.",
      imageProvider: "codex",
    }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Codex image generation failed.",
    }
  }
}
