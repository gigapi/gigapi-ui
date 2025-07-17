import { useMemo } from "react";
import { type PanelConfig, type NDJSONRecord, type PanelProps } from "@/types/dashboard.types";
import { getPanelComponent } from "./panels";
import { AlertCircle } from "lucide-react";
import { PanelErrorBoundary } from "./PanelErrorBoundary";

interface PanelRendererProps {
  config: PanelConfig;
  data: NDJSONRecord[];
  isEditMode?: boolean;
  isPreview?: boolean;
  isSelected?: boolean;
  onSelect?: () => void;
  onTimeRangeUpdate?: (timeRange: any) => void;
  height?: string | number;
  width?: string | number;
  className?: string;
}

/**
 * Unified panel renderer that handles all panel types consistently
 * Used by both Dashboard display and QueryResults preview
 */
export function PanelRenderer({
  config,
  data,
  isEditMode = false,
  isPreview = false,
  isSelected = false,
  onSelect,
  onTimeRangeUpdate,
  height,
  width,
  className,
}: PanelRendererProps) {
  // Get the appropriate panel component
  const PanelComponent = useMemo(() => {
    return getPanelComponent(config.type);
  }, [config.type]);

  // Prepare panel props
  const panelProps: PanelProps = useMemo(() => ({
    config,
    data,
    isEditMode: isEditMode && !isPreview, // Preview mode should not allow editing
    isSelected,
    onSelect,
    onTimeRangeUpdate,
  }), [config, data, isEditMode, isPreview, isSelected, onSelect, onTimeRangeUpdate]);

  if (!PanelComponent) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        <div className="text-center">
          <AlertCircle className="h-12 w-12 mx-auto mb-4" />
          <p>Unsupported panel type: {config.type}</p>
        </div>
      </div>
    );
  }

  // Wrap in error boundary to catch any panel errors
  return (
    <PanelErrorBoundary panelId={config.id} panelType={config.type}>
      <div 
        className={className} 
        style={{ 
          height: height || '100%', 
          width: width || '100%',
          minHeight: isPreview ? '400px' : '200px',
        }}
      >
        <PanelComponent {...panelProps} />
      </div>
    </PanelErrorBoundary>
  );
}