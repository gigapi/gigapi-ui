import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbLink,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Globe,
  Edit,
  Save,
  X,
  Database,
  Search,
  RefreshCw,
} from "lucide-react";
import { useAtom, useSetAtom, useAtomValue } from "jotai";
import { apiUrlAtom, connectAtom } from "@/atoms";
import {
  selectedDbAtom,
  setSelectedDbAtom,
  refreshSchemaCacheAtom,
  isCacheLoadingAtom,
  cacheProgressAtom,
  openCommandPaletteAtom,
} from "@/atoms";
import { UnifiedSelector } from "@/components/shared/DbTableTimeSelector";
import { toast } from "sonner";

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface AppHeaderProps {
  breadcrumbs: BreadcrumbItem[];
  actions?: React.ReactNode;
  showDatabaseControls?: boolean;
}

export default function AppHeader({
  breadcrumbs,
  actions,
  showDatabaseControls = true,
}: AppHeaderProps) {
  const [apiUrl] = useAtom(apiUrlAtom);
  const [selectedDb] = useAtom(selectedDbAtom);
  const setApiUrl = useSetAtom(apiUrlAtom);
  const connect = useSetAtom(connectAtom);
  const setSelectedDb = useSetAtom(setSelectedDbAtom);
  const refreshSchemaCache = useSetAtom(refreshSchemaCacheAtom);
  const isCacheLoading = useAtomValue(isCacheLoadingAtom);
  const cacheProgress = useAtomValue(cacheProgressAtom);
  const openCommandPalette = useSetAtom(openCommandPaletteAtom);
  const [isEndpointEditing, setIsEndpointEditing] = useState(false);
  const [tempApiUrl, setTempApiUrl] = useState(apiUrl);

  // Update temp URL when apiUrl changes
  useEffect(() => {
    setTempApiUrl(apiUrl);
  }, [apiUrl]);

  // Handle saving the endpoint
  const handleSaveEndpoint = async () => {
    const newUrl = tempApiUrl.trim();

    if (newUrl === apiUrl) {
      setIsEndpointEditing(false);
      return;
    }

    if (!newUrl) {
      toast.error("API endpoint cannot be empty");
      return;
    }

    // Update the URL and trigger connection
    setApiUrl(newUrl);
    setIsEndpointEditing(false);

    try {
      await connect(newUrl);
    } catch (error) {
      // Error is handled by the connection atom
    }
  };

  // Handle API URL input key press
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSaveEndpoint();
    } else if (e.key === "Escape") {
      setTempApiUrl(apiUrl);
      setIsEndpointEditing(false);
    }
  };

  return (
    <header className="flex h-16 shrink-0 items-center gap-2 px-4 border-b bg-background">
      <SidebarTrigger className="-ml-1" />
      <Separator
        orientation="vertical"
        className="mr-2 data-[orientation=vertical]:h-4"
      />

      {/* Breadcrumb Navigation */}
      <Breadcrumb>
        <BreadcrumbList>
          {breadcrumbs.map((crumb, index) => (
            <React.Fragment key={crumb.label}>
              <BreadcrumbItem>
                {crumb.href ? (
                  <BreadcrumbLink className="max-w-200 truncate " asChild>
                    <Link to={crumb.href}>{crumb.label}</Link>
                  </BreadcrumbLink>
                ) : (
                  <BreadcrumbPage>{crumb.label}</BreadcrumbPage>
                )}
              </BreadcrumbItem>
              {index < breadcrumbs.length - 1 && <BreadcrumbSeparator />}
            </React.Fragment>
          ))}
        </BreadcrumbList>
      </Breadcrumb>

      {/* Right side controls */}
      <div className="ml-auto flex items-center gap-3">
        {/* Search Command Palette */}
        <Button
          variant="outline"
          size="sm"
          onClick={() => openCommandPalette()}
          className="hidden sm:flex items-center gap-2 text-muted-foreground"
        >
          <Search className="h-4 w-4" />
          <span className="hidden md:inline">Spotlight...</span>
          <div className="hidden md:flex text-xs bg-muted px-1.5 py-0.5 rounded border">
            ⌘K
          </div>
        </Button>

        {/* Mobile Search Button */}
        <Button
          variant="outline"
          size="sm"
          onClick={() => openCommandPalette()}
          className="sm:hidden"
        >
          <Search className="h-4 w-4" />
        </Button>

        {/* Page-specific actions */}
        {actions}

        {/* Database Controls */}
        {showDatabaseControls && (
          <>
            {/* Desktop Database Controls */}
            <div className="hidden md:flex items-center gap-3">
              <UnifiedSelector
                type="database"
                context="query"
                style="select"
                value={selectedDb || ""}
                onChange={setSelectedDb}
                className="w-auto"
                showIcon={false}
                label={null}
              />

              {/* Refresh Schema Cache Button */}
              <Button
                size="sm"
                variant="outline"
                onClick={() => refreshSchemaCache()}
                disabled={isCacheLoading}
                title={
                  isCacheLoading
                    ? `Loading schemas... ${cacheProgress.current}/${cacheProgress.total}`
                    : "Refresh database schema cache"
                }
              >
                <RefreshCw
                  className={`h-4 w-4 ${isCacheLoading ? "animate-spin" : ""}`}
                />
                {isCacheLoading && cacheProgress.total > 0 && (
                  <span className="ml-1.5 text-xs">
                    {cacheProgress.current}/{cacheProgress.total}
                  </span>
                )}
              </Button>

              {/* API Endpoint Control */}
              {isEndpointEditing ? (
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <Globe className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      value={tempApiUrl}
                      onChange={(e) => setTempApiUrl(e.target.value)}
                      onKeyDown={handleKeyDown}
                      className="font-mono text-sm pl-10 min-w-[350px]"
                      placeholder="https://api.example.com"
                      autoFocus
                    />
                  </div>
                  <Button
                    size="sm"
                    onClick={handleSaveEndpoint}
                    disabled={!tempApiUrl.trim()}
                  >
                    <Save className="h-4 w-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setTempApiUrl(apiUrl);
                      setIsEndpointEditing(false);
                    }}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <div
                  className="group cursor-pointer border border-transparent hover:border-border rounded-lg px-3 py-1.5 bg-muted/20 hover:bg-muted/40 transition-colors"
                  onClick={() => setIsEndpointEditing(true)}
                  title="Click to edit API endpoint"
                >
                  <div className="flex items-center gap-2 text-sm">
                    <Globe className="h-4 w-4 text-muted-foreground" />
                    <span className="font-mono truncate max-w-[250px]">
                      {apiUrl}
                    </span>
                    <Edit className="h-3.5 w-3.5 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground" />
                  </div>
                </div>
              )}
            </div>

            {/* Mobile Database Controls */}
            <div className="md:hidden">
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm">
                    <Database className="h-4 w-4" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-80" align="end">
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <h4 className="font-medium">Database Connection</h4>
                      <UnifiedSelector
                        type="database"
                        context="query"
                        style="select"
                        value={selectedDb || ""}
                        onChange={setSelectedDb}
                        className="w-full"
                        showIcon={false}
                        label={null}
                      />
                    </div>
                    <Separator />
                    <div className="space-y-2">
                      <h4 className="font-medium">Schema Cache</h4>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => refreshSchemaCache()}
                        disabled={isCacheLoading}
                        className="w-full"
                      >
                        <RefreshCw
                          className={`h-4 w-4 mr-2 ${
                            isCacheLoading ? "animate-spin" : ""
                          }`}
                        />
                        {isCacheLoading
                          ? `Loading... ${cacheProgress.current}/${cacheProgress.total}`
                          : "Refresh Schema Cache"}
                      </Button>
                    </div>
                    <Separator />
                    <div className="space-y-2">
                      <h4 className="font-medium">API Endpoint</h4>
                      <div className="flex items-center gap-2">
                        <div className="relative flex-1">
                          <Globe className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                          <Input
                            value={tempApiUrl}
                            onChange={(e) => setTempApiUrl(e.target.value)}
                            onKeyDown={handleKeyDown}
                            className="font-mono text-sm pl-10"
                            placeholder="https://api.example.com"
                          />
                        </div>
                        <Button
                          size="sm"
                          onClick={handleSaveEndpoint}
                          disabled={tempApiUrl.trim() === apiUrl}
                        >
                          <Save className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </PopoverContent>
              </Popover>
            </div>
          </>
        )}
      </div>
    </header>
  );
}
