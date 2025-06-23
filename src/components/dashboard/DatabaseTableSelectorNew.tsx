import { useEffect } from "react";
import { useDashboardDatabase } from "@/contexts/DashboardDatabaseContext";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";

interface DatabaseTableSelectorProps {
  onSchemaLoad?: (columns: string[], timeColumns: string[]) => void;
  className?: string;
}

export function DatabaseTableSelector({
  onSchemaLoad,
  className,
}: DatabaseTableSelectorProps) {
  const {
    databases,
    selectedDb,
    selectedTable,
    schema,
    tableSchema,
    loading,
    setSelectedDb,
    setSelectedTable,
  } = useDashboardDatabase();

  // Get available tables for the selected database
  const availableTables = selectedDb ? schema[selectedDb] || [] : [];

  // Notify parent component when schema is loaded
  useEffect(() => {
    if (tableSchema && onSchemaLoad) {
      const columns = tableSchema.columns.map(col => col.columnName);
      const timeColumns = tableSchema.columns
        .filter(col => 
          col.dataType.toLowerCase().includes('time') ||
          col.dataType.toLowerCase().includes('date') ||
          col.columnName.toLowerCase().includes('time') ||
          col.columnName.toLowerCase().includes('date') ||
          col.columnName.toLowerCase().includes('created') ||
          col.columnName.toLowerCase().includes('updated')
        )
        .map(col => col.columnName);
      
      onSchemaLoad(columns, timeColumns);
    }
  }, [tableSchema, onSchemaLoad]);

  const handleDatabaseChange = (db: string) => {
    setSelectedDb(db);
  };

  const handleTableChange = (table: string) => {
    setSelectedTable(table);
  };

  return (
    <div className={`flex items-center gap-4 ${className || ''}`}>
      <div className="flex items-center gap-2">
        <Label htmlFor="database-select" className="text-sm font-medium whitespace-nowrap">
          Database
        </Label>
        <Select
          value={selectedDb || ""}
          onValueChange={handleDatabaseChange}
        >
          <SelectTrigger id="database-select" className="w-[180px]">
            <SelectValue placeholder="Select database" />
          </SelectTrigger>
          <SelectContent>
            {databases.map((db) => (
              <SelectItem key={db.database_name} value={db.database_name}>
                {db.database_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center gap-2">
        <Label htmlFor="table-select" className="text-sm font-medium whitespace-nowrap">
          Table
        </Label>
        <Select
          value={selectedTable || ""}
          onValueChange={handleTableChange}
          disabled={!selectedDb || loading}
        >
          <SelectTrigger id="table-select" className="w-[180px]">
            <SelectValue placeholder={
              !selectedDb 
                ? "Select database first" 
                : availableTables.length === 0 
                  ? "No tables found"
                  : "Select table"
            } />
          </SelectTrigger>
          <SelectContent>
            {availableTables.length > 0 ? (
              availableTables.map((table) => (
                <SelectItem key={table.tableName} value={table.tableName}>
                  {table.tableName}
                </SelectItem>
              ))
            ) : (
              <SelectItem value="no-tables" disabled>
                {loading ? "Loading..." : "No tables found"}
              </SelectItem>
            )}
          </SelectContent>
        </Select>
        {loading && <Loader2 className="h-4 w-4 animate-spin" />}
      </div>
    </div>
  );
}
