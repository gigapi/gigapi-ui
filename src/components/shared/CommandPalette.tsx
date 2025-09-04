import React from "react";
import { useNavigate } from "react-router-dom";
import { useAtom } from "jotai";
import { commandPaletteOpenAtom } from "@/atoms";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Home,
  BarChart3,
  Plus,
  Sun,
  Moon,
  Bot,
  Settings,
} from "lucide-react";
import { useTheme } from "@/components/shared/theme-provider";

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

export function CommandPalette() {
  const [open, setOpen] = useAtom(commandPaletteOpenAtom);
  const navigate = useNavigate();
  const { setTheme } = useTheme();

  // Listen for Cmd+K
  React.useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((open) => !open);
      }
    };

    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, [setOpen]);

  const commands: Command[] = [
    // Navigation
    {
      id: "nav-home",
      title: "Go to Home",
      description: "Navigate to the main query interface",
      icon: Home,
      action: () => navigate("/"),
      section: "Navigation",
      keywords: ["home", "query", "main"],
    },
    {
      id: "nav-dashboards",
      title: "View Dashboards",
      description: "Browse and manage your dashboards",
      icon: BarChart3,
      action: () => navigate("/dashboards"),
      section: "Navigation",
      keywords: ["dashboard", "charts", "analytics"],
    },
    {
      id: "nav-chat",
      title: "Open Chat",
      description: "Start a new AI chat session",
      icon: Bot,
      action: () => navigate("/chat"),
      section: "Navigation",
      keywords: ["chat", "ai", "assistant"],
    },
    {
      id: "nav-connect",
      title: "Connection Settings",
      description: "Manage API connection",
      icon: Settings,
      action: () => navigate("/connect"),
      section: "Navigation", 
      keywords: ["connection", "api", "settings"],
    },

    // Quick Actions
    {
      id: "action-new-dashboard",
      title: "Create Dashboard",
      description: "Create a new dashboard",
      icon: Plus,
      action: () => navigate("/dashboards"),
      section: "Quick Actions",
      keywords: ["create", "new", "dashboard"],
    },

    // Theme
    {
      id: "theme-light",
      title: "Light Mode",
      description: "Switch to light theme",
      icon: Sun,
      action: () => setTheme("light"),
      section: "Appearance",
      keywords: ["light", "theme", "appearance"],
    },
    {
      id: "theme-dark",
      title: "Dark Mode", 
      description: "Switch to dark theme",
      icon: Moon,
      action: () => setTheme("dark"),
      section: "Appearance",
      keywords: ["dark", "theme", "appearance"],
    },
  ];

  const groupedCommands = commands.reduce((acc, command) => {
    if (!acc[command.section]) {
      acc[command.section] = [];
    }
    acc[command.section].push(command);
    return acc;
  }, {} as Record<string, Command[]>);

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Type a command or search..." />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        {Object.entries(groupedCommands).map(([section, commands]) => (
          <CommandGroup key={section} heading={section}>
            {commands.map((command) => (
              <CommandItem
                key={command.id}
                onSelect={() => {
                  command.action();
                  setOpen(false);
                }}
                disabled={command.disabled}
              >
                <command.icon className="mr-2 h-4 w-4" />
                <div className="flex flex-col">
                  <span>{command.title}</span>
                  {command.description && (
                    <span className="text-sm text-muted-foreground">
                      {command.description}
                    </span>
                  )}
                </div>
              </CommandItem>
            ))}
          </CommandGroup>
        ))}
      </CommandList>
    </CommandDialog>
  );
}