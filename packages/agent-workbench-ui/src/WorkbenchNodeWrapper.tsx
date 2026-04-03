import { NodeResizer } from "reactflow"

type WorkbenchNodeWrapperProps = {
  children: JSX.Element
  label: string
  resizable?: boolean
  selected: boolean
}

export function WorkbenchNodeWrapper({
  children,
  label,
  resizable = true,
  selected,
}: WorkbenchNodeWrapperProps) {
  return (
    <>
      {resizable ? (
        <NodeResizer
          isVisible={selected}
          lineClassName="!border-cyan-300/70"
          handleClassName="!h-3 !w-3 !rounded-full !border-2 !border-cyan-200 !bg-slate-950"
        />
      ) : null}
      <div className="absolute left-2 top-0 z-10 -translate-y-1/2 cursor-grab rounded-full border border-slate-300/80 bg-white px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-600 shadow-sm active:cursor-grabbing">
        {label}
      </div>
      <div className="relative h-full w-full nodrag nopan nowheel">
        {children}
      </div>
    </>
  )
}
