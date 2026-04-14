import {
  type DashboardEnterStyle,
  isDashboardSendShortcut,
} from "@agent-infrastructure/dashboard-plugin"
import { observer, useValue } from "@legendapp/state/react"
import { useRenderCounter } from "@agent-infrastructure/render-diagnostics"
import {
  type ChangeEvent,
  type ClipboardEvent,
  type FormEvent,
  type KeyboardEvent,
  useRef,
} from "react"
import type {
  AgentChatV2Actions,
  AgentChatV2ComposerImage,
  AgentChatV2Message,
  AgentChatV2Session,
  AgentChatV2Store,
} from "./AgentChatV2Store"

type AgentChatV2ComposerProps = {
  activeSession: AgentChatV2Session
  composerImages: AgentChatV2ComposerImage[]
  composerImageError: string
  enterStyle: DashboardEnterStyle
  queuedMessages: AgentChatV2Message[]
  store: AgentChatV2Store
  actions: AgentChatV2Actions
  onComposerImagesChange: (
    updater:
      | AgentChatV2ComposerImage[]
      | ((current: AgentChatV2ComposerImage[]) => AgentChatV2ComposerImage[]),
  ) => void
  onComposerImageErrorChange: (value: string) => void
}

function readImageFile(file: File): Promise<AgentChatV2ComposerImage> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error("Image read failed."))
    reader.onload = () => {
      const dataUrl = typeof reader.result === "string" ? reader.result : ""
      if (!dataUrl) {
        reject(new Error("Image read failed."))
        return
      }
      resolve({
        id: crypto.randomUUID(),
        dataUrl,
      })
    }
    reader.readAsDataURL(file)
  })
}

function composerStatusLabel(session: AgentChatV2Session): string {
  if (session.activity.status === "running") {
    return "Working"
  }
  if (session.activity.status === "queued") {
    return "Queued"
  }
  if (session.activity.status === "error") {
    return "Error"
  }
  if (session.activity.status === "interrupted") {
    return "Interrupted"
  }
  return "Idle"
}

function composerStatusTone(session: AgentChatV2Session): string {
  if (session.activity.status === "running") {
    return "border-emerald-400/30 bg-emerald-400/10 text-emerald-200"
  }
  if (session.activity.status === "queued") {
    return "border-amber-400/30 bg-amber-400/10 text-amber-100"
  }
  if (session.activity.status === "error") {
    return "border-rose-400/30 bg-rose-400/10 text-rose-100"
  }
  if (session.activity.status === "interrupted") {
    return "border-cyan-400/30 bg-cyan-400/10 text-cyan-100"
  }
  return "border-white/10 bg-white/5 text-zinc-300"
}

function formatElapsed(value: number | null): string | null {
  if (!value) {
    return null
  }
  const elapsedSeconds = Math.max(0, Math.floor((Date.now() - value) / 1000))
  if (elapsedSeconds < 60) {
    return `${elapsedSeconds}s`
  }
  return `${Math.floor(elapsedSeconds / 60)}m`
}

function composerStatusItems(
  session: AgentChatV2Session,
  queuedMessages: AgentChatV2Message[],
): string[] {
  const items = [composerStatusLabel(session)]
  const elapsed = formatElapsed(session.activity.startedAtMs)
  if (elapsed && session.activity.status === "running") {
    items.push(elapsed)
  }
  if (session.activity.waitingFlags.length > 0) {
    items.push(session.activity.waitingFlags.join(", "))
  }
  if (queuedMessages.length > 0) {
    items.push(`queued ${queuedMessages.length}`)
  }
  if (session.activity.backgroundProcessCount > 0) {
    items.push(`bg ${session.activity.backgroundProcessCount}`)
  }
  if (session.activity.status === "error" && session.activity.lastError) {
    items.push(session.activity.lastError)
  }
  return items
}

