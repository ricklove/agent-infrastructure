import type { ReactNode } from "react"

type OptionGridProps = {
  label?: string
  status?: ReactNode
  columnsClassName?: string
  children: ReactNode
}

export function OptionGrid(props: OptionGridProps) {
  return (
    <div className="grid gap-2">
      {props.label || props.status ? (
        <div className="flex items-center justify-between gap-3 text-[11px] uppercase tracking-[0.14em] text-zinc-500">
          <span>{props.label ?? "Options"}</span>
          {props.status}
        </div>
      ) : null}
      <div className={props.columnsClassName ?? "grid gap-2 sm:grid-cols-2 xl:grid-cols-3"}>{props.children}</div>
    </div>
  )
}
