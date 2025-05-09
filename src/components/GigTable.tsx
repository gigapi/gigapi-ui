import React, { useState, useMemo, useEffect, useRef } from "react";
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  useReactTable,
} from "@tanstack/react-table";
import type {
  ColumnDef,
  FilterFn,
  ColumnFiltersState,
  ColumnResizeMode,
  PaginationState,
  ColumnSizingState,
} from "@tanstack/react-table";
import { formatBytes, formatDuration } from "../lib/utils";
import { Download, Search, X, Clock, SlidersHorizontal } from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Checkbox } from "./ui/checkbox";
import { Card, CardContent } from "./ui/card";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "./ui/tooltip";

// Define a generic type for the data row
type DataRow = Record<string, any>;

// Type for the component props with better documentation
interface GigTableProps {
  /**
   * The data to display in the table
   * Expected to be an array of objects with consistent keys
   */
  data: DataRow[];

  /** The time taken to execute the query (in milliseconds) */
  executionTime?: number | null;

  /** The size of the response (in bytes) */
  responseSize?: number | null;

  /** Initial page size for pagination (defaults to 100) */
  initialPageSize?: number;

  /** Optional custom renderers for specific column types */
  columnRenderers?: Record<string, (value: any) => React.ReactNode>;

  /** Optional height for the table container (defaults to 100%) */
  tableHeight?: string | number;
}