export const AgentChatV2Composer = observer(function AgentChatV2Composer(
  props: AgentChatV2ComposerProps,
) {
  useRenderCounter("AgentChatV2Composer")
  const imageInputRef = useRef<HTMLInputElement | null>(null)
  const composerText = useValue(props.store.state$.composerText)
  const sending = useValue(props.store.state$.sending)
  const interrupting = useValue(props.store.state$.interrupting)
  const composerStatus = composerStatusItems(
    props.activeSession,
    props.queuedMessages,
  )

  async function submitMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    await props.actions.sendMessage(props.composerImages)
    props.onComposerImagesChange([])
  }

  function handleComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (
      event.key === "Escape" &&
      props.activeSession.activity.status === "running" &&
      !interrupting
    ) {
      event.preventDefault()
      void props.actions.interruptSession()
      return
    }

    if (!isDashboardSendShortcut(event, props.enterStyle)) {
      return
    }
    event.preventDefault()
    void props.actions
      .sendMessage(props.composerImages)
      .then(() => props.onComposerImagesChange([]))
  }

  async function handleComposerPaste(
    event: ClipboardEvent<HTMLTextAreaElement>,
  ) {
    const imageFiles = Array.from(event.clipboardData.items || [])
      .filter((item) => item.type.startsWith("image/"))
      .map((item) => item.getAsFile())
      .filter((file): file is File => file !== null)
    if (imageFiles.length === 0) {
      return
    }

    event.preventDefault()
    props.onComposerImageErrorChange("")
    try {
      const nextImages = await Promise.all(imageFiles.map(readImageFile))
      props.onComposerImagesChange((current) => [...current, ...nextImages])
    } catch (error) {
      props.onComposerImageErrorChange(
        error instanceof Error ? error.message : "Image paste failed.",
      )
    }
  }

  async function handleImageInputChange(event: ChangeEvent<HTMLInputElement>) {
    const imageFiles = Array.from(event.target.files || []).filter((file) =>
      file.type.startsWith("image/"),
    )
    event.target.value = ""
    if (imageFiles.length === 0) {
      return
    }

    props.onComposerImageErrorChange("")
    try {
      const nextImages = await Promise.all(imageFiles.map(readImageFile))
      props.onComposerImagesChange((current) => [...current, ...nextImages])
    } catch (error) {
      props.onComposerImageErrorChange(
        error instanceof Error ? error.message : "Image selection failed.",
      )
    }
  }

  return (
    <form
      onSubmit={(event) => void submitMessage(event)}
      className="border-t border-zinc-800 bg-zinc-950 p-4"
    >
      {props.composerImages.length > 0 ? (
        <div className="mb-3 rounded border border-cyan-500/30 bg-cyan-950/20 px-3 py-3">
          <div className="mb-2 flex items-center justify-between gap-3">
            <p className="text-xs font-semibold uppercase text-cyan-200">
              Images to send
            </p>
            <button
              type="button"
              onClick={() => props.onComposerImagesChange([])}
              className="rounded border border-zinc-700 px-2 py-1 text-xs text-zinc-300 hover:border-cyan-600"
            >
              Clear
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {props.composerImages.map((image) => (
              <div
                key={image.id}
                className="overflow-hidden rounded border border-zinc-700 bg-zinc-950"
              >
                <img
                  src={image.dataUrl}
                  alt="Selected attachment"
                  className="h-24 w-24 object-contain"
                />
                <button
                  type="button"
                  onClick={() =>
                    props.onComposerImagesChange((current) =>
                      current.filter((entry) => entry.id !== image.id),
                    )
                  }
                  className="block w-full border-t border-zinc-800 px-2 py-1 text-xs text-zinc-400 hover:text-zinc-100"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        </div>
      ) : null}
      {props.composerImageError ? (
        <p className="mb-2 text-xs text-red-300">{props.composerImageError}</p>
      ) : null}
      <div className="relative rounded border border-zinc-700 bg-zinc-900 px-3 pb-2 pt-5 focus-within:border-cyan-400">
        <div className="absolute -top-3 left-3 flex items-center gap-2">
          <span
            className={`inline-flex max-w-[calc(100vw-7rem)] items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] backdrop-blur ${composerStatusTone(props.activeSession)}`}
            title={composerStatus.slice(1).join(" · ") || undefined}
          >
            <span className="truncate">{composerStatus[0]}</span>
            {composerStatus.slice(1, 2).map((item) => (
              <span key={item} className="truncate normal-case tracking-normal">
                {item}
              </span>
            ))}
            {sending ? (
              <span className="normal-case tracking-normal">sending...</span>
            ) : null}
          </span>
        </div>
        <textarea
          value={composerText}
          onChange={(event) =>
            props.store.state$.composerText.set(event.target.value)
          }
          onKeyDown={handleComposerKeyDown}
          onPaste={(event) => void handleComposerPaste(event)}
          rows={3}
          placeholder=""
          aria-label="Message"
          className="block w-full resize-none border-0 bg-transparent p-0 text-sm text-zinc-100 outline-none"
        />
        <div className="mt-2 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <input
              ref={imageInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(event) => void handleImageInputChange(event)}
            />
            <button
              type="button"
              onClick={() => imageInputRef.current?.click()}
              className="flex h-8 w-8 items-center justify-center rounded border border-zinc-700 text-lg font-semibold text-cyan-100 hover:border-cyan-500"
              title="Add image"
              aria-label="Add image"
            >
              +
            </button>
          </div>
          <button
            type="submit"
            disabled={
              sending ||
              (!composerText.trim() && props.composerImages.length === 0)
            }
            className="flex h-8 w-8 items-center justify-center rounded bg-cyan-500 text-lg font-semibold text-zinc-950 disabled:opacity-50"
            title={sending ? "Sending" : "Send"}
            aria-label={sending ? "Sending" : "Send"}
          >
            ↑
          </button>
        </div>
      </div>
    </form>
  )
})
