import React from "react";

import { Button } from "@/components/ui/button";
import Loader from "@/components/Loader";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  MoreVertical,
  GripVertical,
  RefreshCw,
  Copy,
  Trash2,
  AlertCircle,
  Edit3,
  HelpCircle,
} from "lucide-react";
import { cn } from "@/lib/utils/class-utils";
import type { PanelConfig, NDJSONRecord } from "@/types/dashboard.types";
import { getPanelComponent } from "./panels";
import { useDashboard } from "@/atoms";

interface DashboardPanelProps {
  panelId?: string;
  config: PanelConfig;
  data: NDJSONRecord[];
  error?: string;
  isLoading?: boolean;
  isEditMode: boolean;
  isSelected?: boolean;
  onSelect?: () => void;
  onConfigChange?: (updates: Partial<PanelConfig>) => void;
  onEditPanel: (panelId: string) => void;
  className?: string;
}

export default function DashboardPanel({
  panelId,
  config,
  data,
  error,
  isLoading = false,
  isEditMode,
  isSelected,
  onSelect,
  onEditPanel,
  className,
}: DashboardPanelProps) {
  const {
    currentDashboard,
    refreshPanelData,
    deletePanel,
    duplicatePanel,
    updateDashboardTimeRange,
  } = useDashboard();

  const currentPanelId = panelId || config.id;

  const handleRefresh = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await refreshPanelData(currentPanelId);
    } catch (error) {
      console.error("Failed to refresh panel:", error);
    }
  };

  const handleDuplicate = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await duplicatePanel(currentPanelId);
    } catch (error) {
      console.error("Failed to duplicate panel:", error);
    }
  };

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await deletePanel(currentPanelId);
    } catch (error) {
      console.error("Failed to delete panel:", error);
    }
  };

  const handleEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    onEditPanel(currentPanelId);
  };

  const PanelDisplayComponent = getPanelComponent(config.type);

  const timeZone = currentDashboard?.timeZone || "UTC";

  return (
    <div
      className={cn(
        "h-full flex flex-col transition-all duration-200 group bg-muted/40 border border-border rounded-sm",
        isEditMode &&
          "cursor-pointer hover:shadow-lg hover:ring-2 hover:ring-primary/50",
        error && "border-destructive",
        className,
        isSelected && "ring-2 ring-primary"
      )}
      onClick={() => {
        if (isEditMode && onSelect) {
          onSelect();
        }
      }}
    >
      <div className="pb-1 px-2 pt-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            {isEditMode && (
              <div
                className="panel-drag-handle cursor-grab active:cursor-grabbing p-1 hover:bg-muted"
                onClick={(e) => e.stopPropagation()}
              >
                <GripVertical className="w-4 h-4 text-muted-foreground" />
              </div>
            )}
            <h3
              className="font-medium text-sm truncate flex-1"
              title={config.title}
            >
              {config.title}
            </h3>
          </div>

          <div className="flex items-center gap-0.5">
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={handleRefresh}
              title="Refresh panel"
            >
              <RefreshCw className="w-3 h-3" />
            </Button>

            {isEditMode && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <MoreVertical className="w-3 h-3" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuItem onClick={handleEdit}>
                    <Edit3 className="w-4 h-4 mr-2" />
                    Edit Panel
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleDuplicate}>
                    <Copy className="w-4 h-4 mr-2" />
                    Duplicate Panel
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={handleDelete}
                    className="text-destructive focus:text-destructive"
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    Delete Panel
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-hidden">
        {error ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center p-2">
              <AlertCircle className="w-8 h-8 text-destructive mx-auto mb-2" />
              <p className="text-sm text-destructive font-medium">
                Error loading data
              </p>
              <p
                className="text-xs text-muted-foreground mt-1 truncate"
                title={error}
              >
                {error}
              </p>
            </div>
          </div>
        ) : !PanelDisplayComponent ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center p-2">
              <HelpCircle className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">
                Panel type not supported or component missing.
              </p>
            </div>
          </div>
        ) : isLoading ? (
          <div className="flex items-center justify-center h-full">
            <Loader className="w-12 h-12" />
          </div>
        ) : !data || data.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center p-2">
              <p className="text-sm text-muted-foreground">No data available</p>
              {isEditMode && (
                <Button
                  variant="link"
                  size="sm"
                  className="mt-1"
                  onClick={handleEdit}
                >
                  Edit panel to add query
                </Button>
              )}
            </div>
          </div>
        ) : (
          <PanelDisplayComponent
            config={config}
            data={data}
            timeZone={timeZone}
            isEditMode={isEditMode} // Pass isEditMode to the panel component
            onTimeRangeUpdate={updateDashboardTimeRange} // Pass time range update callback
          />
        )}
      </div>
    </div>
  );
}
