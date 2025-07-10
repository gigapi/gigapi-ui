import { useEffect, useState, useCallback } from "react";
import {
  Link,
  useParams,
  useSearchParams,
  useNavigate,
} from "react-router-dom";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import {
  currentDashboardAtom,
  dashboardLoadingAtom,
  dashboardErrorAtom,
  isEditModeAtom,
  loadDashboardAtom,
  updateDashboardAtom,
  saveDashboardAtom,
  refreshAllPanelsAtom,
  clearCurrentDashboardAtom,
} from "@/atoms/dashboard-atoms";
import DashboardGrid from "@/components/dashboard/DashboardGrid";
import { Button } from "@/components/ui/button";
import {
  PlusCircle,
  Edit,
  Save,
  RefreshCw,
  Settings,
  Download,
  Upload,
  Share,
  MoreVertical,
  Info,
} from "lucide-react";
import AppLayout from "@/components/navigation/AppLayout";
import Loader from "@/components/Loader";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { DashboardSettingsSheet } from "@/components/dashboard/DashboardSettingsSheet";
import { DashboardTimeFilter } from "@/components/dashboard/DashboardTimeFilter";
import { DashboardErrorBoundary } from "@/components/dashboard/DashboardErrorBoundary";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const REFRESH_INTERVALS = [
  { label: "Off", value: 0 },
  { label: "5s", value: 5 },
  { label: "10s", value: 10 },
  { label: "30s", value: 30 },
  { label: "1m", value: 60 },
  { label: "5m", value: 300 },
  { label: "15m", value: 900 },
  { label: "30m", value: 1800 },
  { label: "1h", value: 3600 },
];

