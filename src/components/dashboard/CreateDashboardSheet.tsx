import { useState, useCallback } from "react";
import { X, Plus, Tag, FileText, Type } from "lucide-react";
import { toast } from "sonner";

import { useDashboard } from "@/atoms";
import type { Dashboard } from "@/types/dashboard.types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";

interface CreateDashboardSheetProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onDashboardCreated?: (dashboardId: string) => void;
}

export default function CreateDashboardSheet({
  isOpen,
  onOpenChange,
  onDashboardCreated,
}: CreateDashboardSheetProps) {
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    tags: [] as string[],
  });
  const [newTag, setNewTag] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  const { createDashboard } = useDashboard();

  const resetForm = useCallback(() => {
    setFormData({
      name: "",
      description: "",
      tags: [],
    });
    setNewTag("");
  }, []);

  const handleAddTag = useCallback(() => {
    const tag = newTag.trim();
    if (tag && !formData.tags.includes(tag)) {
      setFormData((prev) => ({
        ...prev,
        tags: [...prev.tags, tag],
      }));
      setNewTag("");
    }
  }, [newTag, formData.tags]);

  const handleRemoveTag = useCallback((tagToRemove: string) => {
    setFormData((prev) => ({
      ...prev,
      tags: prev.tags.filter((tag) => tag !== tagToRemove),
    }));
  }, []);

  const handleKeyPress = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        handleAddTag();
      }
    },
    [handleAddTag]
  );

  const handleCreateDashboard = useCallback(async () => {
    if (!formData.name.trim()) {
      toast.error("Dashboard name is required");
      return;
    }

    try {
      setIsCreating(true);

      const dashboardData: Partial<Dashboard> = {
        name: formData.name.trim(),
        description: formData.description.trim() || undefined,
        timeRange: { type: "relative", from: "5m", to: "now" },
        timeZone: "UTC",
        refreshInterval: 0,
        panels: [], // Initialize with empty panels array
        layout: {
          panels: [],
          gridSettings: {
            columns: 12,
            rowHeight: 30,
            margin: [10, 10],
          },
        },
        metadata: {
          createdAt: new Date(),
          updatedAt: new Date(),
          tags: formData.tags,
        },
      };

      const newDashboard = await createDashboard(dashboardData);

      toast.success("Dashboard created successfully");
      onOpenChange(false);
      resetForm();

      if (onDashboardCreated) {
        onDashboardCreated(newDashboard.id);
      }
    } catch (error) {
      toast.error("Failed to create dashboard");
      console.error("Error creating dashboard:", error);
    } finally {
      setIsCreating(false);
    }
  }, [formData, createDashboard, onOpenChange, resetForm, onDashboardCreated]);

  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (!open) {
        resetForm();
      }
      onOpenChange(open);
    },
    [onOpenChange, resetForm]
  );

  return (
    <Sheet open={isOpen} onOpenChange={handleOpenChange}>
      <SheetContent className="sm:max-w-[540px] overflow-y-auto">
        <SheetHeader className="">
          <SheetTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Create New Dashboard
          </SheetTitle>
          <SheetDescription>
            Create a new dashboard to organize and visualize your data. Fill in
            the details below to get started.
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-6 p-6">
          {/* Dashboard Name */}
          <div className="space-y-2 ">
            <Label htmlFor="dashboard-name" className="flex items-center gap-2">
              <Type className="h-4 w-4" />
              Dashboard Name
              <span className="text-red-500">*</span>
            </Label>
            <Input
              id="dashboard-name"
              value={formData.name}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, name: e.target.value }))
              }
              placeholder="e.g., Gigapi Awesome Dashboard"
              autoFocus
              autoComplete="off"
              className="text-base"
            />
            <p className="text-sm text-muted-foreground">
              Choose a descriptive name for your dashboard
            </p>
          </div>

          <Separator />

          {/* Description */}
          <div className="space-y-2">
            <Label
              htmlFor="dashboard-description"
              className="flex items-center gap-2"
            >
              <FileText className="h-4 w-4" />
              Description
              <span className="text-xs text-muted-foreground">(Optional)</span>
            </Label>
            <Textarea
              id="dashboard-description"
              value={formData.description}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  description: e.target.value,
                }))
              }
              placeholder="Describe what this dashboard will show and its purpose..."
              rows={3}
              className="resize-none text-base"
            />
            <p className="text-sm text-muted-foreground">
              Provide additional context about this dashboard's purpose
            </p>
          </div>

          <Separator />

          {/* Tags */}
          <div className="space-y-3">
            <Label className="flex items-center gap-2">
              <Tag className="h-4 w-4" />
              Tags
              <span className="text-xs text-muted-foreground">(Optional)</span>
            </Label>

            {/* Add new tag */}
            <div className="flex gap-2">
              <Input
                value={newTag}
                onChange={(e) => setNewTag(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Enter a tag..."
                className="flex-1 text-base"
                autoComplete="off"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleAddTag}
                disabled={
                  !newTag.trim() || formData.tags.includes(newTag.trim())
                }
                className="px-3"
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>

            {/* Display tags */}
            {formData.tags.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium">Added tags:</p>
                <div className="flex flex-wrap gap-2">
                  {formData.tags.map((tag) => (
                    <Badge
                      key={tag}
                      variant="secondary"
                      className="pl-2 pr-1 py-1 gap-1"
                    >
                      {tag}
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRemoveTag(tag)}
                        className="h-4 w-4 p-0 hover:bg-destructive hover:text-destructive-foreground"
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            <p className="text-sm text-muted-foreground">
              Add tags to help organize and filter your dashboards
            </p>
          </div>
        </div>

        <SheetFooter className="gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={isCreating}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            onClick={handleCreateDashboard}
            disabled={!formData.name.trim() || isCreating}
            className="min-w-[120px]"
          >
            {isCreating ? "Creating..." : "Create Dashboard"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
