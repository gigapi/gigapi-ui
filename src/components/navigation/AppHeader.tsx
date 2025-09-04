import React from "react";
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
import {
  Database,
  Search,
  RefreshCw,
} from "lucide-react";
import { useAtom, useSetAtom, useAtomValue } from "jotai";
import {
  selectedDbAtom,
  setSelectedDbAtom,
  refreshSchemaCacheAtom,
  isCacheLoadingAtom,
  cacheProgressAtom,
  openCommandPaletteAtom,
} from "@/atoms";
import { UnifiedSchemaSelector } from "@/components/shared/UnifiedSchemaSelector";

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
  const [selectedDb] = useAtom(selectedDbAtom);
  const setSelectedDb = useSetAtom(setSelectedDbAtom);
  const refreshSchemaCache = useSetAtom(refreshSchemaCacheAtom);
  const isCacheLoading = useAtomValue(isCacheLoadingAtom);
  const cacheProgress = useAtomValue(cacheProgressAtom);
  const openCommandPalette = useSetAtom(openCommandPaletteAtom);

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
              <UnifiedSchemaSelector
                type="database"
                dataSource="atoms"
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
                      <h4 className="font-medium">Database</h4>
                      <UnifiedSchemaSelector
                        type="database"
                        dataSource="atoms"
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
