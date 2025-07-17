import { useState, useEffect } from "react";
import { useAtomValue } from "jotai";
import { apiUrlAtom, isConnectedAtom, availableDatabasesAtom } from "@/atoms/connection-atoms";
import { 
  getCachedTablesAtom, 
  getCachedSchemaAtom,
  schemaCacheAtom 
} from "@/atoms/database-atoms";
import axios from "axios";

interface UseDatabaseDataOptions {
  fetchDatabases?: boolean;
  fetchTables?: boolean;
  fetchSchema?: boolean;
  database?: string;
  table?: string;
}

export function useDatabaseData({
  fetchDatabases = true,
  fetchTables = false,
  fetchSchema = false,
  database,
  table,
}: UseDatabaseDataOptions = {}) {
  const apiUrl = useAtomValue(apiUrlAtom);
  const isConnected = useAtomValue(isConnectedAtom);
  
  // Cache-related atoms
  const availableDatabases = useAtomValue(availableDatabasesAtom);
  const getCachedTables = useAtomValue(getCachedTablesAtom);
  const getCachedSchema = useAtomValue(getCachedSchemaAtom);
  const schemaCache = useAtomValue(schemaCacheAtom);
  
  const [databases, setDatabases] = useState<string[]>([]);
  const [tables, setTables] = useState<string[]>([]);
  const [schema, setSchema] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch databases
  useEffect(() => {
    if (!fetchDatabases || !isConnected) return;
    
    const fetchDatabaseList = async () => {
      try {
        setLoading(true);
        setError(null);
        
        // First check if we have databases from connection state
        if (availableDatabases && availableDatabases.length > 0) {
          setDatabases(availableDatabases);
          setLoading(false);
          return;
        }
        
        // Otherwise fallback to API call
        const response = await axios.post(
          `${apiUrl}?format=json`,
          { query: "SHOW DATABASES" }
        );
        
        const dbs = response.data.results
          ?.map((item: any) => item.database_name || item.Database || item.name)
          .filter(Boolean) || [];
          
        setDatabases(dbs);
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : "Failed to fetch databases";
        setError(errorMsg);
        console.error("[useDatabaseData] Error fetching databases:", err);
      } finally {
        setLoading(false);
      }
    };
    
    fetchDatabaseList();
  }, [fetchDatabases, isConnected, apiUrl, availableDatabases]);

  // Fetch tables
  useEffect(() => {
    if (!fetchTables || !database || !isConnected) return;
    
    const fetchTableList = async () => {
      try {
        setLoading(true);
        setError(null);
        
        // First check cache
        const cachedTables = getCachedTables(database);
        if (cachedTables && cachedTables.length > 0) {
          setTables(cachedTables);
          setLoading(false);
          return;
        }
        
        // Fallback to API if cache miss
        const response = await axios.post(
          `${apiUrl}?db=${database}&format=json`,
          { query: "SHOW TABLES" }
        );
        
        const tbls = response.data.results
          ?.map((item: any) => item.table_name || item.Table || item.name)
          .filter(Boolean) || [];
          
        setTables(tbls);
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : "Failed to fetch tables";
        setError(errorMsg);
        console.error("[useDatabaseData] Error fetching tables:", err);
      } finally {
        setLoading(false);
      }
    };
    
    fetchTableList();
  }, [fetchTables, database, isConnected, apiUrl, getCachedTables, schemaCache]);

  // Fetch schema
  useEffect(() => {
    if (!fetchSchema || !database || !table || !isConnected) return;
    
    const fetchTableSchema = async () => {
      try {
        setLoading(true);
        setError(null);
        
        // First check cache
        const cachedSchema = getCachedSchema(database, table);
        if (cachedSchema && cachedSchema.length > 0) {
          setSchema(cachedSchema);
          setLoading(false);
          return;
        }
        
        // Fallback to API if cache miss
        const response = await axios.post(
          `${apiUrl}?db=${database}&format=json`,
          { query: `DESCRIBE SELECT * FROM ${table} LIMIT 1` }
        );
        
        setSchema(response.data.results || []);
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : "Failed to fetch schema";
        setError(errorMsg);
        console.error("[useDatabaseData] Error fetching schema:", err);
      } finally {
        setLoading(false);
      }
    };
    
    fetchTableSchema();
  }, [fetchSchema, database, table, isConnected, apiUrl, getCachedSchema, schemaCache]);

  return {
    databases,
    tables,
    schema,
    loading,
    error,
  };
}