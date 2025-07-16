import React, { useState, useMemo, useEffect, useRef } from "react";
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  useReactTable,
  type ColumnDef,
  type FilterFn,
  type ColumnFiltersState,
  type ColumnResizeMode,
  type PaginationState,
  type ColumnSizingState,
} from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import { formatBytes, formatDuration } from "@/lib/";
import { Download, Search, X, Clock, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent } from "@/components/ui/card";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

// Define a generic type for the data row
type DataRow = Record<string, any>;

// Type for the component props
interface GigTableProps {
  data: DataRow[];
  executionTime?: number | null;
  responseSize?: number | null;
  initialPageSize?: number;
  columnRenderers?: Record<string, (value: any) => React.ReactNode>;
  tableHeight?: string | number;
}

const globalFilterFn: FilterFn<DataRow> = (row, columnId, value) => {
  const cellValue = row.getValue(columnId);
  if (cellValue === null || cellValue === undefined) return false;
  const searchStr = String(cellValue).toLowerCase();
  const filterValue = String(value).toLowerCase();
  return searchStr.includes(filterValue);
};

const DEFAULT_COLUMN_WIDTH = 150;
const MIN_COLUMN_WIDTH = 50;
const MAX_COLUMN_WIDTH = 1000; // Generous max for "free" resizing

