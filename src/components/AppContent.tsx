import { useEffect } from "react";
import { useQuery } from "../contexts/QueryContext";

// This component is responsible for loading database information 
// when the application first loads
export default function AppContent() {
  const { loadDatabases } = useQuery();

  // Load databases on initial mount
  useEffect(() => {
    loadDatabases().catch(console.error);
  }, [loadDatabases]);

  return null; // This component doesn't render anything, it just handles side effects
} 