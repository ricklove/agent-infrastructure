import { useState, type ReactNode } from "react"

type DebugImageCardProps = {
  href: string
  title: string
  subtitle?: string
  imageSrc?: string
  fallback: ReactNode
}

const previewWellStyle = {
  width: 100,
  height: 100,
  minWidth: 100,
  minHeight: 100,
}

export function DebugImageCard({
  href,
  title,
  subtitle = "",
  imageSrc,
  fallback,
}: DebugImageCardProps) {
  const [imageBroken, setImageBroken] = useState(false)
  const showImage = Boolean(imageSrc) && !imageBroken

  return (
    <a
      className="group flex w-[360px] max-w-full flex-none items-start gap-3 self-start rounded border border-white/10 bg-zinc-950/90 p-3 transition hover:border-cyan-300/60"
      href={href}
    >
      <div
        className="flex flex-none items-center justify-center overflow-hidden rounded border border-white/10 bg-black"
        style={previewWellStyle}
      >
        {showImage ? (
          <img
            alt={title}
            className="h-full w-full object-contain"
            onError={() => setImageBroken(true)}
            src={imageSrc}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            {fallback}
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-white group-hover:text-cyan-100">
          {title}
        </div>
        {subtitle ? (
          <div className="mt-1 text-xs text-white/55">{subtitle}</div>
        ) : null}
      </div>
    </a>
  )
}
