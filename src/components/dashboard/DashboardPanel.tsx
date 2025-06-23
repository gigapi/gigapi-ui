import React from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
  TrendingUp,
  BarChart3,
  Gauge,
  Table,
  LineChart,
  AreaChart,
  ChartScatter,
  Edit3, 
  HelpCircle
} from "lucide-react";
import { cn } from "@/lib/utils/class-utils";
import type { PanelConfig, NDJSONRecord, PanelType } from "@/types/dashboard.types";
import { useDashboard } from "@/contexts/DashboardContext";
import { getPanelComponent } from "./panels";

const PANEL_TYPE_ICONS: Record<PanelType, React.ComponentType<{ className?: string }>> = {
  timeseries: TrendingUp,
  stat: BarChart3,
  gauge: Gauge,
  table: Table,
  bar: BarChart3,
  line: LineChart,
  area: AreaChart,
  scatter: ChartScatter,
};

interface DashboardPanelProps {
  panelId?: string; 
  config: PanelConfig;
  data: NDJSONRecord[];
  error?: string;
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
  } = useDashboard();

  const currentPanelId = panelId || config.id; 

  const handleRefresh = async (e: React.MouseEvent) => {
    e.stopPropagation(); 
    try {
      await refreshPanelData(currentPanelId);
    } catch (error) {
      console.error('Failed to refresh panel:', error);
    }
  };

  const handleDuplicate = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await duplicatePanel(currentPanelId);
    } catch (error) {
      console.error('Failed to duplicate panel:', error);
    }
  };

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await deletePanel(currentPanelId);
    } catch (error) {
      console.error('Failed to delete panel:', error);
    }
  };
  
  const handleEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    onEditPanel(currentPanelId);
  };

  const IconComponent = PANEL_TYPE_ICONS[config.type] || HelpCircle; 
  const PanelDisplayComponent = getPanelComponent(config.type);

  // Determine timeZone - Dashboard specific, or global default
  const timeZone = currentDashboard?.timeZone || "UTC"; // Use new top-level timeZone

  return (
    <Card
      className={cn(
        "h-full flex flex-col transition-all duration-200 group", 
        isEditMode && "cursor-pointer hover:shadow-lg hover:ring-2 hover:ring-primary/50",
        error && "border-destructive",
        className,
        isSelected && "ring-2 ring-primary" // Example: apply a ring when selected
      )}
      onClick={() => {
        if (isEditMode && onSelect) {
          onSelect();
        }
        // In normal mode, clicking a panel should do nothing
        // Only the explicit "Edit Panel" button should navigate to edit
      }}
    >
      <CardHeader className="pb-2 px-3 pt-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            {isEditMode && (
              <div 
                className="panel-drag-handle cursor-grab active:cursor-grabbing p-0.5 hover:bg-muted rounded"
                onClick={(e) => e.stopPropagation()} 
              >
                <GripVertical className="w-4 h-4 text-muted-foreground" />
              </div>
            )}
            
            <IconComponent className="w-4 h-4 text-muted-foreground flex-shrink-0" />
            
            <h3 className="font-medium text-sm truncate flex-1" title={config.title}>
              {config.title}
            </h3>
            
            <Badge variant="outline" className="text-xs font-mono">
              {config.type}
            </Badge>
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
      </CardHeader>

      <CardContent className="flex-1 p-3 pt-1 overflow-hidden"> 
        {error ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center p-2">
              <AlertCircle className="w-8 h-8 text-destructive mx-auto mb-2" />
              <p className="text-sm text-destructive font-medium">Error loading data</p>
              <p className="text-xs text-muted-foreground mt-1 truncate" title={error}>{error}</p>
            </div>
          </div>
        ) : !PanelDisplayComponent ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center p-2">
              <HelpCircle className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">Panel type not supported or component missing.</p>
            </div>
          </div>
        ) : !data || data.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center p-2">
              <IconComponent className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">No data available</p>
              {isEditMode && (
                 <Button variant="link" size="sm" className="mt-1" onClick={handleEdit}>Edit panel to add query</Button>
              )}
            </div>
          </div>
        ) : (
          <PanelDisplayComponent
            config={config}
            data={data}
            timeZone={timeZone}
            isEditMode={isEditMode} // Pass isEditMode to the panel component
          />
        )}
      </CardContent>
    </Card>
  );
}

// Need to get currentDashboard to pass timeZone to PanelDisplayComponent.
// This requires either lifting state or passing currentDashboard down.
// For now, I'll add a placeholder. This should be addressed.
// A quick fix is to add timeZone to PanelConfig or fetch it within PanelDisplayComponent if possible.
// Or, more robustly, DashboardContext could provide it if it's truly global.
// For now, let's assume PanelProps expects timeZone and add it from a (mocked) source.
// This will likely need further refinement.

// Re-checking PanelProps definition from types/dashboard.types.ts
// export interface PanelProps {
//   panel: PanelConfig;
//   data: NDJSONRecord[];
//   timeZone: string;
// }
// So, timeZone is indeed required.
// We need to get currentDashboard in DashboardPanel to pass the timeZone.
// Let's modify useDashboard() call to get currentDashboard.

// Corrected approach: Add currentDashboard from useDashboard
// ...
// const {
//   currentDashboard, // Add this
//   refreshPanelData,
//   deletePanel,
//   duplicatePanel,
// } = useDashboard();
// ...
// Then use currentDashboard.timeZone
// This was already done in the previous thought process but not explicitly added to the code block.
// The code block above already includes this logic by adding `timeZone={currentDashboard?.timeZone || "UTC"}`
// The main fix is the check for `!PanelDisplayComponent`.