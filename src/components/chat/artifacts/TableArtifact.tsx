import { useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { TableArtifact as TableArtifactType } from "@/types/artifact.types";
import { cn } from "@/lib/utils/class-utils";

interface TableArtifactProps {
  artifact: TableArtifactType;
  data: any[];
  onPageChange?: (page: number) => void;
}

export default function TableArtifact({ artifact, data }: TableArtifactProps) {
  const config = artifact.data;
  const [currentPage, setCurrentPage] = useState(1);
  const [sortField, setSortField] = useState(config.sorting?.field);
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">(
    config.sorting?.order || "asc"
  );

  // Pagination setup
  const pageSize = config.pagination?.pageSize || 50;
  const totalPages = Math.ceil(data.length / pageSize);
  const paginationEnabled =
    config.pagination?.enabled !== false && data.length > pageSize;

  // Sort data
  const sortedData = [...data].sort((a, b) => {
    if (!sortField) return 0;

    const aVal = a[sortField];
    const bVal = b[sortField];

    if (aVal === null || aVal === undefined) return 1;
    if (bVal === null || bVal === undefined) return -1;

    const comparison = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
    return sortOrder === "asc" ? comparison : -comparison;
  });

  // Paginate data
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const paginatedData = sortedData.slice(startIndex, endIndex);

  // Get columns configuration
  const columns =
    config.columns ||
    (data.length > 0
      ? Object.keys(data[0]).map((field) => ({ field, title: field }))
      : []);

  const visibleColumns = columns.filter(
    (col) => !("hidden" in col && col.hidden)
  );

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortOrder("asc");
    }
  };

  const formatCellValue = (value: any, format?: string): string => {
    if (value === null || value === undefined) return "";

    switch (format) {
      case "number":
        return typeof value === "number"
          ? value.toLocaleString()
          : String(value);
      case "date":
        return new Date(value).toLocaleString();
      case "boolean":
        return value ? "✓" : "✗";
      default:
        return String(value);
    }
  };

  return (
    <div className="w-full">
      <div className="overflow-x-auto border border-neutral-700 rounded-lg">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-neutral-700 bg-neutral-800/50">
              {visibleColumns.map((col) => (
                <th
                  key={col.field}
                  className={cn(
                    "px-4 py-3 font-medium text-neutral-200",
                    "align" in col && col.align === "center" && "text-center",
                    "align" in col && col.align === "right" && "text-right",
                    "cursor-pointer hover:bg-neutral-700/50 transition-colors"
                  )}
                  style={{ width: "width" in col ? col.width : undefined }}
                  onClick={() => handleSort(col.field)}
                >
                  <div className="flex items-center gap-2">
                    {col.title || col.field}
                    {sortField === col.field && (
                      <span className="text-xs">
                        {sortOrder === "asc" ? "↑" : "↓"}
                      </span>
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {paginatedData.length === 0 ? (
              <tr>
                <td
                  colSpan={visibleColumns.length}
                  className="text-center py-8 text-neutral-400"
                >
                  No data available
                </td>
              </tr>
            ) : (
              paginatedData.map((row, idx) => (
                <tr
                  key={idx}
                  className="border-b border-neutral-800 hover:bg-neutral-800/30 transition-colors"
                >
                  {visibleColumns.map((col) => (
                    <td
                      key={col.field}
                      className={cn(
                        "px-4 py-2 text-neutral-300",
                        "align" in col &&
                          col.align === "center" &&
                          "text-center",
                        "align" in col && col.align === "right" && "text-right"
                      )}
                    >
                      {formatCellValue(
                        row[col.field],
                        "format" in col ? col.format : undefined
                      )}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {paginationEnabled && (
        <div className="flex items-center justify-between mt-4 text-sm">
          <div className="text-neutral-400">
            Showing {startIndex + 1} to {Math.min(endIndex, data.length)} of{" "}
            {data.length} rows
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(1)}
              disabled={currentPage === 1}
              className="h-8 w-8 p-0"
            >
              <ChevronsLeft className="w-4 h-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(currentPage - 1)}
              disabled={currentPage === 1}
              className="h-8 w-8 p-0"
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <span className="text-neutral-300 px-2">
              Page {currentPage} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(currentPage + 1)}
              disabled={currentPage === totalPages}
              className="h-8 w-8 p-0"
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(totalPages)}
              disabled={currentPage === totalPages}
              className="h-8 w-8 p-0"
            >
              <ChevronsRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
