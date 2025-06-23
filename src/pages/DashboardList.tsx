import { useState, useCallback, useEffect } from "react";
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

import { useDashboardStorage } from "@/lib/dashboard/storage";
import type { Dashboard, DashboardListItem } from "@/types/dashboard.types";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import ConfirmAction from "@/components/ConfirmAction";
import Loader from "@/components/Loader";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox"; // Assuming you have a Checkbox component
import AppLayout from "@/components/navigation/AppLayout";

// Helper function to format date/time
const formatDateTime = (date: Date | string) => {
  const d = new Date(date);
  return d.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
};

export default function DashboardList() {
  const [dashboards, setDashboards] = useState<DashboardListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [newDashboard, setNewDashboard] = useState({
    name: "",
    description: "",
    tags: "",
  });
  const [confirmDelete, setConfirmDelete] = useState<{
    isOpen: boolean;
    dashboard: DashboardListItem | null;
  }>({ isOpen: false, dashboard: null });

  const storage = useDashboardStorage();
  const navigate = useNavigate();

  // Table state
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [rowSelection, setRowSelection] = useState({});

  const loadDashboards = useCallback(async () => {
    try {
      setIsLoading(true);
      const dashboardList = await storage.listDashboards();
      setDashboards(dashboardList);
    } catch (error) {
      toast.error("Failed to load dashboards");
      console.error("Error loading dashboards:", error);
    } finally {
      setIsLoading(false);
    }
  }, [storage]);

  useEffect(() => {
    loadDashboards();
  }, [loadDashboards]);

  const handleCreateDashboard = useCallback(async () => {
    if (!newDashboard.name.trim()) {
      toast.error("Dashboard name is required");
      return;
    }
    try {
      const dashboardData: Omit<Dashboard, "id" | "metadata" | "layout"> & {
        layout?: Partial<Dashboard["layout"]>;
      } = {
        name: newDashboard.name.trim(),
        description: newDashboard.description.trim() || undefined,
        timeRange: { type: "relative", from: "1h", to: "now" },
        timeZone: "UTC",
        refreshInterval: 30,
      };

      const newFullDashboard: Dashboard = {
        id: crypto.randomUUID(),
        ...dashboardData,
        layout: {
          panels: [],
          gridSettings: {
            columns: 12,
            rowHeight: 30,
            margin: [10, 10],
          },
          ...(dashboardData.layout || {}),
        },
        metadata: {
          createdAt: new Date(),
          updatedAt: new Date(),
          tags: newDashboard.tags
            ? newDashboard.tags
                .split(",")
                .map((tag) => tag.trim())
                .filter(Boolean)
            : [],
        },
      };

      await storage.saveDashboard(newFullDashboard);
      await loadDashboards();
      setIsCreateDialogOpen(false);
      setNewDashboard({ name: "", description: "", tags: "" });
      toast.success("Dashboard created successfully");
      navigate(`/dashboard/${newFullDashboard.id}`);
    } catch (error) {
      toast.error("Failed to create dashboard");
      console.error("Error creating dashboard:", error);
    }
  }, [newDashboard, storage, loadDashboards, navigate]);

  const handleDeleteDashboard = useCallback(
    async (dashboard: DashboardListItem) => {
      try {
        await storage.deleteDashboard(dashboard.id);
        await loadDashboards(); // Refresh the list
        setConfirmDelete({ isOpen: false, dashboard: null }); // Close confirmation
        toast.success(`Dashboard "${dashboard.name}" deleted successfully`);
      } catch (error) {
        toast.error("Failed to delete dashboard");
        console.error("Error deleting dashboard:", error);
      }
    },
    [storage, loadDashboards]
  );

  const handleExportDashboard = useCallback(
    async (dashboardId: string, dashboardName: string) => {
      try {
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
    [storage]
  );

  const columns: ColumnDef<DashboardListItem>[] = [
    {
      id: "select",
      header: ({ table }) => (
        <Checkbox
          checked={
            table.getIsAllPageRowsSelected() ||
            (table.getIsSomePageRowsSelected() && "indeterminate")
          }
          onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
          aria-label="Select all"
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={(value) => row.toggleSelected(!!value)}
          aria-label="Select row"
        />
      ),
      enableSorting: false,
      enableHiding: false,
    },
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
              <Badge variant="outline">+{tags.length - 2}</Badge>
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
              <DropdownMenuItem onClick={() => navigate(`/dashboard/${dashboard.id}`)}>
                <Eye className="mr-2 h-4 w-4" /> View
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => navigate(`/dashboard/${dashboard.id}?edit=true`)}
              >
                <Edit className="mr-2 h-4 w-4" /> Edit
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => handleExportDashboard(dashboard.id, dashboard.name)}
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
    data: dashboards,
    columns,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: setRowSelection,
    state: {
      sorting,
      columnFilters,
      columnVisibility,
      rowSelection,
    },
  });

  const globalFilter =
    (table.getColumn("name")?.getFilterValue() as string) ?? "";

  const setGlobalFilter = (value: string) => {
    table.getColumn("name")?.setFilterValue(value);
    // If you want to filter on multiple columns with a single input:
    // table.setGlobalFilter(value); // Requires globalFilterFn setup
  };

  const breadcrumbs = [
    { label: "Dashboards" }
  ];

  const headerActions = (
    <Button onClick={() => setIsCreateDialogOpen(true)}>
      <Plus className="mr-2 h-4 w-4" /> Create Dashboard
    </Button>
  );

  return (
    <AppLayout 
      breadcrumbs={breadcrumbs} 
      actions={headerActions}
      showDatabaseControls={true}
    >
      <div className="flex-1 overflow-y-auto p-4 md:p-6">
        <div className="container mx-auto">
          <div className="flex items-center justify-between py-4 gap-2">
            <Input
              placeholder="Filter dashboards by name..."
              value={globalFilter}
              onChange={(event) => setGlobalFilter(event.target.value)}
              className="max-w-sm"
            />
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
          </div>
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
                {isLoading ? (
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
                    <TableRow
                      key={row.id}
                      data-state={row.getIsSelected() && "selected"}
                    >
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
                          {globalFilter
                            ? "No dashboards match your search"
                            : "No dashboards yet"}
                        </h3>
                        <p className="text-muted-foreground mb-4">
                          {globalFilter
                            ? "Try adjusting your search term or creating a new dashboard."
                            : "Get started by creating a new dashboard."}
                        </p>
                        {!globalFilter && (
                           <Button onClick={() => setIsCreateDialogOpen(true)}>
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
              {table.getFilteredSelectedRowModel().rows.length} of{" "}
              {table.getFilteredRowModel().rows.length} row(s) selected.
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

      {/* Create Dashboard Dialog */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>Create New Dashboard</DialogTitle>
            <DialogDescription>
              Enter the details for your new dashboard. Click create when you're
              done.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <label htmlFor="name" className="text-right text-sm">
                Name
              </label>
              <Input
                id="name"
                value={newDashboard.name}
                onChange={(e) =>
                  setNewDashboard({ ...newDashboard, name: e.target.value })
                }
                className="col-span-3"
                placeholder="e.g., My Awesome Dashboard"
                autoFocus
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <label htmlFor="description" className="text-right text-sm">
                Description
              </label>
              <Input
                id="description"
                value={newDashboard.description}
                onChange={(e) =>
                  setNewDashboard({ ...newDashboard, description: e.target.value })
                }
                className="col-span-3"
                placeholder="(Optional)"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <label htmlFor="tags" className="text-right text-sm">
                Tags
              </label>
              <Input
                id="tags"
                value={newDashboard.tags}
                onChange={(e) =>
                  setNewDashboard({ ...newDashboard, tags: e.target.value })
                }
                className="col-span-3"
                placeholder="e.g., sales,marketing (comma-separated)"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsCreateDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              onClick={handleCreateDashboard}
              disabled={!newDashboard.name.trim()}
            >
              Create Dashboard
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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