// Helper to attempt date formatting with more extensive date detection
function tryFormatDate(value: any): string | null {
  if (value === null || value === undefined) return null;

  try {
    // Check if it's a timestamp (milliseconds or seconds since epoch)
    const numValue = Number(value);
    if (!isNaN(numValue)) {
      // Handle both millisecond and second timestamps
      const timestamp =
        String(numValue).length >= 13
          ? numValue
          : String(numValue).length === 10
          ? numValue * 1000
          : null;

      if (timestamp !== null) {
        const date = new Date(timestamp);
        if (!isNaN(date.getTime())) {
          return date.toLocaleString([], {
            year: "numeric",
            month: "numeric",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
          });
        }
      }
    }

    // Try parsing as ISO date string or other common date formats
    const date = new Date(value);
    if (!isNaN(date.getTime())) {
      return date.toLocaleString([], {
        year: "numeric",
        month: "numeric",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
    }
  } catch (e) {
    // Ignore formatting errors
  }

  return null;
}

// Enhanced global text filter function
const globalFilterFn: FilterFn<DataRow> = (row, columnId, value) => {
  const cellValue = row.getValue(columnId);
  if (cellValue === null || cellValue === undefined) return false;

  // Convert values to strings for comparison
  const searchStr = String(cellValue).toLowerCase();
  const filterValue = String(value).toLowerCase();

  // Check for exact matches or contains
  return searchStr.includes(filterValue);
};

// Main GigTable component
const GigTable: React.FC<GigTableProps> = ({
  data,
  executionTime,
  responseSize,
  initialPageSize = 100,
  columnRenderers,
  tableHeight = "100%",
}) => {
  // Refs for scrolling synchronization
  const horizontalScrollRef = useRef<HTMLDivElement>(null);

  // State management
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [globalFilter, setGlobalFilter] = useState("");
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

  // Column resize configuration
  const columnResizeMode = "onChange" as ColumnResizeMode;

  // Detect fields that should be handled as dates
  const detectDateFields = (data: DataRow[]): string[] => {
    if (!data || data.length === 0) return [];

    const dateFields: string[] = [];
    const sampleRow = data[0];

    Object.keys(sampleRow).forEach((key) => {
      const keyLower = key.toLowerCase();

      // Check key name patterns that usually indicate date fields
      if (
        keyLower.includes("time") ||
        keyLower.includes("date") ||
        keyLower.includes("timestamp") ||
        keyLower.includes("created") ||
        keyLower.includes("updated") ||
        keyLower.includes("modified")
      ) {
        // Verify by attempting to parse the first non-null value
        for (const row of data.slice(0, 5)) {
          if (row[key] !== null && row[key] !== undefined) {
            const formattedDate = tryFormatDate(row[key]);
            if (formattedDate) {
              dateFields.push(key);
              break;
            }
          }
        }
      }
    });

    return dateFields;
  };

  // Memoized date fields detection
  const dateFields = useMemo(() => detectDateFields(data), [data]);

  // Memoized getOptimalColumnSize to avoid re-computation if data hasn't changed
  const getOptimalColumnSize = useMemo(() => {
    return (key: string) => {
      if (!data || !data.length) return { min: 100, max: 250 };

      const keyLower = key.toLowerCase();

      // Handle date/time fields
      if (
        dateFields.includes(key) ||
        keyLower.includes("time") ||
        keyLower.includes("date")
      ) {
        return { min: 160, max: 200 };
      }

      // Handle ID fields
      if (
        keyLower.includes("id") ||
        key === "_id" ||
        key.endsWith("_id") ||
        key.startsWith("__")
      ) {
        return { min: 120, max: 200 };
      }

      // Handle boolean fields
      if (
        data.every((row) => typeof row[key] === "boolean" || row[key] === null)
      ) {
        return { min: 70, max: 100 };
      }

      // Handle numeric fields
      if (
        data.every((row) => typeof row[key] === "number" || row[key] === null)
      ) {
        const avgLength =
          data.reduce(
            (sum, row) =>
              sum + (row[key] !== null ? String(row[key]).length : 0),
            0
          ) / data.length;

        if (avgLength < 3) return { min: 70, max: 100 };
        if (avgLength < 6) return { min: 90, max: 140 };
        return { min: 120, max: 180 };
      }

      // Handle text content fields
      if (
        keyLower.includes("payload") ||
        keyLower.includes("message") ||
        keyLower.includes("content") ||
        keyLower.includes("description") ||
        keyLower.includes("text")
      ) {
        return { min: 200, max: 500 };
      }

      // Handle SIP header fields
      if (keyLower.startsWith("sip_")) {
        return { min: 140, max: 300 };
      }

      // Handle IP/address fields
      if (keyLower.includes("ip") || keyLower.includes("address")) {
        return { min: 130, max: 180 };
      }

      // Size based on field name length
      const nameLength = key.length;
      if (nameLength > 30) return { min: 180, max: 300 };
      if (nameLength > 20) return { min: 160, max: 250 };
      if (nameLength > 10) return { min: 140, max: 220 };

      return { min: 120, max: 200 };
    };
  }, [data, dateFields]);

  // Initialize/Update enabled columns when data changes
  useEffect(() => {
    if (data && data.length > 0) {
      const allKeys = Object.keys(data[0]);

      // Initialize enabled columns (preserve user settings when data refreshes)
      const initialEnabledCols = allKeys.reduce((acc, key) => {
        acc[key] =
          enabledColumns[key] === undefined ? true : enabledColumns[key];
        return acc;
      }, {} as Record<string, boolean>);

      setEnabledColumns(initialEnabledCols);

      // Filter out userResizedColumns for columns that no longer exist
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
  }, [data]);

  // Effect to initialize columnSizing or update it when userResizedColumns change
  useEffect(() => {
    if (data && data.length > 0) {
      const newSizingState: ColumnSizingState = {};

      Object.keys(data[0]).forEach((key) => {
        const optimalSize = getOptimalColumnSize(key);
        newSizingState[key] =
          userResizedColumns[key] !== undefined
            ? userResizedColumns[key]
            : optimalSize.min;
      });

      if (JSON.stringify(columnSizing) !== JSON.stringify(newSizingState)) {
        setColumnSizing(newSizingState);
      }
    } else if (Object.keys(columnSizing).length > 0) {
      setColumnSizing({});
    }
  }, [data, userResizedColumns, getOptimalColumnSize, columnSizing]);

  // Define columns for the table
  const columns = useMemo<ColumnDef<DataRow>[]>(() => {
    if (!data || !data.length) return [];

    const keys = Object.keys(data[0]);

    return keys
      .map((key): ColumnDef<DataRow> => {
        const { min: minSize, max: maxSize } = getOptimalColumnSize(key);
        const isNumberColumn = data.every(
          (row) =>
            typeof row[key] === "number" ||
            row[key] === null ||
            row[key] === undefined
        );

        return {
          accessorKey: key,
          minSize,
          maxSize,
          header: () => (
            <div
              className={`h-7 text-xs w-full flex items-center ${
                isNumberColumn ? "justify-end pr-2" : "justify-start pl-0"
              }`}
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

            // Default cell styling
            let cellClassName =
              "p-1 px-2 align-middle text-xs overflow-hidden whitespace-nowrap";
            let displayValue: React.ReactNode = String(value);

            // Custom renderer for this column type if provided
            if (
              columnRenderers &&
              columnRenderers[key] &&
              value !== null &&
              value !== undefined
            ) {
              displayValue = columnRenderers[key](value);
            }
            // Null/undefined values
            else if (value === null || value === undefined) {
              displayValue = (
                <span className="text-neutral-400 italic text-xs opacity-50">
                  null
                </span>
              );
            }
            // Date/time values
            else if (dateFields.includes(key)) {
              const formattedDate = tryFormatDate(value);
              if (formattedDate) {
                displayValue = formattedDate;
                cellClassName += " min-w-[180px]";
              } else displayValue = String(value);
            }
            // Boolean values
            else if (typeof value === "boolean") {
              displayValue = value ? "True" : "False";
            }
            // Number values
            else if (typeof value === "number") {
              displayValue = value.toLocaleString();
              cellClassName += " text-right";
            }
            // Object values (JSON)
            else if (typeof value === "object") {
              const jsonString = JSON.stringify(value);
              displayValue = (
                <div 
                  className="text-xs max-w-full overflow-hidden text-ellipsis whitespace-nowrap"
                  title={jsonString}
                >
                  {jsonString}
                </div>
              );
            }

            return (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className={cellClassName}>{displayValue}</div>
                  </TooltipTrigger>
                  <TooltipContent
                    side="top"
                    align="start"
                    className="max-w-md break-all"
                  >
                    <p className="text-xs">{titleAttribute}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
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
  }, [data, enabledColumns, getOptimalColumnSize, dateFields, columnRenderers]);

  // Handle column resize events
  const handleColumnSizeChange = (
    updater: React.SetStateAction<ColumnSizingState>
  ) => {
    const newSizingFromTable =
      typeof updater === "function" ? updater(columnSizing) : updater;
    setColumnSizing(newSizingFromTable);
    setUserResizedColumns(newSizingFromTable);
  };

  // Configure the table instance
  const table = useReactTable({
    data,
    columns,
    columnResizeMode,
    state: {
      columnFilters,
      globalFilter,
      pagination,
      columnSizing,
    },
    onColumnFiltersChange: setColumnFilters,
    onGlobalFilterChange: setGlobalFilter,
    onPaginationChange: setPagination,
    onColumnSizingChange: handleColumnSizeChange,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    enableGlobalFilter: true,
    enableColumnResizing: true,
    debugTable: false,
    debugHeaders: false,
    debugColumns: false,
  });

  // Export table data to CSV
  const exportToCSV = () => {
    if (!data || !data.length) return;

    // Get visible columns
    const visibleKeys = columns
      .filter(
        (c) =>
          (c as any).accessorKey &&
          enabledColumns[(c as any).accessorKey as string] !== false
      )
      .map((c) => (c as any).accessorKey as string);

    const headers = visibleKeys.length > 0 ? visibleKeys : Object.keys(data[0]);

    // Create CSV rows
    const csvRows = [headers.join(",")];

    for (const row of data) {
      const values = headers.map((header) => {
        const value = row[header];
        // Format cell values for CSV
        if (value === null || value === undefined) {
          return "";
        } else if (typeof value === "string" && value.includes(",")) {
          return `"${value.replace(/"/g, '""')}"`;
        } else if (typeof value === "object") {
          return `"${JSON.stringify(value).replace(/"/g, '""')}"`;
        } else {
          return String(value);
        }
      });

      csvRows.push(values.join(","));
    }

    // Create and download the CSV file
    const blob = new Blob([csvRows.join("\n")], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute(
      "download",
      `query-results-${new Date().toISOString().slice(0, 19)}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Column visibility toggle functions
  const toggleColumnVisibility = (columnId: string) => {
    setEnabledColumns((prev) => ({ ...prev, [columnId]: !prev[columnId] }));
  };

  const toggleAllColumns = (value: boolean) => {
    if (!data || !data.length) return;
    setEnabledColumns(
      Object.keys(data[0]).reduce((acc, key) => {
        acc[key] = value;
        return acc;
      }, {} as Record<string, boolean>)
    );
  };

  // Column Selector component
  const ColumnSelector = () => {
    if (!data || !data.length) return null;
    const allColumnKeys = Object.keys(data[0]);

    // Group columns by type
    const groupedColumns = useMemo(() => {
      const groups: Record<string, string[]> = {
        "Timestamp/Date": [],
        "IDs/Keys": [],
        "Metrics/Values": [],
        "SIP Headers": [],
        "Connection Info": [],
        Other: [],
      };

      allColumnKeys.forEach((col) => {
        const colLower = col.toLowerCase();

        if (
          dateFields.includes(col) ||
          colLower.includes("time") ||
          colLower.includes("date")
        ) {
          groups["Timestamp/Date"].push(col);
        } else if (
          colLower.includes("id") ||
          colLower.includes("key") ||
          colLower.includes("uuid")
        ) {
          groups["IDs/Keys"].push(col);
        } else if (
          colLower.includes("size") ||
          colLower.includes("count") ||
          colLower.includes("value") ||
          colLower.includes("total") ||
          colLower.includes("bytes") ||
          colLower.includes("length") ||
          colLower.includes("temperature") ||
          colLower.includes("temp")
        ) {
          groups["Metrics/Values"].push(col);
        } else if (colLower.startsWith("sip_")) {
          groups["SIP Headers"].push(col);
        } else if (
          colLower.includes("ip") ||
          colLower.includes("port") ||
          colLower.includes("route") ||
          colLower.includes("socket") ||
          colLower.includes("branch") ||
          colLower.includes("location")
        ) {
          groups["Connection Info"].push(col);
        } else {
          groups["Other"].push(col);
        }
      });

      // Remove empty groups and sort columns within groups
      Object.keys(groups).forEach((key) => {
        if (groups[key].length === 0) {
          delete groups[key];
        } else {
          groups[key].sort();
        }
      });

      return groups;
    }, [allColumnKeys, dateFields]);

    // Filter columns based on search input
    const filteredGroupedColumns = useMemo(() => {
      if (!columnSelectorFilter) return groupedColumns;

      const filtered: Record<string, string[]> = {};

      Object.keys(groupedColumns).forEach((group) => {
        const matchingCols = groupedColumns[group].filter((col) =>
          col.toLowerCase().includes(columnSelectorFilter.toLowerCase())
        );

        if (matchingCols.length > 0) {
          filtered[group] = matchingCols;
        }
      });

      return filtered;
    }, [groupedColumns, columnSelectorFilter]);

    const visibleCount = Object.values(enabledColumns).filter(Boolean).length;
    const totalCount = allColumnKeys.length;

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

          <div className="h-[350px] pr-3 overflow-auto">
            <div className="space-y-3">
              {Object.keys(filteredGroupedColumns).map((group) => (
                <div key={group} className="space-y-1">
                  <div className="flex items-center justify-between mb-1">
                    <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      {group} ({filteredGroupedColumns[group].length})
                    </h4>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-5 px-1 text-[10px]"
                        onClick={() => {
                          const newState = { ...enabledColumns };
                          filteredGroupedColumns[group].forEach((col) => {
                            newState[col] = true;
                          });
                          setEnabledColumns(newState);
                        }}
                      >
                        Show
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-5 px-1 text-[10px]"
                        onClick={() => {
                          const newState = { ...enabledColumns };
                          filteredGroupedColumns[group].forEach((col) => {
                            newState[col] = false;
                          });
                          setEnabledColumns(newState);
                        }}
                      >
                        Hide
                      </Button>
                    </div>
                  </div>

                  {filteredGroupedColumns[group].map((columnId) => (
                    <div
                      key={columnId}
                      className="flex items-center space-x-2 pl-1"
                    >
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
                </div>
              ))}

              {Object.keys(filteredGroupedColumns).length === 0 && (
                <div className="text-xs text-muted-foreground text-center py-2">
                  No columns match your filter.
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  // No data message
  if (!data || data.length === 0) {
    return (
      <div className="flex justify-center items-center h-32 text-muted-foreground">
        No data available to display.
      </div>
    );
  }

  // Main component render
  return (
    <div className="flex flex-col h-full w-full overflow-hidden">
      {/* Table actions and global filter */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 gap-2 flex-shrink-0">
        <div className="flex items-center gap-2 flex-1">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Search all columns..."
              value={globalFilter ?? ""}
              onChange={(e) => setGlobalFilter(e.target.value)}
              className="pl-8 h-8 text-xs"
            />
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setGlobalFilter("");
              table.resetColumnFilters();
            }}
            className="h-8 text-xs"
            disabled={!globalFilter && !table.getState().columnFilters.length}
          >
            Clear Filters
          </Button>
        </div>

        {/* Stats display for larger screens */}
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
            {table.getFilteredRowModel().rows.length} of {data.length} rows
          </span>
        </div>

        {/* Table controls */}
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
              onClick={() => {
                setUserResizedColumns({});
              }}
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

      {/* Main table with horizontal and vertical scrolling */}
      <div
        className="flex-1 border rounded-md bg-card relative overflow-hidden"
        style={{
          height:
            typeof tableHeight === "string" ? tableHeight : `${tableHeight}px`,
        }}
      >
        {/* Main table component with synchronized scrolling */}
        <div className="h-full w-full overflow-auto" ref={horizontalScrollRef}>
          <div
            className="min-w-full relative"
            style={{ width: table.getTotalSize() + 20 }}
          >
            <table className="w-full border-collapse table-fixed">
              <thead className="sticky top-0 z-10 bg-muted/70 backdrop-blur-sm shadow-sm">
                {table.getHeaderGroups().map((headerGroup) => (
                  <tr
                    key={headerGroup.id}
                    className="border-b border-border/40 hover:bg-transparent"
                  >
                    {headerGroup.headers.map((header) => (
                      <th
                        key={header.id}
                        className="h-9 px-2 text-left align-middle font-medium text-muted-foreground whitespace-nowrap text-xs relative select-none"
                        style={{
                          width: header.getSize(),
                          minWidth: header.column.columnDef.minSize,
                          maxWidth: header.column.columnDef.maxSize,
                        }}
                      >
                        {header.isPlaceholder ? null : (
                          <>
                            <div className="flex items-center justify-between w-full h-full">
                              {flexRender(
                                header.column.columnDef.header,
                                header.getContext()
                              )}
                            </div>
                            {header.column.getCanResize() && (
                              <div
                                className={`absolute right-0 top-0 h-full w-4 cursor-col-resize select-none touch-none flex items-center justify-center group ${
                                  header.column.getIsResizing()
                                    ? "bg-primary/20" 
                                    : "hover:bg-muted/50"
                                }`}
                                onMouseDown={header.getResizeHandler()}
                                onTouchStart={header.getResizeHandler()}
                              >
                                <div 
                                  className={`w-[2px] h-5/6 ${
                                    header.column.getIsResizing()
                                      ? "bg-primary w-[3px]" 
                                      : "bg-border/60 group-hover:bg-primary/60"
                                  }`}
                                ></div>
                              </div>
                            )}
                          </>
                        )}
                      </th>
                    ))}
                  </tr>
                ))}
              </thead>

              <tbody className="bg-card text-card-foreground divide-y divide-border/20">
                {table.getRowModel().rows?.length ? (
                  table.getRowModel().rows.map((row) => (
                    <tr
                      key={row.id}
                      data-state={row.getIsSelected() && "selected"}
                      className="border-b border-border/30 transition-colors hover:bg-muted/30 data-[state=selected]:bg-muted"
                      style={{ height: '36px' }}
                    >
                      {row.getVisibleCells().map((cell) => (
                        <td
                          key={cell.id}
                          style={{
                            width: cell.column.getSize(),
                            minWidth: cell.column.columnDef.minSize,
                            maxWidth: cell.column.columnDef.maxSize,
                          }}
                          className="px-2 py-1 align-middle text-xs"
                        >
                          {flexRender(
                            cell.column.columnDef.cell,
                            cell.getContext()
                          )}
                        </td>
                      ))}
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td
                      colSpan={columns.length || 1}
                      className="h-24 text-center text-muted-foreground"
                    >
                      No results to display in table.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Pagination Controls */}
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

      {/* Mobile-only stats footer */}
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
  );
};

export default GigTable;
