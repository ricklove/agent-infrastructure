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

function requireOpenAiKey(): string {
  const apiKey = process.env.OPENAI_API_KEY?.trim()
  if (!apiKey) {
    throw new Error("Codex provider is not configured. Set OPENAI_API_KEY on the worker.")
  }
  return apiKey
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
    const timestamp = Date.now()
    return {
      ok: true,
      drafts: [
        {
          id: `gen-${timestamp}-1`,
          sourceId: source.id,
          title: `${destinationPage} · Community support`,
          format: "image",
          stage: "draft",
          positioning: "Supportive, civic, family-safe",
          captionPreview: `Support shows up in everyday moments too. ${source.adaptationRule}`,
          goal: "High-share supportive derivative",
          originality: "Mock generation",
          tone: "warm, clear, civic",
          note: "Mock provider generated a community-led derivative.",
          previewMediaPath: source.mediaPath,
          textProvider: "mock",
          imageProvider: "seed",
          generatedKind: "generated",
        },
        {
          id: `gen-${timestamp}-2`,
          sourceId: source.id,
          title: `${destinationPage} · Gratitude statement`,
          format: "quote",
          stage: "draft",
          positioning: "Short gratitude-led statement",
          captionPreview: `Respect the people who keep showing up when it counts. ${source.hook}`,
          goal: "Fast-scrolling agreement post",
          originality: "Mock generation",
          tone: "brief, respectful, declarative",
          note: "Mock provider generated a short gratitude variant.",
          previewMediaPath: source.mediaPath,
          textProvider: "mock",
          imageProvider: "seed",
          generatedKind: "generated",
        },
        {
          id: `gen-${timestamp}-3`,
          sourceId: source.id,
          title: `${destinationPage} · Story-led perspective`,
          format: "story",
          stage: "draft",
          positioning: "Empathy and public-service framing",
          captionPreview: `${source.whyItWorked} Reframed into a safer, more original story-led draft for ${destinationPage}.`,
          goal: "Broader reach beyond core followers",
          originality: "Mock generation",
          tone: "protective, grounded, useful",
          note: "Mock provider generated a broader-reach story variant.",
          previewMediaPath: source.mediaPath,
          textProvider: "mock",
          imageProvider: "seed",
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
    return {
      ok: true,
      previewMediaPath: source.mediaPath,
      note: "Mock image generation kept the source image.",
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
