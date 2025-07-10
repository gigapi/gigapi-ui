import { type ReactNode } from "react";
import { type PanelConfig, type Dashboard } from "@/types/dashboard.types";
import {
  MoreVertical,
  Edit3,
  Copy,
  Trash2,
  Move,
  RefreshCw,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils/class-utils";
import { useDashboard } from "@/atoms";
import { toast } from "sonner";

interface PanelContainerProps {
  panelId: string;
  config: PanelConfig;
  dashboard?: Dashboard;
  isEditMode: boolean;
  isSelected: boolean;
  onEdit?: () => void;
  onSelect?: () => void;
  children: ReactNode;
  className?: string;
}

export function PanelContainer({
  panelId,
  config,
  isEditMode,
  isSelected,
  onEdit,
  onSelect,
  children,
  className,
}: PanelContainerProps) {
  const { deletePanel, duplicatePanel, refreshPanelData } = useDashboard();

  const handleDelete = async () => {
    if (confirm("Are you sure you want to delete this panel?")) {
      await deletePanel(panelId);
      toast.success("Panel deleted");
    }
  };

  const handleDuplicate = async () => {
    await duplicatePanel(panelId);
    toast.success("Panel duplicated");
  };

  const handleRefresh = async () => {
    await refreshPanelData(panelId);
    toast.success("Panel refreshed");
  };

  const handlePanelClick = (e: React.MouseEvent) => {
    if (isEditMode && !isSelected && onSelect) {
      e.stopPropagation();
      onSelect();
    }
  };

  return (
    <div
      className={cn(
        "h-full w-full bg-card border rounded-lg shadow-sm overflow-hidden relative group",
        isEditMode && "cursor-pointer",
        isEditMode && isSelected && "ring-2 ring-primary",
        className
      )}
      onClick={handlePanelClick}
    >
      {/* Panel Header - Always visible */}
      <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between px-3 py-2 bg-card/95 backdrop-blur-sm border-b">
        {/* Drag Handle - only visible in edit mode */}
        {isEditMode && (
          <div className="panel-drag-handle cursor-move flex items-center gap-2">
            <Move className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm font-medium">
              {config.title || "Panel"}
            </span>
          </div>
        )}

        {!isEditMode && (
          <span className="text-sm font-medium">{config.title || "Panel"}</span>
        )}

        {/* Panel Actions */}
        <div className="flex items-center gap-1">
          {!isEditMode && (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={(e) => {
                e.stopPropagation();
                handleRefresh();
              }}
            >
              <RefreshCw className="w-3 h-3" />
            </Button>
          )}

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
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit?.();
                }}
              >
                <Edit3 className="w-4 h-4 mr-2" />
                Edit Panel
              </DropdownMenuItem>

              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  handleDuplicate();
                }}
              >
                <Copy className="w-4 h-4 mr-2" />
                Duplicate
              </DropdownMenuItem>

              <DropdownMenuSeparator />

              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  handleDelete();
                }}
                className="text-destructive"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Panel Content - always add padding to account for header */}
      <div className="h-full w-full pt-10">{children}</div>
    </div>
  );
}