const GigTable: React.FC<GigTableProps> = ({
  data,
  executionTime,
  responseSize,
  initialPageSize = 25,
  columnRenderers,
  tableHeight = "100%",
}) => {
  const tableContainerRef = useRef<HTMLDivElement>(null);
  const horizontalScrollRef = useRef<HTMLDivElement>(null);

  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [globalFilter, setGlobalFilter] = useState("");
  const [globalFilterInput, setGlobalFilterInput] = useState("");

  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: initialPageSize,
  });
  const [enabledColumns, setEnabledColumns] = useState<Record<string, boolean>>(
    {}
  );
  const [showColumnSelector, setShowColumnSelector] = useState(false);
  const [columnSizing, setColumnSizing] = useState<ColumnSizingState>({});
  const [userResizedColumns, setUserResizedColumns] = useState<
    Record<string, number>
  >({});
  const [columnSelectorFilter, setColumnSelectorFilter] = useState("");
  // const [sorting, setSorting] = useState<SortingState>([]); // REMOVED

  const columnResizeMode = "onChange" as ColumnResizeMode;

  useEffect(() => {
    const handler = setTimeout(() => setGlobalFilter(globalFilterInput), 300);
    return () => clearTimeout(handler);
  }, [globalFilterInput]);

  useEffect(() => {
    if (globalFilter !== globalFilterInput) setGlobalFilterInput(globalFilter);
  }, [globalFilter]);

  // Initialize/Update enabled columns when data changes
  useEffect(() => {
    if (data && data.length > 0 && data[0]) {
      const allKeys = Object.keys(data[0]);
      const initialEnabledCols = allKeys.reduce((acc, key) => {
        acc[key] =
          enabledColumns[key] === undefined ? true : enabledColumns[key];
        return acc;
      }, {} as Record<string, boolean>);
      setEnabledColumns(initialEnabledCols);

      const validUserResized: Record<string, number> = {};
      allKeys.forEach((key) => {
        if (userResizedColumns[key] !== undefined) {
          validUserResized[key] = userResizedColumns[key];
        }
      });
      setUserResizedColumns(validUserResized);
    } else {
      setEnabledColumns({});
      setUserResizedColumns({});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]); // Keep enabledColumns and userResizedColumns out to preserve user settings

  // Effect to initialize columnSizing or update it when userResizedColumns change
  useEffect(() => {
    if (data && data.length > 0 && data[0]) {
      const newSizingState: ColumnSizingState = {};
      Object.keys(data[0]).forEach((key) => {
        newSizingState[key] =
          userResizedColumns[key] !== undefined
            ? userResizedColumns[key]
            : DEFAULT_COLUMN_WIDTH; // Use default width
      });
      if (JSON.stringify(columnSizing) !== JSON.stringify(newSizingState)) {
        setColumnSizing(newSizingState);
      }
    } else if (Object.keys(columnSizing).length > 0) {
      setColumnSizing({});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, userResizedColumns]); // columnSizing itself should not be a direct dependency here to avoid loops

  const columns = useMemo<ColumnDef<DataRow>[]>(() => {
    if (!data || !data.length || !data[0]) return [];
    const keys = Object.keys(data[0]);

    return keys
      .map((key): ColumnDef<DataRow> => {
        return {
          accessorKey: key,
          minSize: MIN_COLUMN_WIDTH,
          maxSize: MAX_COLUMN_WIDTH,
          header: () => (
            // Simplified header
            <div
              className="h-7 text-xs w-full flex items-center justify-start pl-0"
              title={key}
            >
              <span className="truncate">{key}</span>
            </div>
          ),
          cell: ({ row }) => {
            const value = row.getValue(key);
            const titleAttribute =
              typeof value === "object"
                ? JSON.stringify(value)
                : String(value ?? "");
            let displayValue: React.ReactNode;

            if (
              columnRenderers &&
              columnRenderers[key] &&
              value !== null &&
              value !== undefined
            ) {
              displayValue = columnRenderers[key](value);
            } else if (value === null || value === undefined) {
              displayValue = (
                <span className="text-neutral-400 italic text-xs opacity-50">
                  null
                </span>
              );
            } else if (typeof value === "object") {
              // Properly stringify objects for display
              const stringifiedValue = JSON.stringify(value);
              displayValue = stringifiedValue; // Use plain string for better copy behavior
            } else {
              displayValue = String(value); // Default to string
            }

            return (
              <Tooltip delayDuration={300}>
                <TooltipTrigger asChild>
                  <div 
                    className={`p-1 px-2 align-middle text-xs overflow-hidden whitespace-nowrap ${
                      typeof value === "object" ? "font-mono text-blue-500" : ""
                    }`}
                    data-copy-text={titleAttribute}
                    onCopy={(e) => {
                      // Ensure proper string is copied instead of "[object Object]"
                      const selection = window.getSelection();
                      if (selection && selection.toString()) {
                        e.preventDefault();
                        e.clipboardData?.setData('text/plain', titleAttribute);
                      }
                    }}
                    // Add plain text for reliable copying
                    suppressContentEditableWarning={true}
                  >
                    {displayValue}
                  </div>
                </TooltipTrigger>
                <TooltipContent
                  side="top"
                  align="start"
                  className="max-w-md break-all bg-popover text-popover-foreground p-2 rounded-md shadow-md border text-xs"
                >
                  <p>{titleAttribute}</p>
                </TooltipContent>
              </Tooltip>
            );
          },
          enableColumnFilter: false,
          filterFn: globalFilterFn,
        };
      })
      .filter((column) => {
        const accessorKey = (column as any).accessorKey as string;
        return (
          accessorKey === undefined || enabledColumns[accessorKey] !== false
        );
      });
  }, [data, enabledColumns, columnRenderers]);

  const handleColumnSizeChange = (
    updater: React.SetStateAction<ColumnSizingState>
  ) => {
    const newSizingFromTable =
      typeof updater === "function" ? updater(columnSizing) : updater;
    setColumnSizing(newSizingFromTable);
    setUserResizedColumns(newSizingFromTable);
  };

  const table = useReactTable({
    data,
    columns,
    columnResizeMode,
    state: {
      columnFilters,
      globalFilter,
      pagination,
      columnSizing,
      // sorting, // REMOVED
    },
    onColumnFiltersChange: setColumnFilters,
    onGlobalFilterChange: setGlobalFilter,
    onPaginationChange: setPagination,
    onColumnSizingChange: handleColumnSizeChange,
    // onSortingChange: setSorting, // REMOVED
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    // getSortedRowModel: getSortedRowModel(), // REMOVED
    enableGlobalFilter: true,
    enableColumnResizing: true,
    // enableSorting: true, // REMOVED (or set to false)
    debugTable: false, // Set to true for debugging if needed
  });

  const { rows } = table.getRowModel();
  const ROW_HEIGHT = 32; // Must match CSS and cell content height

  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    estimateSize: () => ROW_HEIGHT,
    getScrollElement: () => horizontalScrollRef.current,
    overscan: 10, // Lowered slightly, adjust as needed
  });

  const virtualRows = rowVirtualizer.getVirtualItems();
  const paddingTop = virtualRows.length > 0 ? virtualRows[0]?.start ?? 0 : 0;
  const paddingBottom =
    virtualRows.length > 0
      ? rowVirtualizer.getTotalSize() -
        (virtualRows[virtualRows.length - 1]?.end ?? 0)
      : 0;

  const exportToCSV = () => {
    if (!data || !data.length) return;
    const visibleKeys = table.getVisibleLeafColumns().map((c) => c.id);
    const headers =
      visibleKeys.length > 0
        ? visibleKeys
        : data[0]
        ? Object.keys(data[0])
        : [];
    if (headers.length === 0) return;

    const csvRows = [headers.join(",")];
    // Export based on current filter, but original data (not paginated)
    const dataToExport = table
      .getFilteredRowModel()
      .rows.map((r) => r.original);

    for (const row of dataToExport) {
      const values = headers.map((header) => {
        const value = row[header];
        if (value === null || value === undefined) return "";
        if (typeof value === "string" && value.includes(","))
          return `"${value.replace(/"/g, '""')}"`;
        if (typeof value === "object")
          return `"${JSON.stringify(value).replace(/"/g, '""')}"`;
        return String(value);
      });
      csvRows.push(values.join(","));
    }
    const blob = new Blob([csvRows.join("\n")], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute(
      "download",
      `gigapi-ui-query-results-${new Date().toISOString().slice(0, 19)}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const toggleColumnVisibility = (columnId: string) => {
    setEnabledColumns((prev) => ({ ...prev, [columnId]: !prev[columnId] }));
  };

  const toggleAllColumns = (value: boolean) => {
    if (!data || !data.length || !data[0]) return;
    setEnabledColumns(
      Object.keys(data[0]).reduce((acc, key) => {
        acc[key] = value;
        return acc;
      }, {} as Record<string, boolean>)
    );
  };

  const ColumnSelector = () => {
    if (!data || !data.length || !data[0]) return null;
    const allColumnKeys = Object.keys(data[0]);
    const visibleCount = Object.values(enabledColumns).filter(Boolean).length;
    const totalCount = allColumnKeys.length;

    // Simplified filtering for column selector
    const filteredColumnKeys = useMemo(() => {
      if (!columnSelectorFilter) return allColumnKeys;
      return allColumnKeys.filter((key) =>
        key.toLowerCase().includes(columnSelectorFilter.toLowerCase())
      );
    }, [allColumnKeys, columnSelectorFilter]);

    return (
      <Card className="absolute right-0 top-12 z-20 w-[350px] bg-background shadow-lg rounded-md border p-2">
        <CardContent className="p-2">
          <div className="flex justify-between items-center mb-2">
            <h3 className="text-sm font-semibold">
              Toggle Columns{" "}
              <span className="text-xs text-muted-foreground">
                ({visibleCount}/{totalCount})
              </span>
            </h3>
            <div className="flex gap-1">
              <Button
                variant="outline"
                size="sm"
                className="h-7 px-1.5 text-xs"
                onClick={() => toggleAllColumns(true)}
              >
                All
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-7 px-1.5 text-xs"
                onClick={() => toggleAllColumns(false)}
              >
                None
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0"
                onClick={() => setShowColumnSelector(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <div className="relative mb-3">
            <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 h-3 w-3 text-muted-foreground" />
            <Input
              value={columnSelectorFilter}
              onChange={(e) => setColumnSelectorFilter(e.target.value)}
              placeholder="Filter columns..."
              className="pl-7 h-7 text-xs w-full"
            />
            {columnSelectorFilter && (
              <Button
                variant="ghost"
                size="sm"
                className="absolute right-1 top-1/2 transform -translate-y-1/2 h-5 w-5 p-0"
                onClick={() => setColumnSelectorFilter("")}
              >
                <X className="h-3 w-3" />
              </Button>
            )}
          </div>
          <div className="h-[350px] pr-1 overflow-y-auto space-y-1">
            {filteredColumnKeys.map((columnId) => (
              <div key={columnId} className="flex items-center space-x-2 pl-1">
                <Checkbox
                  id={`column-sel-${columnId}`}
                  checked={enabledColumns[columnId] !== false}
                  onCheckedChange={() => toggleColumnVisibility(columnId)}
                />
                <label
                  htmlFor={`column-sel-${columnId}`}
                  className="text-xs cursor-pointer truncate max-w-[240px]"
                  title={columnId}
                >
                  {columnId}
                </label>
              </div>
            ))}
            {filteredColumnKeys.length === 0 && (
              <div className="text-xs text-muted-foreground text-center py-2">
                No columns match your filter.
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    );
  };

  if (!data || data.length === 0) {
    return (
      <div className="flex justify-center items-center h-32 text-muted-foreground">
        No data available.
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div
        className="flex flex-col h-full w-full overflow-hidden"
        ref={tableContainerRef}
      >
        {/* Top controls area */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 gap-2 flex-shrink-0">
          <div className="flex items-center gap-2 flex-1">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Search all columns..."
                value={globalFilterInput}
                onChange={(e) => setGlobalFilterInput(e.target.value)}
                className="pl-8 h-8 text-xs"
              />
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setGlobalFilterInput("");
                table.resetColumnFilters(true);
              }}
              className="h-8 text-xs"
              disabled={
                !globalFilterInput && !table.getState().columnFilters.length
              }
            >
              Clear Filters
            </Button>
          </div>
          <div className="hidden md:flex items-center gap-x-4 text-xs text-muted-foreground px-2">
            {executionTime !== null && executionTime !== undefined && (
              <div
                className="flex items-center gap-1"
                title="Query execution time"
              >
                <Clock className="h-3 w-3" />
                <span>{formatDuration(executionTime)}</span>
              </div>
            )}
            {responseSize !== null && responseSize !== undefined && (
              <div className="flex items-center" title="Response size">
                <span>{formatBytes(responseSize)}</span>
              </div>
            )}
            <span title="Showing rows count">
              {data.length.toLocaleString()} rows
            </span>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowColumnSelector(!showColumnSelector)}
                className="h-8 text-xs"
                title="Configure visible columns"
              >
                <SlidersHorizontal className="h-3.5 w-3.5 mr-1" />
                Columns
              </Button>
              {showColumnSelector && <ColumnSelector />}
            </div>
            {Object.keys(userResizedColumns).length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setUserResizedColumns({})}
                className="h-8 text-xs"
                title="Reset column widths"
              >
                Reset Size
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={exportToCSV}
              className="h-8 text-xs"
              disabled={!data || !data.length}
              title="Export visible data as CSV"
            >
              <Download className="mr-1 h-3.5 w-3.5" />
              Export CSV
            </Button>
          </div>
        </div>

        {/* Main table area */}
        <div className="flex-1 border rounded-md bg-card relative overflow-hidden">
          <div
            ref={horizontalScrollRef}
            className="h-full w-full overflow-auto"
            style={{
              height:
                typeof tableHeight === "string"
                  ? tableHeight
                  : `${tableHeight}px`,
            }}
          >
            <div style={{ width: table.getTotalSize(), position: "relative" }}>
              <table className="w-full border-collapse table-fixed">
                <thead className="sticky top-0 z-10 bg-muted/70 backdrop-blur-sm shadow-sm">
                  {table.getHeaderGroups().map((headerGroup) => (
                    <tr
                      key={headerGroup.id}
                      className="border-b border-border/40"
                    >
                      {headerGroup.headers.map((header) => (
                        <th
                          key={header.id}
                          className="h-9 px-0 text-left align-middle font-medium text-muted-foreground whitespace-nowrap text-xs relative select-none"
                          style={{
                            width: header.getSize(),
                            minWidth: header.column.columnDef.minSize, // From columnDef
                            maxWidth: header.column.columnDef.maxSize, // From columnDef
                          }}
                        >
                          <div className="flex items-center justify-between w-full h-full px-2">
                            {flexRender(
                              header.column.columnDef.header,
                              header.getContext()
                            )}
                          </div>
                          {header.column.getCanResize() && (
                            <div
                              className={`absolute right-0 top-0 h-full w-2 cursor-col-resize select-none touch-none group ${
                                header.column.getIsResizing()
                                  ? "bg-primary/20"
                                  : ""
                              }`}
                              onMouseDown={header.getResizeHandler()}
                              onTouchStart={header.getResizeHandler()}
                              style={{ userSelect: "none" }}
                            >
                              <div
                                className={`w-[1px] h-4/6 my-auto ${
                                  header.column.getIsResizing()
                                    ? "bg-primary w-[2px]"
                                    : "bg-border/60 group-hover:bg-primary/60 group-hover:w-[2px]"
                                }`}
                              />
                            </div>
                          )}
                        </th>
                      ))}
                    </tr>
                  ))}
                </thead>
                <tbody className="bg-card text-card-foreground relative">
                  {paddingTop > 0 && (
                    <tr style={{ height: `${paddingTop}px` }}>
                      <td colSpan={table.getVisibleLeafColumns().length} />
                    </tr>
                  )}
                  {virtualRows.map((virtualRow) => {
                    const row = rows[virtualRow.index];
                    if (!row) return null;
                    return (
                      <tr
                        key={virtualRow.key}
                        data-index={virtualRow.index}
                        className={`transition-colors hover:bg-muted/30 ${
                          row.getIsSelected() ? "bg-muted" : ""
                        }`}
                        style={{ height: `${ROW_HEIGHT}px` }} // Use fixed ROW_HEIGHT
                      >
                        {row.getVisibleCells().map((cell) => (
                          <td
                            key={cell.id}
                            className="align-middle overflow-hidden"
                            style={{
                              width: cell.column.getSize(),
                              minWidth: cell.column.columnDef.minSize,
                              maxWidth: cell.column.columnDef.maxSize,
                            }}
                          >
                            {flexRender(
                              cell.column.columnDef.cell,
                              cell.getContext()
                            )}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                  {paddingBottom > 0 && (
                    <tr style={{ height: `${paddingBottom}px` }}>
                      <td colSpan={table.getVisibleFlatColumns().length} />
                    </tr>
                  )}
                  {rows.length === 0 && (
                    <tr>
                      <td
                        colSpan={columns.length || 1}
                        className="h-24 text-center text-muted-foreground"
                      >
                        No results match your filters.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Pagination controls */}
        <div className="flex items-center justify-between mt-4 flex-shrink-0">
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => table.setPageIndex(0)}
              disabled={!table.getCanPreviousPage()}
              className="h-7 w-7 p-0 text-xs"
              title="First page"
            >
              ««
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
              className="h-7 w-7 p-0 text-xs"
              title="Previous page"
            >
              «
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
              className="h-7 w-7 p-0 text-xs"
              title="Next page"
            >
              »
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => table.setPageIndex(table.getPageCount() - 1)}
              disabled={!table.getCanNextPage()}
              className="h-7 w-7 p-0 text-xs"
              title="Last page"
            >
              »»
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">
              Page {table.getState().pagination.pageIndex + 1} of{" "}
              {table.getPageCount() || 1}
            </span>
            <select
              value={table.getState().pagination.pageSize}
              onChange={(e) => {
                table.setPageSize(Number(e.target.value));
              }}
              className="text-xs border border-border/40 rounded-md h-7 px-2 bg-background"
              title="Rows per page"
            >
              {[10, 25, 50, 100, 250, 500].map((pageSize) => (
                <option key={pageSize} value={pageSize}>
                  {pageSize} rows
                </option>
              ))}
            </select>
          </div>
        </div>
        {/* Mobile stats */}
        <div className="md:hidden flex items-center justify-between text-xs text-muted-foreground py-2 border-t border-border/30 mt-2 flex-shrink-0">
          <span>
            {table.getFilteredRowModel().rows.length} of {data.length} rows
          </span>
          <div className="flex items-center gap-x-3">
            {executionTime !== null && executionTime !== undefined && (
              <div className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                <span>{formatDuration(executionTime)}</span>
              </div>
            )}
            {responseSize !== null && responseSize !== undefined && (
              <div className="flex items-center">
                <span>{formatBytes(responseSize)}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
};

export default GigTable;
