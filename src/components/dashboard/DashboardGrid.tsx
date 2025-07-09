import { useMemo, useCallback } from "react";
import { Responsive, WidthProvider, type Layout } from "react-grid-layout";
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";
import { useDashboard } from "@/atoms";
import { type PanelLayout, type GridLayoutItem } from "@/types/dashboard.types";
import DashboardPanel from "./DashboardPanel";
import { cn } from "@/lib/utils/class-utils";
import type { PanelConfig } from "@/types/dashboard.types"; // Import PanelConfig

const ResponsiveGridLayout = WidthProvider(Responsive);

interface DashboardGridProps {
  className?: string;
  onEditPanel: (panelId: string) => void; // Callback to open panel edit sheet
}

export default function DashboardGrid({ className, onEditPanel }: DashboardGridProps) {
  const {
    currentDashboard,
    panelData,
    isEditMode,
    selectedPanelId,
    updateLayout,
    setSelectedPanel,
    isPanelLoading,
  } = useDashboard();

  // Convert panel layouts to grid layout format
  const layouts = useMemo(() => {
    if (!currentDashboard || currentDashboard.layout.panels.length === 0) {
      return {
        lg: [],
        md: [],
        sm: [],
        xs: [],
        xxs: [],
      };
    }

    const gridItems: GridLayoutItem[] = currentDashboard.layout.panels.map(panelLayout => ({
      i: panelLayout.panelId,
      x: panelLayout.x,
      y: panelLayout.y,
      w: panelLayout.w,
      h: panelLayout.h,
      minW: panelLayout.minW || 2,
      minH: panelLayout.minH || 2,
      isDraggable: isEditMode,
      isResizable: isEditMode,
    }));

    return {
      lg: gridItems,
      md: gridItems,
      sm: gridItems,
      xs: gridItems,
      xxs: gridItems,
    };
  }, [currentDashboard, isEditMode]);

  // Handle layout changes
  const handleLayoutChange = useCallback((layout: Layout[]) => {
    if (!isEditMode || !currentDashboard) return;

    const newPanelLayouts: PanelLayout[] = layout.map(item => ({
      panelId: item.i,
      x: item.x,
      y: item.y,
      w: item.w,
      h: item.h,
      minW: item.minW,
      minH: item.minH,
    }));

    updateLayout(newPanelLayouts);
  }, [isEditMode, currentDashboard, updateLayout]);

  if (!currentDashboard) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <h3 className="text-lg font-semibold mb-2">No Dashboard Loaded</h3>
          <p className="text-muted-foreground">Select or create a dashboard to get started.</p>
        </div>
      </div>
    );
  }


  const gridSettings = currentDashboard.layout.gridSettings || {
    columns: 12,
    rowHeight: 60, // Increase from 30 to 60 for better panel height
    margin: [10, 10],
  };

  return (
    <div className={cn("flex-1 flex flex-col", className)}>


      {/* Grid Layout */}
      <div className="flex-1 p-4 min-h-0 overflow-auto">
        {currentDashboard.layout.panels.length === 0 ? (
          <div className="flex-1 flex items-center justify-center min-h-[400px] border-2 border-dashed border-muted-foreground/25 rounded-lg">
            <div className="text-center">
              <h3 className="text-lg font-semibold mb-2">Nothing to show...</h3>
              <p className="text-muted-foreground mb-4">
                Start by adding panels to your dashboard! <br /> Edit Mode - 'Add Panel'
              </p>
            </div>
          </div>
        ) : (
          <ResponsiveGridLayout
            className="layout"
            layouts={layouts}
            onLayoutChange={handleLayoutChange}
            breakpoints={{ lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 }}
            cols={{ lg: gridSettings.columns, md: 10, sm: 6, xs: 4, xxs: 2 }}
            rowHeight={gridSettings.rowHeight}
            margin={gridSettings.margin}
            containerPadding={[0, 0]}
            isDraggable={isEditMode}
            isResizable={isEditMode}
            resizeHandles={isEditMode ? ['se'] : []}
            draggableHandle=".panel-drag-handle"
            useCSSTransforms={true}
            compactType="vertical"
            preventCollision={false}
            autoSize={true}
            verticalCompact={true}
          >
            {currentDashboard.layout.panels.map(panelLayout => {
              // Find the panel from the embedded panels array
              const panel = currentDashboard.panels.find(p => p.id === panelLayout.panelId);
              const data = panelData.get(panelLayout.panelId);
              
              
              if (!panel) {
                console.warn(`Panel with id ${panelLayout.panelId} not found in dashboard panels`);
                return null;
              }

              return (
                <div key={panelLayout.panelId} className="panel-container w-full h-full">
                  <DashboardPanel
                    config={panel}
                    data={data?.data || []}
                    error={data?.error}
                    isLoading={isPanelLoading(panel.id)}
                    isEditMode={isEditMode}
                    isSelected={selectedPanelId === panel.id}
                    onSelect={() => setSelectedPanel(panel.id)}
                    onConfigChange={(_updates: Partial<PanelConfig>) => {
                      // Will be handled by the panel internally
                    }}
                    className="w-full h-full"
                    onEditPanel={() => onEditPanel(panel.id)} // Use prop callback
                  />
                </div>
              );
            })}
          </ResponsiveGridLayout>
        )}
      </div>
    </div>
  );
}