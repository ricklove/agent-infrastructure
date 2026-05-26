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

  useEffect(() => {
    setBroken(false)
  }, [props.src])

  return (
    <div
      className={[
        "relative flex aspect-square items-center justify-center overflow-hidden rounded-lg bg-zinc-950",
        props.sizeClassName ?? "w-full",
        props.frameClassName ?? "",
      ].join(" ")}
    >
      {broken ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-zinc-900 text-zinc-500">
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em]">
            {props.label ?? "Image unavailable"}
          </div>
        </div>
      ) : null}
      <img
        src={props.src}
        alt={props.alt}
        onError={() => setBroken(true)}
        className={[
          "h-full max-h-full w-full max-w-full object-contain",
          broken ? "opacity-0" : "opacity-100",
          props.imageClassName ?? "",
        ].join(" ")}
      />
    </div>
  )
}
