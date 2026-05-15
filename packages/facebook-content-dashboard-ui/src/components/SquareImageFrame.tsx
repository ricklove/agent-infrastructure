import { useEffect, useState } from "react"

type SquareImageFrameProps = {
  src: string
  alt: string
  sizeClassName?: string
  frameClassName?: string
  imageClassName?: string
  label?: string
}

export function SquareImageFrame(props: SquareImageFrameProps) {
  const [broken, setBroken] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const hasSrc = Boolean(props.src && props.src.trim())

  useEffect(() => {
    setBroken(false)
    setLoaded(false)
  }, [props.src])

  return (
    <div
      className={[
        "relative flex aspect-square shrink-0 items-center justify-center overflow-hidden rounded-lg bg-zinc-950",
        props.sizeClassName ?? "w-full",
        props.frameClassName ?? "",
      ].join(" ")}
    >
      {!hasSrc || broken || !loaded ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-zinc-900 text-zinc-500">
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em]">
            {!hasSrc ? props.label ?? "No image" : broken ? props.label ?? "Image unavailable" : "Loading image"}
          </div>
        </div>
      ) : null}
      {hasSrc ? (
        <img
          src={props.src}
          alt={props.alt}
          draggable={false}
          onLoad={() => setLoaded(true)}
          onError={() => {
            setBroken(true)
            setLoaded(false)
          }}
          className={[
            "h-full max-h-full w-full max-w-full object-contain",
            loaded && !broken ? "opacity-100" : "opacity-0",
            props.imageClassName ?? "",
          ].join(" ")}
        />
      ) : null}
    </div>
  )
}
