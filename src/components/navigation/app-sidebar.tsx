import * as React from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  Home,
  BarChart3,
  ExternalLink,
  MessageSquareHeart,
  Github,
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
import QueryHistory from "@/components/QueryHistory";
import { ModeToggle } from "@/components/mode-toggle";
import Logo from "@/assets/logo.svg";

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
      title: "Dashboards",
      url: "/dashboards",
      icon: BarChart3,
    },
  ],

  tools: [
    {
      title: "Database Connection",
      items: [
        {
          title: "Select Database",
          component: "DatabaseSelector",
        },
        {
          title: "API Endpoint",
          component: "APIEndpoint",
        },
      ],
    },
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
    </Sidebar>
  );
}
