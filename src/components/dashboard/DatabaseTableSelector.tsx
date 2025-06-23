import { useState, useCallback } from "react";
import { useConnection } from "@/contexts/ConnectionContext";
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
  onSelectionChange?: (database: string, table: string | null) => void;
  onQueryUpdate?: (query: string) => void;
  className?: string;
}

export function DatabaseTableSelector({
  onSchemaLoad,
  onSelectionChange,
  onQueryUpdate,
  className,
}: DatabaseTableSelectorProps) {
  const { databases, apiUrl } = useConnection();  const [selectedDb, setSelectedDb] = useState<string>("");
  const [selectedTable, setSelectedTable] = useState<string>("");
  const [availableTables, setAvailableTables] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  // Get database names
  const availableDatabases = databases.map(db => db.database_name);

  // Load tables when database is selected
  const loadTables = useCallback(async (dbName: string) => {
    if (!apiUrl || !dbName) return;
    
    setLoading(true);
    try {
      const response = await fetch(`${apiUrl}?db=${encodeURIComponent(dbName)}&format=ndjson`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: "SHOW TABLES" })
      });
      
      if (response.ok) {
        const textData = await response.text();
        const lines = textData.split('\n').filter(line => line.trim());
        const tables: string[] = [];
        
        for (const line of lines) {
          try {
            const tableObj = JSON.parse(line);
            const tableName = tableObj.table_name || tableObj.Table || Object.values(tableObj)[0];
            if (tableName) tables.push(tableName as string);
          } catch (e) {
            console.warn('Failed to parse table line:', line);
          }
        }
        
        setAvailableTables(tables);
      }
    } catch (error) {
      console.error('Failed to load tables:', error);
      setAvailableTables([]);
    } finally {
      setLoading(false);
    }
  }, [apiUrl]);

  const handleDatabaseChange = (db: string) => {
    setSelectedDb(db);
    setSelectedTable(""); // Reset table selection
    setAvailableTables([]);
    onSelectionChange?.(db, null);
    loadTables(db);
  };

  const handleTableChange = (table: string) => {
    setSelectedTable(table);
    onSelectionChange?.(selectedDb, table);
    
    // Load schema and generate query
    const loadSchemaAndGenerateQuery = async () => {
      // Load the schema first
      if (!apiUrl || !selectedDb || !table) return;
      
      try {
        const response = await fetch(`${apiUrl}?db=${encodeURIComponent(selectedDb)}&format=ndjson`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: `DESCRIBE SELECT * FROM ${table} LIMIT 1` })
        });
        
        if (response.ok) {
          const textData = await response.text();
          const lines = textData.split('\n').filter(line => line.trim());
          const columns: string[] = [];
          const timeColumns: string[] = [];
          
          for (const line of lines) {
            try {
              const colObj = JSON.parse(line);
              const columnName = colObj.Field || colObj.column_name || colObj.name || Object.values(colObj)[0];
              const dataType = colObj.Type || colObj.data_type || colObj.type || Object.values(colObj)[1] || 'unknown';
              
              if (columnName) {
                columns.push(columnName as string);
                
                // Check if it's a time column
                const lowerDataType = (dataType as string).toLowerCase();
                const lowerColName = (columnName as string).toLowerCase();
                
                if (lowerDataType.includes('time') ||
                    lowerDataType.includes('date') ||
                    lowerColName.includes('time') ||
                    lowerColName.includes('date') ||
                    lowerColName.includes('created') ||
                    lowerColName.includes('updated')) {
                  timeColumns.push(columnName as string);
                }
              }
            } catch (e) {
              console.warn('Failed to parse column line:', line);
            }
          }
          
          // Update state and notify
          onSchemaLoad?.(columns, timeColumns);
          
          // Generate query using the detected time columns
          if (onQueryUpdate) {
            const timeCol = timeColumns.length > 0 ? timeColumns[0] : 'timestamp';
            const basicQuery = `SELECT * FROM ${table} WHERE $__timeFilter ORDER BY ${timeCol} DESC LIMIT 1000`;
            console.log(`Generated query for table ${table} with time column ${timeCol}:`, basicQuery);
            onQueryUpdate(basicQuery);
          }
        }
      } catch (error) {
        console.error('Failed to load table schema:', error);
      }
    };
    
    loadSchemaAndGenerateQuery();
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
            {availableDatabases.map((db) => (
              <SelectItem key={db} value={db}>
                {db}
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
                <SelectItem key={table} value={table}>
                  {table}
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