export default function DashboardView() {
  const { dashboardId } = useParams<{ dashboardId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  
  // Atoms
  const [currentDashboard] = useAtom(currentDashboardAtom);
  const loading = useAtomValue(dashboardLoadingAtom);
  const error = useAtomValue(dashboardErrorAtom);
  const [isEditMode, setIsEditMode] = useAtom(isEditModeAtom);
  const loadDashboard = useSetAtom(loadDashboardAtom);
  const updateDashboard = useSetAtom(updateDashboardAtom);
  const saveDashboard = useSetAtom(saveDashboardAtom);
  const refreshAllPanels = useSetAtom(refreshAllPanelsAtom);
  const clearCurrentDashboard = useSetAtom(clearCurrentDashboardAtom);

  const [isSettingsSheetOpen, setIsSettingsSheetOpen] = useState(false);

  const handleDashboardDeleted = useCallback(() => {
    navigate("/");
  }, [navigate]);

  useEffect(() => {
    console.log('[DashboardView] Dashboard ID changed:', dashboardId);
    if (dashboardId) {
      console.log('[DashboardView] Loading dashboard...');
      loadDashboard(dashboardId);
    }
    return () => {
      console.log('[DashboardView] Clearing current dashboard on unmount');
      clearCurrentDashboard();
    };
  }, [dashboardId, loadDashboard, clearCurrentDashboard]);

  // Log dashboard changes for debugging
  useEffect(() => {
    console.log('[DashboardView] Current dashboard changed:', currentDashboard?.name, 'with', currentDashboard?.panels?.length || 0, 'panels');
  }, [currentDashboard?.id]); // Only log when dashboard ID changes

  useEffect(() => {
    const edit = searchParams.get("edit");
    setIsEditMode(edit === "true");
  }, [searchParams, setIsEditMode]);

  const handleOpenPanelEdit = (panelId?: string) => {
    if (!dashboardId) return;

    if (!panelId) {
      // Creating a new panel
      navigate(`/dashboard/${dashboardId}/panel/new`);
    } else {
      // Editing an existing panel
      navigate(`/dashboard/${dashboardId}/panel/${panelId}`);
    }
  };

  const handleRefreshIntervalChange = useCallback(
    async (interval: number) => {
      if (!currentDashboard) return;
      try {
        await updateDashboard({
          dashboardId: currentDashboard.id,
          updates: { refreshInterval: interval },
        });
        toast.success(
          `Auto-refresh ${
            interval > 0
              ? `set to ${
                  REFRESH_INTERVALS.find((i) => i.value === interval)?.label
                }`
              : "disabled"
          }`
        );
      } catch (err) {
        toast.error("Failed to update refresh interval");
      }
    },
    [currentDashboard, updateDashboard]
  );

  const handleRefresh = useCallback(() => {
    try {
      refreshAllPanels();
      toast.success("Dashboard refreshed");
    } catch (err) {
      toast.error("Failed to refresh dashboard");
    }
  }, [refreshAllPanels]);

  const handleSave = useCallback(async () => {
    if (!currentDashboard) return;
    try {
      await saveDashboard();
      setIsEditMode(false);
      setSearchParams({}, { replace: true });
      toast.success("Dashboard saved");
    } catch (err) {
      toast.error("Failed to save dashboard");
    }
  }, [currentDashboard, saveDashboard, setIsEditMode, setSearchParams]);

  const handleExport = useCallback(() => {
    if (!currentDashboard) return;

    try {
      // Create export data
      const exportData = {
        dashboard: currentDashboard,
        panels: currentDashboard.panels,
        exportedAt: new Date().toISOString(),
        version: "1.0",
      };

      // Create and download file
      const dataStr = JSON.stringify(exportData, null, 2);
      const dataBlob = new Blob([dataStr], { type: "application/json" });
      const url = URL.createObjectURL(dataBlob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${currentDashboard.name
        .replace(/[^a-z0-9]/gi, "_")
        .toLowerCase()}_dashboard.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast.success("Dashboard exported successfully");
    } catch (err) {
      toast.error("Failed to export dashboard");
      console.error("Export error:", err);
    }
  }, [currentDashboard]);

  const handleToggleEditMode = () => {
    const newEditMode = !isEditMode;
    setIsEditMode(newEditMode);
    if (newEditMode) {
      setSearchParams({ edit: "true" }, { replace: true });
    } else {
      setSearchParams({}, { replace: true });
    }
  };

  const handleTimeRangeChange = useCallback(
    async (timeRange: any) => {
      console.log('[DashboardView] Time range change requested:', timeRange);
      if (!currentDashboard) {
        console.log('[DashboardView] No current dashboard, skipping time range update');
        return;
      }
      try {
        console.log('[DashboardView] Updating dashboard time range');
        await updateDashboard({
          dashboardId: currentDashboard.id,
          updates: { timeRange },
        });
        console.log('[DashboardView] Time range updated, refreshing panels');
        await refreshAllPanels();
        toast.success("Time range updated");
      } catch (err) {
        console.error('[DashboardView] Failed to update time range:', err);
        toast.error("Failed to update time range");
      }
    },
    [currentDashboard, updateDashboard, refreshAllPanels]
  );

  const handleTimeZoneChange = useCallback(
    async (timeZone: string) => {
      if (!currentDashboard) return;
      try {
        await updateDashboard({
          dashboardId: currentDashboard.id,
          updates: { timeZone },
        });
        await refreshAllPanels();
        toast.success("Timezone updated");
      } catch (err) {
        toast.error("Failed to update timezone");
      }
    },
    [currentDashboard, updateDashboard, refreshAllPanels]
  );

  // Auto-refresh effect
  useEffect(() => {
    if (!currentDashboard?.refreshInterval || currentDashboard.refreshInterval <= 0) {
      return;
    }
    
    const interval = setInterval(() => {
      refreshAllPanels();
    }, currentDashboard.refreshInterval * 1000);
    
    return () => clearInterval(interval);
  }, [currentDashboard?.refreshInterval, refreshAllPanels]);

  if (loading) {
    return (
      <AppLayout
        breadcrumbs={[
          { label: "Dashboards", href: "/dashboards" },
          { label: "Loading..." },
        ]}
        showDatabaseControls={false}
      >
        <div className="flex items-center justify-center h-full">
          <Loader />
        </div>
      </AppLayout>
    );
  }

  if (error) {
    return (
      <AppLayout
        breadcrumbs={[
          { label: "Dashboards", href: "/dashboards" },
          { label: "Error" },
        ]}
        showDatabaseControls={false}
      >
        <div className="flex flex-col items-center justify-center h-full gap-4">
          <p className="text-red-500">{error}</p>
          <Button asChild>
            <Link to="/dashboards">Go back to Dashboards</Link>
          </Button>
        </div>
      </AppLayout>
    );
  }

  if (!currentDashboard) {
    return (
      <AppLayout
        breadcrumbs={[
          { label: "Dashboards", href: "/dashboards" },
          { label: "Not Found" },
        ]}
        showDatabaseControls={false}
      >
        <div className="flex flex-col items-center justify-center h-full gap-4">
          <p>Dashboard not found.</p>
          <Button asChild>
            <Link to="/dashboards">Go back to Dashboards</Link>
          </Button>
        </div>
      </AppLayout>
    );
  }

  const tags = currentDashboard.metadata?.tags || [];
  const displayedTags = tags.slice(0, 3);
  const hiddenTagsCount = tags.length > 3 ? tags.length - 3 : 0;

  const breadcrumbs = [
    { label: "Dashboards", href: "/dashboards" },
    { label: currentDashboard.name, href: `/dashboard/${dashboardId}` },
  ];

  const headerActions = (
    <div className="flex items-center gap-2">
      {currentDashboard.description && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8 p-0">
                <Info className="w-4 h-4 text-muted-foreground" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p className="max-w-xs">{currentDashboard.description}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}

      {/* Tags */}
      {displayedTags.length > 0 && (
        <div className="flex gap-1 items-center">
          {displayedTags.map((tag) => (
            <Badge key={tag} variant="secondary" className="text-xs">
              {tag}
            </Badge>
          ))}
          {hiddenTagsCount > 0 && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger>
                  <Badge variant="outline" className="text-xs hover:bg-muted">
                    +{hiddenTagsCount}
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{tags.slice(3).join(", ")}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
      )}

      {/* Dashboard Time Filter */}
      <DashboardTimeFilter
        timeRange={
          currentDashboard.timeRange || {
            type: "relative" as const,
            from: "1h",
            to: "now" as const,
          }
        }
        timeZone={currentDashboard.timeZone || "UTC"}
        onTimeRangeChange={handleTimeRangeChange}
        onTimeZoneChange={handleTimeZoneChange}
        disabled={isEditMode}
        showTimeZone={false}
      />

      {/* Refresh Controls */}
      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size="sm"
          onClick={handleRefresh}
          className="h-8"
          disabled={isEditMode} // Disable refresh in edit mode or handle appropriately
        >
          <RefreshCw className="w-4 h-4" />
        </Button>
        <Select
          value={String(currentDashboard.refreshInterval || 0)}
          onValueChange={(value) => handleRefreshIntervalChange(Number(value))}
          disabled={isEditMode}
        >
          <SelectTrigger className="w-20 h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {REFRESH_INTERVALS.map((interval) => (
              <SelectItem
                key={interval.value}
                value={String(interval.value)}
                className="text-xs"
              >
                {interval.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Edit Mode Controls & Add Panel */}
      {isEditMode ? (
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleOpenPanelEdit()}
            className="h-8"
          >
            <PlusCircle className="w-4 h-4 mr-2" />
            Add Panel
          </Button>
          <Button
            variant="default"
            size="sm"
            onClick={handleSave}
            className="h-8"
          >
            <Save className="w-4 h-4 mr-2" />
            Save
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleToggleEditMode}
            className="h-8"
          >
            Cancel
          </Button>
        </div>
      ) : (
        <Button
          variant="outline"
          size="sm"
          onClick={handleToggleEditMode}
          className="h-8"
        >
          <Edit className="w-4 h-4 mr-2" />
          Edit
        </Button>
      )}

      {/* More Options / Settings */}

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <MoreVertical className="w-4 h-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            onSelect={() => setIsSettingsSheetOpen(true)}
            disabled={isEditMode}
          >
            <Settings className="w-4 h-4 mr-2" />
            Dashboard Settings
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem disabled={isEditMode}>
            <Share className="w-4 h-4 mr-2" />
            Share Dashboard
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={handleExport} disabled={isEditMode}>
            <Download className="w-4 h-4 mr-2" />
            Export
          </DropdownMenuItem>
          <DropdownMenuItem disabled={isEditMode}>
            <Upload className="w-4 h-4 mr-2" />
            Import
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );

  return (
    <AppLayout
      breadcrumbs={breadcrumbs}
      actions={headerActions}
      showDatabaseControls={false}
    >
      <DashboardErrorBoundary
        onError={(error, errorInfo) => {
          console.error("Dashboard rendering error:", error, errorInfo);
        }}
      >
        <div className="h-full p-4 overflow-auto">
          <DashboardGrid onEditPanel={handleOpenPanelEdit} />
        </div>

        {currentDashboard && (
          <DashboardSettingsSheet
            isOpen={isSettingsSheetOpen}
            onOpenChange={setIsSettingsSheetOpen}
            dashboard={currentDashboard}
            onDashboardDeleted={handleDashboardDeleted}
          />
        )}
      </DashboardErrorBoundary>
    </AppLayout>
  );
}
