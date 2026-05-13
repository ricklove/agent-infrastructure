import type { ReactNode } from "react"

import { PanelLayout } from "./PanelLayout"

type ResizableSidePanelLayoutProps = {
  children: ReactNode
  panel: ReactNode
  className?: string
  contentClassName?: string
  panelClassName?: string
  initialPanelWidth?: number
  minPanelWidth?: number
  maxPanelWidth?: number
  storageKey?: string
}

export function ResizableSidePanelLayout({
  children,
  panel,
  className,
  contentClassName,
  panelClassName,
  initialPanelWidth,
  minPanelWidth,
  maxPanelWidth,
  storageKey,
}: ResizableSidePanelLayoutProps) {
  return (
    <PanelLayout
      className={className}
      contentClassName={contentClassName}
      panelClassName={panelClassName}
      panels={[
        {
          id: "inspector",
          content: panel,
          initialWidth: initialPanelWidth,
          minWidth: minPanelWidth,
          maxWidth: maxPanelWidth,
        },
      ]}
      storageKeyPrefix={storageKey}
    >
      {children}
    </PanelLayout>
  )
}
