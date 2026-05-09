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
  if (request.provider === "mock") {
    const timestamp = Date.now()
    return {
      ok: true,
      drafts: [1, 2, 3].map((index) => ({
        id: `gen-${timestamp}-${index}`,
        sourceId: request.sourcePost.id,
        title: `${request.sourcePost.title} · Mock variant ${index}`,
        format: index === 2 ? "quote" : index === 3 ? "story" : "image",
        stage: "draft",
        positioning: index === 1 ? "Supportive, civic, family-safe" : index === 2 ? "Short gratitude-led statement" : "Empathy and public-service framing",
        captionPreview:
          index === 1
            ? `Support looks strongest when it is visible in everyday community life. ${request.sourcePost.adaptationRule}`
            : index === 2
              ? `Respect the people who keep showing up for our neighborhoods. ${request.sourcePost.hook}`
              : `${request.sourcePost.whyItWorked} Reframed into a safer, more original story-led draft for your page.`,
        goal: index === 1 ? "Generate a high-share supportive derivative" : index === 2 ? "Fast-scrolling agreement post" : "Broader reach beyond core followers",
        originality: "Mock generation",
        tone: index === 1 ? "warm, clear, civic" : index === 2 ? "brief, respectful, declarative" : "protective, grounded, useful",
        note: "Mock provider generated this draft.",
        previewMediaPath: request.sourcePost.mediaPath,
        textProvider: "mock",
        imageProvider: "seed",
        generatedKind: "generated",
      })),
    }
  }

  try {
    const apiKey = requireOpenAiKey()
    const model = process.env.FACEBOOK_CONTENT_DASHBOARD_CODEX_TEXT_MODEL?.trim() || "gpt-5"
    const prompt = [
      `Destination page: ${request.destinationPage}`,
      `Source page: ${request.sourcePost.sourcePage}`,
      `Source title: ${request.sourcePost.title}`,
      `Pattern: ${request.sourcePost.pattern}`,
      `Angle: ${request.sourcePost.angle}`,
      `Hook: ${request.sourcePost.hook}`,
      `Why it worked: ${request.sourcePost.whyItWorked}`,
      `Adaptation rule: ${request.sourcePost.adaptationRule}`,
      `Caution: ${request.sourcePost.caution}`,
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
        sourceId: request.sourcePost.id,
        title: item.title,
        format: item.format,
        stage: "draft",
        positioning: item.positioning,
        captionPreview: item.captionPreview,
        goal: item.goal,
        originality: item.originality || "Codex generation",
        tone: item.tone,
        note: item.note,
        previewMediaPath: request.sourcePost.mediaPath,
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
  if (request.provider === "mock") {
    return {
      ok: true,
      previewMediaPath: request.sourcePost.mediaPath,
      note: "Mock image generation kept the source image.",
      imageProvider: "mock",
    }
  }

  try {
    const apiKey = requireOpenAiKey()
    const model = process.env.FACEBOOK_CONTENT_DASHBOARD_CODEX_IMAGE_MODEL?.trim() || "gpt-image-1"
    const prompt = [
      `Create a Facebook-ready image for destination page ${request.destinationPage}.`,
      `Source post title: ${request.sourcePost.title}`,
      `Winning pattern: ${request.sourcePost.pattern}`,
      `Angle: ${request.sourcePost.angle}`,
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
