import { type ReactNode } from "react";
import { type PanelConfig } from "@/types/dashboard.types";
import { BarChart3 } from "lucide-react";
import { cn } from "@/lib/utils/class-utils";

interface PanelPreviewContainerProps {
  config: PanelConfig;
  children: ReactNode;
  className?: string;
}

/**
 * Lightweight container for panel previews in QueryResults
 * Shows title but no edit controls
 */
export function PanelPreviewContainer({
  config,
  children,
  className,
}: PanelPreviewContainerProps) {
  return (
    <div
      className={cn(
        "h-full w-full bg-card border rounded-lg shadow-sm overflow-hidden relative",
        className
      )}
    >
      {/* Simple Header */}
      <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between px-3 py-2 bg-card/95 backdrop-blur-sm border-b">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-medium">
            {config.title || `${config.type} Preview`}
          </span>
        </div>
      </div>

      {/* Panel Content */}
      <div className="h-full w-full pt-10">
        {children}
      </div>
    </div>
  );
}