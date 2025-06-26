import { useState, useCallback, useEffect, useMemo} from "react";
import { useConnection } from "@/contexts/ConnectionContext";
import { detectTimeColumns, generateTimeFilteredQuery, parseNDJSON } from "@/lib/dashboard/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";

interface ColumnInfo {
  name: string;
  dataType: string;
  isTimeColumn: boolean;
  timeUnit?: 'ns' | 'us' | 'ms' | 's';
}

interface DatabaseTableSelectorProps {
  onSchemaLoad?: (columns: ColumnInfo[], timeColumns: string[]) => void;
  onSelectionChange?: (database: string, table: string | null) => void;
  onQueryUpdate?: (query: string) => void;
  className?: string;
  initialDatabase?: string;
  initialTable?: string;
}

export function DatabaseTableSelector({
  onSchemaLoad,
  onSelectionChange,
  onQueryUpdate,
  className,
  initialDatabase = "",
  initialTable = "",
}: DatabaseTableSelectorProps) {
  const { databases, apiUrl } = useConnection();
  const [selectedDb, setSelectedDb] = useState<string>(initialDatabase);
  const [selectedTable, setSelectedTable] = useState<string>(initialTable);
  const [availableTables, setAvailableTables] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  // Get database names - memoized to prevent infinite re-renders
  const availableDatabases = useMemo(() => 
    databases.map(db => db.database_name), 
    [databases]
  );

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
        
        // Use shared NDJSON parsing utility
        const { records, errors } = parseNDJSON(textData);
        if (errors.length > 0) {
          console.warn('Table parsing errors:', errors);
        }
        
        const tables: string[] = [];
        for (const tableObj of records) {
          const tableName = tableObj.table_name || tableObj.Table || Object.values(tableObj)[0];
          if (tableName) tables.push(tableName as string);
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

  // Load tables on initial load if we have an initial database - LIMITED TO RUN ONLY ONCE
  useEffect(() => {
    if (initialDatabase && availableDatabases.length > 0 && availableDatabases.includes(initialDatabase)) {
      loadTables(initialDatabase).then(() => {
        // If we also have an initial table, trigger the schema loading
        if (initialTable) {
          setTimeout(() => {
            handleTableChange(initialTable);
          }, 100);
        }
      });
    }
  }, [initialDatabase]); // ONLY depend on initialDatabase to prevent infinite loop

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
          
          // Use shared NDJSON parsing utility
          const { records, errors } = parseNDJSON(textData);
          if (errors.length > 0) {
            console.warn('Schema parsing errors:', errors);
          }
          
          const columns: ColumnInfo[] = [];
          
          for (const colObj of records) {
            const columnName = colObj.Field || colObj.column_name || colObj.name || Object.values(colObj)[0];
            const dataType = colObj.Type || colObj.data_type || colObj.type || Object.values(colObj)[1] || 'unknown';
            
            if (columnName) {
              columns.push({
                name: columnName as string,
                dataType: dataType as string,
                isTimeColumn: false // Will be set below
              });
            }
          }
          
          // Use shared time column detection utility for consistency
          const columnNames = columns.map(col => col.name);
          const detectedTimeColumns = detectTimeColumns(columnNames);
          
          // Mark time columns and detect time units
          columns.forEach(col => {
            col.isTimeColumn = detectedTimeColumns.includes(col.name);
            
            // Detect time unit from column name and data type
            if (col.isTimeColumn) {
              const lowerName = col.name.toLowerCase();
              const lowerDataType = col.dataType.toLowerCase();
              
              // Detect from column name patterns
              if (lowerName.includes('_ns') || lowerName.endsWith('_ns') || lowerName.includes('nano')) {
                col.timeUnit = 'ns';
              } else if (lowerName.includes('_us') || lowerName.endsWith('_us') || lowerName.includes('micro')) {
                col.timeUnit = 'us';
              } else if (lowerName.includes('_ms') || lowerName.endsWith('_ms') || lowerName.includes('milli')) {
                col.timeUnit = 'ms';
              } else if (lowerName.includes('_s') || lowerName.endsWith('_s') || (lowerName.includes('epoch') && !lowerName.includes('ms'))) {
                col.timeUnit = 's';
              }
              // Detect from data type patterns  
              else if (lowerDataType.includes('bigint') || lowerDataType.includes('int8') || lowerDataType.includes('long')) {
                // BigInt columns are typically nanoseconds in time-series DBs
                col.timeUnit = col.name === '__timestamp' ? 'ns' : 'ms';
              } else if (lowerDataType.includes('timestamp') || lowerDataType.includes('datetime')) {
                col.timeUnit = 'ms';
              } else {
                // Default based on common patterns
                col.timeUnit = col.name === '__timestamp' ? 'ns' : 'ms';
              }
            }
          });
          
          // Update state and notify
          onSchemaLoad?.(columns, detectedTimeColumns);
          
          // Generate query using the detected time columns and shared utility
          if (onQueryUpdate) {
            // Prioritize __timestamp if it exists, otherwise use first detected time column
            const prioritizedTimeCol = detectedTimeColumns.find(col => col === '__timestamp') || 
                                     detectedTimeColumns[0] || 
                                     'timestamp';
            
            const basicQuery = generateTimeFilteredQuery(table, prioritizedTimeCol);
            console.log(`Generated query for table ${table} with time column ${prioritizedTimeCol}:`, basicQuery);
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
