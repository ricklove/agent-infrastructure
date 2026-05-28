import { SquareImageFrame } from "./SquareImageFrame"
type SourcePostPreviewFrameProps = {
  sourcePage: string
  publishDateLabel: string
  previewText: string
  previewLink: string | null
  previewImage: string
  title: string
  pageInitials: string
  likesLabel: string
  commentsLabel: string
  sharesLabel: string
}

export function SourcePostPreviewFrame(props: SourcePostPreviewFrameProps) {
  return (
    <div className="mb-3 w-full max-w-[680px] overflow-hidden rounded-[18px] border border-slate-300 bg-slate-100 shadow-[0_8px_24px_rgba(15,23,42,0.18)]">
      <div className="flex items-center justify-between border-b border-slate-300 bg-white px-4 py-3">
        <div className="w-8" />
        <div className="text-[18px] font-semibold text-slate-900">{props.sourcePage}&apos;s Post</div>
        <div className="flex h-8 w-8 items-center justify-center rounded-full border border-[#1877f2] text-[22px] leading-none text-[#1877f2]">×</div>
      </div>
      <div className="bg-white">
        <div className="flex items-start gap-3 px-3 py-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#1877f2] text-sm font-semibold text-white">
            {props.pageInitials}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[16px] font-semibold text-slate-900">{props.sourcePage}</div>
            <div className="mt-0.5 flex items-center gap-1 text-[12px] text-slate-500">
              <span>{props.publishDateLabel}</span>
              <span>·</span>
              <span>Shared with Public</span>
            </div>
          </div>
        </div>
        <div className="px-3 pb-3">
          <div className="line-clamp-4 whitespace-pre-wrap text-[15px] leading-5 text-slate-900">{props.previewText}</div>
          {props.previewLink ? (
            <div className="mt-2 truncate text-[12px] text-slate-500">{props.previewLink}</div>
          ) : null}
        </div>
        <div className="flex items-center justify-center overflow-hidden border-y border-slate-200 bg-black">
          <SquareImageFrame
            src={props.previewImage}
            alt={props.title}
            label="Original image unavailable"
            sizeClassName="w-full max-h-[520px] max-w-[520px]"
            frameClassName="bg-black"
            imageClassName="block"
          />
        </div>
        <div className="flex items-center justify-between gap-3 px-3 py-2 text-[13px] text-slate-500">
          <div className="flex items-center gap-2">
            <div className="flex h-4 w-4 items-center justify-center rounded-full bg-blue-500 text-[10px] font-bold text-white">👍</div>
            <span>{props.likesLabel}</span>
          </div>
          <div className="flex items-center gap-3">
            <span>{props.commentsLabel} comments</span>
            <span>{props.sharesLabel} shares</span>
          </div>
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
