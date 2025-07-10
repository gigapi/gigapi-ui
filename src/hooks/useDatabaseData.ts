import { useState, useEffect } from "react";
import { useAtomValue } from "jotai";
import { apiUrlAtom, isConnectedAtom } from "@/atoms/connection-atoms";
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
  
  const [databases, setDatabases] = useState<string[]>([]);
  const [tables, setTables] = useState<string[]>([]);
  const [schema, setSchema] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch databases
  useEffect(() => {
    if (!fetchDatabases || !isConnected || !apiUrl) return;
    
    const fetchDatabaseList = async () => {
      try {
        setLoading(true);
        setError(null);
        
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
  }, [fetchDatabases, isConnected, apiUrl]);

  // Fetch tables
  useEffect(() => {
    if (!fetchTables || !database || !isConnected || !apiUrl) return;
    
    const fetchTableList = async () => {
      try {
        setLoading(true);
        setError(null);
        
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
  }, [fetchTables, database, isConnected, apiUrl]);

  // Fetch schema
  useEffect(() => {
    if (!fetchSchema || !database || !table || !isConnected || !apiUrl) return;
    
    const fetchTableSchema = async () => {
      try {
        setLoading(true);
        setError(null);
        
        const response = await axios.post(
          `${apiUrl}?db=${database}&format=json`,
          { query: `DESCRIBE ${table}` }
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
  }, [fetchSchema, database, table, isConnected, apiUrl]);

  return {
    databases,
    tables,
    schema,
    loading,
    error,
  };
}