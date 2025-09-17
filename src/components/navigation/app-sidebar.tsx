import * as React from "react";
import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  Home,
  BarChart3,
  MessageSquare,
  ExternalLink,
  MessageSquareHeart,
  Github,
  Settings,
  CheckCircle,
  AlertCircle,
  ServerCrash,
  RefreshCw,
} from "lucide-react";

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import QueryHistory from "@/components/query/QueryHistory";
import { ModeToggle } from "@/components/shared/mode-toggle";
// Safe Mode removed
import Logo from "@/assets/logo.svg";
import { useAtom, useSetAtom } from "jotai";
import {
  connectionsAtom,
  selectedConnectionIdAtom,
  selectedConnectionAtom,
  connectAtom,
  switchConnectionAndResetAtom,
  type Connection,
} from "@/atoms/connection-atoms";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { ConnectionModal } from "@/components/connections/ConnectionModal";

const VERSION = import.meta.env.PACKAGE_VERSION;

// Navigation data
const data = {
  navMain: [
    {
      title: "Query Interface",
      url: "/",
      icon: Home,
      isActive: true,
    },
    {
      title: "Assistant",
      url: "/chat",
      icon: MessageSquare,
    },
    {
      title: "Dashboards",
      url: "/dashboards",
      icon: BarChart3,
    },
  ],

  tools: [
    {
      title: "Query Tools",
      items: [
        {
          title: "Query History",
          component: "QueryHistory",
        },
      ],
    },
  ],

  links: [
    {
      title: "About Gigapipe",
      url: "https://gigapipe.com?utm_source=gigapi-ui&utm_medium=sidebar",
      icon: ExternalLink,
    },
    {
      title: "Feedback & Issues",
      url: "https://github.com/gigapi/gigapi-ui/issues",
      icon: MessageSquareHeart,
    },
    {
      title: "GitHub Repository",
      url: "https://github.com/gigapi/gigapi",
      icon: Github,
    },
  ],
};

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const location = useLocation();
  const navigate = useNavigate();
  const [connections] = useAtom(connectionsAtom);
  const [selectedConnectionId] = useAtom(selectedConnectionIdAtom);
  const [selectedConnection] = useAtom(selectedConnectionAtom);
  const connect = useSetAtom(connectAtom);
  const switchConnectionAndReset = useSetAtom(switchConnectionAndResetAtom);
  const [showConnectionModal, setShowConnectionModal] = useState(false);
  // Safe Mode removed

  const handleConnectionChange = (connectionId: string) => {
    switchConnectionAndReset(connectionId);
  };

  const getConnectionStatusIcon = (state: Connection["state"]) => {
    switch (state) {
      case "connected":
      case "empty":
        return <CheckCircle className="h-3.5 w-3.5 text-green-500" />;
      case "connecting":
      case "reconnecting":
        return <RefreshCw className="h-3.5 w-3.5 animate-spin text-blue-500" />;
      case "failed":
        return <ServerCrash className="h-3.5 w-3.5 text-red-500" />;
      default:
        return <AlertCircle className="h-3.5 w-3.5 text-gray-400" />;
    }
  };

  return (
    <Sidebar {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <div className="flex items-center gap-2 p-2">
              <img src={Logo} alt="GigAPI Logo" className="h-8 w-8" />
              <div className="flex flex-col gap-0.5 leading-none">
                <span className="font-medium">GigAPI UI</span>
                <span className="text-xs text-muted-foreground">
                  v{VERSION}
                </span>
              </div>
            </div>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        {/* Connection Selector */}
        <SidebarGroup>
          <SidebarGroupLabel>Connection</SidebarGroupLabel>
          <SidebarGroupContent>
            <div className="px-2 space-y-2">
              <Select value={selectedConnectionId} onValueChange={handleConnectionChange}>
                <SelectTrigger className="w-full" size="sm">
                  <SelectValue placeholder="Select connection" />
                </SelectTrigger>
                <SelectContent>
                  {connections.map((connection) => (
                    <SelectItem key={connection.id} value={connection.id}>
                      <div className="flex items-center gap-2 w-full">
                        {getConnectionStatusIcon(connection.state)}
                        <span className="truncate">{connection.name}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={() => setShowConnectionModal(true)}
              >
                <Settings className="h-4 w-4 mr-2" />
                Manage Connections
              </Button>
            </div>
          </SidebarGroupContent>
        </SidebarGroup>

        <Separator />

        {/* Navigation */}
        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {data.navMain.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    asChild
                    isActive={
                      location.pathname === item.url ||
                      (item.url === "/dashboards" &&
                        location.pathname.startsWith("/dashboard"))
                    }
                    onClick={() => navigate(item.url)}
                  >
                    <div className="flex items-center gap-2 cursor-pointer">
                      <item.icon className="h-4 w-4" />
                      <span>{item.title}</span>
                    </div>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <Separator />

        {/* Query Tools */}
        <SidebarGroup>
          <SidebarGroupLabel>Query Tools</SidebarGroupLabel>
          <SidebarGroupContent className="space-y-2">
            <div className="px-2 flex flex-col gap-2">
              <QueryHistory />
            </div>
          </SidebarGroupContent>
        </SidebarGroup>

        <Separator />

        {/* Settings */}
        <SidebarGroup>
          <SidebarGroupLabel>Settings</SidebarGroupLabel>
          <SidebarGroupContent>
            <div className="px-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Theme</span>
                <ModeToggle />
              </div>
              {/* Safe Mode removed */}
            </div>
          </SidebarGroupContent>
        </SidebarGroup>

        <Separator />

        {/* Links */}
        <SidebarGroup>
          <SidebarGroupLabel>Links</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {data.links.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <Link
                      to={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2"
                    >
                      <item.icon className="h-4 w-4" />
                      <span className="text-sm">{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      
      {/* Connection Modal */}
      <ConnectionModal
        open={showConnectionModal}
        onOpenChange={setShowConnectionModal}
      />
    </Sidebar>
  );
}
