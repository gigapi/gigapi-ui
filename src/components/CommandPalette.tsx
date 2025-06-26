import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import {
  Home,
  BarChart3,
  Plus,
  Sun,
  Moon,
  Edit,
  RefreshCw,
  Github,
  MessageSquareHeart,
  Save,
  PanelLeft,
  HelpCircle,
} from "lucide-react";
import { useTheme } from "@/components/theme-provider";
import { useDashboardSafely } from "@/contexts/DashboardContext";
import { toast } from "sonner";
import { useSidebar } from "@/components/ui/sidebar";
import { dashboardStorage } from "@/lib/dashboard/storage";
import type { DashboardListItem } from "@/types/dashboard.types";

interface Command {
  id: string;
  title: string;
  description?: string;
  icon: React.ComponentType<{ className?: string }>;
  action: () => void;
  section: string;
  keywords?: string[];
  disabled?: boolean;
}

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const navigate = useNavigate();
  const { theme, setTheme } = useTheme();
  const { toggleSidebar } = useSidebar();

  // Context hooks
  const dashboard = useDashboardSafely();


  const [searchTerm, setSearchTerm] = useState("");
  const [recentDashboards, setRecentDashboards] = useState<DashboardListItem[]>(
    []
  );

  // Load recent dashboards when component mounts or opens
  useEffect(() => {
    if (open) {
      dashboardStorage
        .listDashboards()
        .then((dashboards) => {
          // Get the 3 most recently updated dashboards
          const recent = dashboards
            .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
            .slice(0, 3);
          setRecentDashboards(recent);
        })
        .catch(console.error);
    }
  }, [open]);

  // Navigation commands
  const navigationCommands: Command[] = useMemo(
    () => [
      {
        id: "nav-home",
        title: "Go to Query Interface",
        description: "Navigate to the main query interface",
        icon: Home,
        action: () => {
          navigate("/");
          onOpenChange(false);
        },
        section: "Navigation",
        keywords: ["home", "query", "interface", "main"],
      },
      {
        id: "nav-dashboards",
        title: "Go to Dashboards",
        description: "Navigate to dashboard list",
        icon: BarChart3,
        action: () => {
          navigate("/dashboards");
          onOpenChange(false);
        },
        section: "Navigation",
        keywords: ["dashboards", "list", "charts"],
      },
    ],
    [navigate, onOpenChange]
  );

  // Dashboard commands
  const dashboardCommands: Command[] = useMemo(() => {
    const commands: Command[] = [];

    // Add recent dashboards
    recentDashboards.forEach((dashboardItem) => {
      commands.push({
        id: `dashboard-recent-${dashboardItem.id}`,
        title: `Open: ${dashboardItem.name}`,
        description: `Open dashboard: ${dashboardItem.name}`,
        icon: BarChart3,
        action: () => {
          navigate(`/dashboard/${dashboardItem.id}`);
          onOpenChange(false);
        },
        section: "Recent Dashboards",
        keywords: ["dashboard", "open", "recent", dashboardItem.name],
      });
    });

    // Add dashboard-specific commands if we're in a dashboard context
    if (dashboard?.currentDashboard) {
      commands.push(
        {
          id: "dashboard-edit-mode",
          title: dashboard.isEditMode ? "Exit Edit Mode" : "Enter Edit Mode",
          description: dashboard.isEditMode
            ? "Exit dashboard edit mode"
            : "Enter dashboard edit mode",
          icon: Edit,
          action: () => {
            dashboard.setEditMode(!dashboard.isEditMode);
            onOpenChange(false);
          },
          section: "Dashboard Actions",
          keywords: ["edit", "mode", "dashboard"],
        },
        {
          id: "dashboard-add-panel",
          title: "Add New Panel",
          description: "Add a new panel to the current dashboard",
          icon: Plus,
          action: () => {
            const dashboardId = dashboard.currentDashboard?.id;
            if (dashboardId) {
              navigate(`/dashboard/${dashboardId}/panel/new`);
              onOpenChange(false);
            }
          },
          section: "Dashboard Actions",
          keywords: ["add", "panel", "new"],
          disabled: !dashboard.isEditMode,
        },
        {
          id: "dashboard-refresh",
          title: "Refresh All Panels",
          description: "Refresh data for all panels in the dashboard",
          icon: RefreshCw,
          action: () => {
            dashboard.refreshAllPanels();
            onOpenChange(false);
          },
          section: "Dashboard Actions",
          keywords: ["refresh", "reload", "update", "panels"],
        },
        {
          id: "dashboard-save",
          title: "Save Dashboard",
          description: "Save the current dashboard",
          icon: Save,
          action: () => {
            dashboard.saveDashboard();
            onOpenChange(false);
          },
          section: "Dashboard Actions",
          keywords: ["save", "dashboard"],
        }
      );
    }

    return commands;
  }, [recentDashboards, dashboard, navigate, onOpenChange]);

  // Remove database commands completely
  const databaseCommands: Command[] = useMemo(() => [], []);

  // Remove query commands completely
  const queryCommands: Command[] = useMemo(() => [], []);

  // Settings commands
  const settingsCommands: Command[] = useMemo(
    () => [
      {
        id: "settings-theme-toggle",
        title: "Toggle Theme",
        description: `Switch to ${theme === "dark" ? "light" : "dark"} theme`,
        icon: theme === "dark" ? Sun : Moon,
        action: () => {
          setTheme(theme === "dark" ? "light" : "dark");
          onOpenChange(false);
        },
        section: "Settings",
        keywords: ["theme", "dark", "light", "toggle"],
      },
      {
        id: "settings-sidebar-toggle",
        title: "Toggle Sidebar",
        description: "Show or hide the sidebar (Ctrl+B)",
        icon: PanelLeft,
        action: () => {
          toggleSidebar();
          onOpenChange(false);
        },
        section: "Settings",
        keywords: ["sidebar", "toggle", "panel"],
      },
    ],
    [theme, setTheme, toggleSidebar, onOpenChange]
  );

  // Remove time commands completely
  const timeCommands: Command[] = useMemo(() => [], []);

  // Help commands
  const helpCommands: Command[] = useMemo(
    () => [
      {
        id: "help-about",
        title: "About GigAPI UI",
        description: "Learn more about GigAPI UI",
        icon: HelpCircle,
        action: () => {
          window.open(
            "https://gigapipe.com?utm_source=gigapi-ui&utm_medium=command-palette",
            "_blank"
          );
          onOpenChange(false);
        },
        section: "Help",
        keywords: ["help", "about", "gigapi"],
      },
      {
        id: "help-github",
        title: "GitHub Repository",
        description: "Visit the GitHub repository",
        icon: Github,
        action: () => {
          window.open("https://github.com/gigapi/gigapi", "_blank");
          onOpenChange(false);
        },
        section: "Help",
        keywords: ["help", "github", "repository", "source"],
      },
      {
        id: "help-feedback",
        title: "Feedback & Issues",
        description: "Report issues or provide feedback",
        icon: MessageSquareHeart,
        action: () => {
          window.open("https://github.com/gigapi/gigapi-ui/issues", "_blank");
          onOpenChange(false);
        },
        section: "Help",
        keywords: ["help", "feedback", "issues", "bug"],
      },
    ],
    [onOpenChange]
  );


  // Combine all commands
  const allCommands = useMemo(() => {
    return [
      ...navigationCommands,
      ...dashboardCommands,
      ...databaseCommands,
      ...queryCommands,
      ...timeCommands,
      ...settingsCommands,
      ...helpCommands,
    ];
  }, [
    navigationCommands,
    dashboardCommands,
    databaseCommands,
    queryCommands,
    timeCommands,
    settingsCommands,
    helpCommands,
  ]);

  // Filter commands based on search
  const filteredCommands = useMemo(() => {
    if (!searchTerm) return allCommands;

    const term = searchTerm.toLowerCase();
    return allCommands.filter((command) => {
      const titleMatch = command.title.toLowerCase().includes(term);
      const descriptionMatch = command.description
        ?.toLowerCase()
        .includes(term);
      const keywordsMatch = command.keywords?.some((keyword) =>
        keyword.toLowerCase().includes(term)
      );
      const sectionMatch = command.section.toLowerCase().includes(term);

      return titleMatch || descriptionMatch || keywordsMatch || sectionMatch;
    });
  }, [allCommands, searchTerm]);

  // Group commands by section
  const commandsBySection = useMemo(() => {
    const grouped: Record<string, Command[]> = {};

    filteredCommands.forEach((command) => {
      if (!grouped[command.section]) {
        grouped[command.section] = [];
      }
      grouped[command.section].push(command);
    });

    return grouped;
  }, [filteredCommands]);

  // Handle command execution
  const executeCommand = useCallback((command: Command) => {
    if (command.disabled) return;

    try {
      command.action();
    } catch (error) {
      console.error("Error executing command:", error);
      toast.error(`Failed to execute: ${command.title}`);
    }
  }, []);

  // Reset search when dialog closes
  useEffect(() => {
    if (!open) {
      setSearchTerm("");
    }
  }, [open]);

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput
        placeholder="Type a command or search..."
        value={searchTerm}
        onValueChange={setSearchTerm}
      />
      <CommandList>
        <CommandEmpty>No commands found for "{searchTerm}".</CommandEmpty>

        {Object.entries(commandsBySection).map(([section, commands], index) => (
          <React.Fragment key={section}>
            {index > 0 && <CommandSeparator />}
            <CommandGroup heading={section}>
              {commands.map((command) => (
                <CommandItem
                  key={command.id}
                  onSelect={() => executeCommand(command)}
                  disabled={command.disabled}
                  className="flex items-center gap-2"
                >
                  <command.icon className="h-4 w-4" />
                  <div className="flex-1">
                    <div className="font-medium">{command.title}</div>
                    {command.description && (
                      <div className="text-sm text-muted-foreground">
                        {command.description}
                      </div>
                    )}
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </React.Fragment>
        ))}
      </CommandList>
    </CommandDialog>
  );
}
