import { SquareImageFrame } from "./SquareImageFrame"
type DraftPostPreviewFrameProps = {
  pageName: string
  previewImage: string
  title: string
  caption: string
  expanded?: boolean
}

export function DraftPostPreviewFrame(props: DraftPostPreviewFrameProps) {
  return (
    <div className={[
      "w-full max-w-[680px] overflow-hidden rounded-[18px] border border-slate-300 bg-slate-100 shadow-[0_8px_24px_rgba(15,23,42,0.18)]",
      props.expanded ? "mb-1" : "mb-3",
    ].join(" " )}>
      <div className="flex items-center justify-between border-b border-slate-300 bg-white px-4 py-3">
        <div className="w-8" />
        <div className="text-[18px] font-semibold text-slate-900">{props.pageName}&apos;s Post</div>
        <div className="flex h-8 w-8 items-center justify-center rounded-full border border-[#1877f2] text-[22px] leading-none text-[#1877f2]">×</div>
      </div>
      <div className="bg-white">
        <div className="flex items-start gap-3 px-3 py-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#1877f2] text-sm font-semibold uppercase text-white">
            {props.pageName.split(/\s+/).filter(Boolean).slice(0,2).map((part)=>part[0]?.toUpperCase() ?? "").join("")}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[16px] font-semibold text-slate-900">{props.pageName}</div>
            <div className="mt-0.5 flex items-center gap-1 text-[12px] text-slate-500"><span>now</span><span>·</span><span>Public</span></div>
          </div>
        </div>
        <div className="px-3 pb-3">
          <div className={[props.expanded ? "line-clamp-5" : "line-clamp-3", "text-[15px] leading-5 text-slate-900"].join(" ")}>{props.caption}</div>
        </div>
        <div className="flex items-center justify-center overflow-hidden border-y border-slate-200 bg-black">
          <SquareImageFrame
            src={props.previewImage}
            alt={props.title}
            label="Preview image unavailable"
            sizeClassName={["w-full", props.expanded ? "max-h-[640px] max-w-[640px]" : "max-h-[520px] max-w-[520px]"].join(" ")}
            frameClassName="bg-black"
            imageClassName="block"
          />
        </div>
        <div className="flex items-center justify-between gap-3 px-3 py-2 text-[13px] text-slate-500">
          <div className="flex items-center gap-2"><div className="flex h-4 w-4 items-center justify-center rounded-full bg-blue-500 text-[10px] font-bold text-white">👍</div><span>0</span></div>
          <div className="flex items-center gap-3"><span>0 comments</span><span>0 shares</span></div>
        </div>
        <div className="grid grid-cols-3 border-t border-slate-200 text-[14px] font-medium text-slate-500">
          <div className="flex items-center justify-center gap-2 px-3 py-2.5">👍 <span>Like</span></div>
          <div className="flex items-center justify-center gap-2 border-l border-slate-200 px-3 py-2.5">💬 <span>Comment</span></div>
          <div className="flex items-center justify-center gap-2 border-l border-slate-200 px-3 py-2.5">↗ <span>Share</span></div>
        </div>
      </div>
    </div>
  )
}
