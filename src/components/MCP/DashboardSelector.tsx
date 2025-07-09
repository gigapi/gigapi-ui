import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import {
  LayoutDashboard,
  Plus,
  Clock,
  Info,
  AlertCircle,
} from "lucide-react";
import { toast } from "sonner";
import { useDashboard } from "@/atoms";
import { checkForTimeVariables } from "@/lib";
import type { TimeRange } from "@/types";

interface DashboardSelectorProps {
  isOpen: boolean;
  onClose: () => void;
  chartArtifact: any;
  onConfirm: (dashboardId: string, timeConfig?: TimeConfiguration) => void;
}

export interface TimeConfiguration {
  mode: "dashboard" | "fixed" | "relative";
  timeRange?: TimeRange;
  timeField?: string;
}

export default function DashboardSelector({
  isOpen,
  onClose,
  chartArtifact,
  onConfirm,
}: DashboardSelectorProps) {
  const { dashboardList } = useDashboard();
  const [selectedDashboardId, setSelectedDashboardId] = useState<string>("");
  const [isLoading] = useState(false);
  const [hasTimeVariables, setHasTimeVariables] = useState(false);
  const [timeMode, setTimeMode] = useState<"dashboard" | "fixed" | "relative">("dashboard");
  const [relativeTime, setRelativeTime] = useState("1h");
  const [timeField, setTimeField] = useState("");

  // Load dashboards when dialog opens
  useEffect(() => {
    if (isOpen) {
      checkTimeVariables();
    }
  }, [isOpen]);

  // Pre-select first dashboard if available
  useEffect(() => {
    if (isOpen && dashboardList.length > 0 && !selectedDashboardId) {
      setSelectedDashboardId(dashboardList[0].id);
    }
  }, [isOpen]); // Only depend on isOpen to avoid loops

  const checkTimeVariables = () => {
    const query = chartArtifact.query || "";
    const hasVars = checkForTimeVariables(query);
    setHasTimeVariables(hasVars);
    
    // Try to extract time field from field mapping or query
    if (chartArtifact.fieldMapping?.timeField) {
      setTimeField(chartArtifact.fieldMapping.timeField);
    } else if (query.includes("$__timeField")) {
      // Try to extract from query context
      const match = query.match(/(\w+)\s+as\s+time/i) || 
                    query.match(/(\w+_time\w*)/i) ||
                    query.match(/(\w*time\w*)/i);
      if (match) {
        setTimeField(match[1]);
      }
    }
  };

  const handleConfirm = () => {
    if (!selectedDashboardId) {
      toast.error("Please select a dashboard");
      return;
    }

    let timeConfig: TimeConfiguration | undefined;
    
    if (hasTimeVariables) {
      timeConfig = {
        mode: timeMode,
      };

      if (timeMode === "relative") {
        timeConfig.timeRange = {
          from: "now",
          to: "5m",
          enabled: true,
        };
      }

      if (timeField) {
        timeConfig.timeField = timeField;
      }
    }

    onConfirm(selectedDashboardId, timeConfig);
    onClose();
  };

  const relativeTimeOptions = [
    { value: "5m", label: "Last 5 minutes" },
    { value: "15m", label: "Last 15 minutes" },
    { value: "30m", label: "Last 30 minutes" },
    { value: "1h", label: "Last 1 hour" },
    { value: "3h", label: "Last 3 hours" },
    { value: "6h", label: "Last 6 hours" },
    { value: "12h", label: "Last 12 hours" },
    { value: "24h", label: "Last 24 hours" },
    { value: "2d", label: "Last 2 days" },
    { value: "7d", label: "Last 7 days" },
    { value: "30d", label: "Last 30 days" },
  ];

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <LayoutDashboard className="w-5 h-5" />
            Add Chart to Dashboard
          </DialogTitle>
          <DialogDescription>
            Select a dashboard to add "{chartArtifact.title}" to.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Dashboard Selection */}
          <div className="space-y-2">
            <Label htmlFor="dashboard">Dashboard</Label>
            {isLoading ? (
              <div className="h-10 bg-muted animate-pulse rounded" />
            ) : dashboardList.length === 0 ? (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  No dashboards found. Create a dashboard first.
                </AlertDescription>
              </Alert>
            ) : (
              <Select
                value={selectedDashboardId}
                onValueChange={setSelectedDashboardId}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a dashboard" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectLabel>Available Dashboards</SelectLabel>
                    {dashboardList.map((dashboard) => (
                      <SelectItem key={dashboard.id} value={dashboard.id}>
                        <div className="flex items-center justify-between w-full">
                          <span>{dashboard.name}</span>
                          {dashboard.panelCount > 0 && (
                            <Badge variant="secondary" className="ml-2 text-xs">
                              {dashboard.panelCount} panels
                            </Badge>
                          )}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Time Configuration - only show if query has time variables */}
          {hasTimeVariables && (
            <Card>
              <CardContent className="pt-6">
                <div className="space-y-4">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <Clock className="w-4 h-4" />
                    Time Configuration
                  </div>
                  
                  <Alert className="py-2">
                    <Info className="h-4 w-4" />
                    <AlertDescription className="text-xs">
                      This chart uses time variables. Choose how to handle time filtering.
                    </AlertDescription>
                  </Alert>

                  <RadioGroup value={timeMode} onValueChange={(value: any) => setTimeMode(value)}>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="dashboard" id="dashboard" />
                      <Label htmlFor="dashboard" className="font-normal cursor-pointer">
                        Use dashboard time range (recommended)
                      </Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="relative" id="relative" />
                      <Label htmlFor="relative" className="font-normal cursor-pointer">
                        Set a fixed relative time
                      </Label>
                    </div>
                  </RadioGroup>

                  {timeMode === "relative" && (
                    <div className="pl-6 space-y-2">
                      <Select value={relativeTime} onValueChange={setRelativeTime}>
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {relativeTimeOptions.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  {/* Time Field Configuration */}
                  <div className="space-y-2">
                    <Label htmlFor="timeField" className="text-sm">
                      Time Field (optional)
                    </Label>
                    <Input
                      id="timeField"
                      value={timeField}
                      onChange={(e) => setTimeField(e.target.value)}
                      placeholder="e.g., timestamp, created_at"
                      className="text-sm"
                    />
                    <p className="text-xs text-muted-foreground">
                      Specify the time column if not automatically detected
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Create New Dashboard Option */}
          {dashboardList.length > 0 && (
            <div className="pt-2 border-t">
              <Button
                variant="outline"
                className="w-full"
                onClick={() => {
                  onClose();
                  // Navigate to create dashboard page
                  window.location.href = "/dashboards";
                }}
              >
                <Plus className="w-4 h-4 mr-2" />
                Create New Dashboard
              </Button>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button 
            onClick={handleConfirm}
            disabled={!selectedDashboardId || isLoading}
          >
            Add to Dashboard
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}