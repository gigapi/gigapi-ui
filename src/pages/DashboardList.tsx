import { useState, useCallback, useMemo } from "react";
import { useNavigate, Link } from "react-router-dom";
import {
  BarChart3,
  MoreHorizontal,
  Plus,
  ChevronDown,
  FileText,
  Trash2,
  Edit,
  Eye,
  Info,
  X,
} from "lucide-react";
import { toast } from "sonner";
import type {
  ColumnDef,
  ColumnFiltersState,
  SortingState,
  VisibilityState,
} from "@tanstack/react-table";
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";

import { useDashboard } from "@/atoms";
import type { DashboardListItem } from "@/types/dashboard.types";
import { getStorageImplementation } from "@/lib";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import ConfirmAction from "@/components/shared/ConfirmAction";
import Loader from "@/components/Loader";
import CreateDashboardSheet from "@/components/dashboard/CreateDashboardSheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import AppLayout from "@/components/navigation/AppLayout";

// Helper function to format date/time
const formatDateTime = (date: Date | string) => {
  const d = new Date(date);
  return d.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
};

// Helper function to parse search query with filters
const parseSearchQuery = (query: string) => {
  const filters: { [key: string]: string[] } = {};
  let generalSearch = "";
  const parts = query.match(/(?:[^\s"]+|"[^"]*")+/g) || [];

  parts.forEach((part) => {
    const filterMatch = part.match(/^(\w+):(.+)$/);
    if (filterMatch) {
      const [, key, value] = filterMatch;
      const cleanValue = value.replace(/^"(.*)"$/, "$1");
      if (!filters[key]) filters[key] = [];
      filters[key].push(cleanValue.toLowerCase());
    } else {
      generalSearch += part.replace(/^"(.*)"$/, "$1") + " ";
    }
  });

  return {
    filters,
    generalSearch: generalSearch.trim().toLowerCase(),
  };
};

const filterDashboards = (
  dashboards: DashboardListItem[],
  searchQuery: string
) => {
  if (!searchQuery.trim()) return dashboards;

  const { filters, generalSearch } = parseSearchQuery(searchQuery);

  return dashboards.filter((dashboard) => {
    // Check filter conditions
    for (const [key, values] of Object.entries(filters)) {
      switch (key) {
        case "tag":
        case "tags":
          if (!dashboard.tags || dashboard.tags.length === 0) return false;
          const hasMatchingTag = values.some((value) =>
            dashboard.tags?.some((tag) => tag.toLowerCase().includes(value))
          );
          if (!hasMatchingTag) return false;
          break;
        case "title":
        case "name":
          const hasMatchingName = values.some((value) =>
            dashboard.name.toLowerCase().includes(value)
          );
          if (!hasMatchingName) return false;
          break;
        case "description":
        case "desc":
          if (!dashboard.description) return false;
          const hasMatchingDesc = values.some((value) =>
            dashboard.description?.toLowerCase().includes(value)
          );
          if (!hasMatchingDesc) return false;
          break;
        default:
          // Unknown filter, ignore
          break;
      }
    }

    // Check general search (searches in name, description, and tags)
    if (generalSearch) {
      const searchLower = generalSearch;
      const matchesName = dashboard.name.toLowerCase().includes(searchLower);
      const matchesDesc = dashboard.description
        ?.toLowerCase()
        .includes(searchLower);
      const matchesTags = dashboard.tags?.some((tag) =>
        tag.toLowerCase().includes(searchLower)
      );

      if (!matchesName && !matchesDesc && !matchesTags) {
        return false;
      }
    }

    return true;
  });
};

export default function DashboardList() {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchFilters, setSearchFilters] = useState<
    Array<{ key: string; value: string }>
  >([]);
  const [confirmDelete, setConfirmDelete] = useState<{
    isOpen: boolean;
    dashboard: DashboardListItem | null;
  }>({ isOpen: false, dashboard: null });
  const [isCreateSheetOpen, setIsCreateSheetOpen] = useState(false);

  const { dashboardList, loading, deleteDashboard } = useDashboard();
  const navigate = useNavigate();

  // Use dashboard list from atoms
  const dashboards = dashboardList || [];

  // Table state
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});

  // Filter dashboards based on search query
  const filteredDashboards = useMemo(
    () => filterDashboards(dashboards, searchQuery),
    [dashboards, searchQuery]
  );

  // Handle search input changes and extract filters
  const handleSearchChange = (value: string) => {
    setSearchQuery(value);

    // Extract filters from search query
    const { filters } = parseSearchQuery(value);
    const filterArray = Object.entries(filters).flatMap(([key, values]) =>
      values.map((value) => ({ key, value }))
    );
    setSearchFilters(filterArray);
  };

  // Remove a specific filter
  const removeFilter = (filterToRemove: { key: string; value: string }) => {
    const newQuery = searchQuery
      .replace(
        new RegExp(`\\b${filterToRemove.key}:${filterToRemove.value}\\b`, "gi"),
        ""
      )
      .replace(/\s+/g, " ")
      .trim();
    setSearchQuery(newQuery);
  };

  // Dashboards are automatically loaded from atoms

  const handleDashboardCreated = useCallback(
    (dashboardId: string) => {
      // No need to refresh - atoms automatically update
      navigate(`/dashboard/${dashboardId}`);
    },
    [navigate]
  );

  const handleDeleteDashboard = useCallback(
    async (dashboard: DashboardListItem) => {
      try {
        await deleteDashboard(dashboard.id);
        setConfirmDelete({ isOpen: false, dashboard: null }); // Close confirmation
        toast.success(`Dashboard "${dashboard.name}" deleted successfully`);
      } catch (error) {
        toast.error("Failed to delete dashboard");
        console.error("Error deleting dashboard:", error);
      }
    },
    [deleteDashboard]
  );

  const handleExportDashboard = useCallback(
    async (dashboardId: string, dashboardName: string) => {
      try {
        const storage = getStorageImplementation();
        const exportData = await storage.exportDashboard(dashboardId);
        const blob = new Blob([exportData], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `${dashboardName
          .replace(/[^a-z0-9]/gi, "_")
          .toLowerCase()}_dashboard.json`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        toast.success("Dashboard exported successfully");
      } catch (error) {
        toast.error("Failed to export dashboard");
        console.error("Error exporting dashboard:", error);
      }
    },
    []
  );

  const columns: ColumnDef<DashboardListItem>[] = [
    {
      accessorKey: "name",
      header: "Name",
      cell: ({ row }) => (
        <Link
          to={`/dashboard/${row.original.id}`}
          className="font-medium hover:underline"
        >
          {row.getValue("name")}
        </Link>
      ),
    },
    {
      accessorKey: "description",
      header: "Description",
      cell: ({ row }) => (
        <div className="truncate max-w-xs">
          {row.getValue("description") || "-"}
        </div>
      ),
    },
    {
      accessorKey: "panelCount",
      header: "Panels",
      cell: ({ row }) => (
        <div className="text-center">{row.getValue("panelCount")}</div>
      ),
    },
    {
      accessorKey: "tags",
      header: "Tags",
      cell: ({ row }) => {
        const tags = row.getValue("tags") as string[] | undefined;
        if (!tags || tags.length === 0) return "-";
        return (
          <div className="flex flex-wrap gap-1">
            {tags.slice(0, 2).map((tag) => (
              <Badge key={tag} variant="secondary">
                {tag}
              </Badge>
            ))}
            {tags.length > 2 && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Badge variant="outline" className="cursor-help">
                      +{tags.length - 2}
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent>
                    <div className="space-y-1">
                      <p className="font-medium text-xs">Additional tags:</p>
                      <div className="flex flex-wrap gap-1 max-w-xs">
                        {tags.slice(2).map((tag) => (
                          <Badge
                            key={tag}
                            variant="secondary"
                            className="text-xs"
                          >
                            {tag}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>
        );
      },
    },
    {
      accessorKey: "updatedAt",
      header: "Last Updated",
      cell: ({ row }) => formatDateTime(row.getValue("updatedAt")),
    },
    {
      id: "actions",
      enableHiding: false,
      cell: ({ row }) => {
        const dashboard = row.original;
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="h-8 w-8 p-0">
                <span className="sr-only">Open menu</span>
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Actions</DropdownMenuLabel>
              <DropdownMenuItem
                onClick={() => navigate(`/dashboard/${dashboard.id}`)}
              >
                <Eye className="mr-2 h-4 w-4" /> View
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => navigate(`/dashboard/${dashboard.id}?edit=true`)}
              >
                <Edit className="mr-2 h-4 w-4" /> Edit
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() =>
                  handleExportDashboard(dashboard.id, dashboard.name)
                }
              >
                <FileText className="mr-2 h-4 w-4" /> Export
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => setConfirmDelete({ isOpen: true, dashboard })}
                className="text-red-600 focus:text-red-600"
              >
                <Trash2 className="mr-2 h-4 w-4" /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    },
  ];

  const table = useReactTable({
    data: filteredDashboards,
    columns,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    onColumnVisibilityChange: setColumnVisibility,
    state: {
      sorting,
      columnFilters,
      columnVisibility,
    },
  });

  const breadcrumbs = [{ label: "Dashboards" }];

  return (
    <AppLayout breadcrumbs={breadcrumbs} showDatabaseControls={true}>
      <div className="flex-1 overflow-y-auto p-4 md:p-6">
        <div className="container mx-auto ">
          <div className="flex items-center py-4 gap-2 justify-between">
            <div className="flex flex-col gap-3 max-w-lg flex-1 ">
              {/* Search Input with Info Tooltip */}
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Input
                    placeholder="Search dashboards..."
                    value={searchQuery}
                    onChange={(event) => handleSearchChange(event.target.value)}
                    className="pr-16"
                  />
                  {searchQuery && (
                    <div className="absolute right-8 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                      {filteredDashboards.length}
                    </div>
                  )}
                </div>

                {/* Info Tooltip */}
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Info className="h-4 w-4 text-muted-foreground cursor-pointer" />
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="max-w-80">
                      <div className="space-y-2">
                        <p className="font-medium">Advanced Search</p>
                        <div className="space-y-1 text-sm">
                          <p>
                            <code className="bg-muted px-1 rounded">
                              tag:tagname
                            </code>{" "}
                            - Filter by tags
                          </p>
                          <p>
                            <code className="bg-muted px-1 rounded">
                              title:title
                            </code>{" "}
                            - Filter by title
                          </p>
                          <p>
                            <code className="bg-muted px-1 rounded">
                              desc: `report description`
                            </code>{" "}
                            - Filter by description
                          </p>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Combine multiple filters for precise results
                        </p>
                      </div>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>

              {/* Active Filters as Badges */}
              {searchFilters.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {searchFilters.map((filter, index) => (
                    <Badge
                      key={`${filter.key}-${filter.value}-${index}`}
                      variant="secondary"
                      className="flex items-center gap-1.5 pr-1"
                    >
                      <span className="text-xs font-medium text-blue-600">
                        {filter.key}:
                      </span>
                      <span className="text-xs">{filter.value}</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-auto w-auto p-0.5 hover:bg-destructive hover:text-destructive-foreground rounded-full"
                        onClick={() => removeFilter(filter)}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </Badge>
                  ))}
                </div>
              )}
            </div>

            <div className="justify-end flex items-center gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="ml-auto">
                    Columns <ChevronDown className="ml-2 h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {table
                    .getAllColumns()
                    .filter((column) => column.getCanHide())
                    .map((column) => {
                      return (
                        <DropdownMenuCheckboxItem
                          key={column.id}
                          className="capitalize"
                          checked={column.getIsVisible()}
                          onCheckedChange={(value) =>
                            column.toggleVisibility(!!value)
                          }
                        >
                          {column.id}
                        </DropdownMenuCheckboxItem>
                      );
                    })}
                </DropdownMenuContent>
              </DropdownMenu>
              <Button
                onClick={() => setIsCreateSheetOpen(true)}
                className="flex items-center gap-2"
                size={"sm"}
              >
                <Plus className="h-4 w-4" />
                New Dashboard
              </Button>
            </div>
          </div>

          {/* Dashboard Table */}
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                {table.getHeaderGroups().map((headerGroup) => (
                  <TableRow key={headerGroup.id}>
                    {headerGroup.headers.map((header) => {
                      return (
                        <TableHead key={header.id}>
                          {header.isPlaceholder
                            ? null
                            : flexRender(
                                header.column.columnDef.header,
                                header.getContext()
                              )}
                        </TableHead>
                      );
                    })}
                  </TableRow>
                ))}
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell
                      colSpan={columns.length}
                      className="h-24 text-center"
                    >
                      <Loader />
                    </TableCell>
                  </TableRow>
                ) : table.getRowModel().rows?.length ? (
                  table.getRowModel().rows.map((row) => (
                    <TableRow key={row.id}>
                      {row.getVisibleCells().map((cell) => (
                        <TableCell key={cell.id}>
                          {flexRender(
                            cell.column.columnDef.cell,
                            cell.getContext()
                          )}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell
                      colSpan={columns.length}
                      className="h-24 text-center"
                    >
                      <div className="flex flex-col items-center justify-center py-12">
                        <BarChart3 className="w-16 h-16 mx-auto mb-4 text-muted-foreground opacity-50" />
                        <h3 className="text-xl font-semibold mb-2">
                          {searchQuery
                            ? "No dashboards match your search"
                            : "No dashboards yet"}
                        </h3>
                        <p className="text-muted-foreground mb-4">
                          {searchQuery
                            ? "Try adjusting your search term or creating a new dashboard."
                            : "Get started by creating a new dashboard."}
                        </p>
                        {!searchQuery && (
                          <Button onClick={() => setIsCreateSheetOpen(true)}>
                            <Plus className="mr-2 h-4 w-4" /> Create Dashboard
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
          <div className="flex items-center justify-end space-x-2 py-4">
            <div className="flex-1 text-sm text-muted-foreground">
              Showing {table.getRowModel().rows.length} of{" "}
              {filteredDashboards.length} dashboard(s)
              {searchQuery &&
                filteredDashboards.length !== dashboards.length &&
                ` (filtered from ${dashboards.length} total)`}
            </div>
            <div className="space-x-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => table.previousPage()}
                disabled={!table.getCanPreviousPage()}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => table.nextPage()}
                disabled={!table.getCanNextPage()}
              >
                Next
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Create Dashboard Sheet */}
      <CreateDashboardSheet
        isOpen={isCreateSheetOpen}
        onOpenChange={setIsCreateSheetOpen}
        onDashboardCreated={handleDashboardCreated}
      />

      {/* Delete Confirmation Dialog */}
      <ConfirmAction
        isOpen={confirmDelete.isOpen}
        title="Delete Dashboard"
        description={`Are you sure you want to delete "${confirmDelete.dashboard?.name}"? This action cannot be undone and will permanently remove all panels and configuration.`}
        confirmText="Delete"
        cancelText="Cancel"
        variant="destructive"
        onConfirm={() => {
          if (confirmDelete.dashboard) {
            handleDeleteDashboard(confirmDelete.dashboard);
          }
        }}
        onCancel={() => setConfirmDelete({ isOpen: false, dashboard: null })}
      />
    </AppLayout>
  );
}
