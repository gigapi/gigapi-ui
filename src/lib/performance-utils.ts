/**
 * Performance metrics utilities for query execution
 */

export interface PerformanceMetrics {
  totalTime: number;
  serverTime: number;
  networkTime: number;
  clientTime: number;
}

/**
 * Calculate performance metrics from execution data
 */
export function calculatePerformanceMetrics(
  executionTime: number,
  serverMetrics?: { queryTime?: number },
  clientRenderTime?: number
): PerformanceMetrics {
  const totalTime = executionTime;
  
  if (serverMetrics?.queryTime) {
    // Use actual server metrics when available
    const serverTime = serverMetrics.queryTime;
    const remainingTime = Math.max(0, totalTime - serverTime);
    
    return {
      totalTime,
      serverTime,
      networkTime: remainingTime * 0.7, // Estimate network as 70% of remaining
      clientTime: clientRenderTime || remainingTime * 0.3, // Use actual or estimate
    };
  }
  
  // Fallback to estimates based on typical ratios
  return {
    totalTime,
    serverTime: totalTime * 0.6, // Estimated server processing
    networkTime: totalTime * 0.3, // Estimated network time  
    clientTime: clientRenderTime || totalTime * 0.1, // Actual or estimated client time
  };
}

/**
 * Format execution time for display
 */
export function formatExecutionTime(timeMs: number | null): string {
  if (timeMs === null || timeMs === undefined || isNaN(timeMs)) {
    return "—";
  }

  // Format as milliseconds if less than 1 second
  if (timeMs < 1000) {
    return `${timeMs.toFixed(1)}ms`;
  }

  // Format as seconds if less than 60 seconds
  if (timeMs < 60000) {
    return `${(timeMs / 1000).toFixed(1)}s`;
  }

  // Format as minutes:seconds for longer durations
  const minutes = Math.floor(timeMs / 60000);
  const seconds = ((timeMs % 60000) / 1000).toFixed(1);
  return `${minutes}m ${seconds}s`;
}

/**
 * Extract server metrics from raw response data
 */
export function extractServerMetrics(rawJson: any): { queryTime?: number } | null {
  if (!rawJson) return null;
  
  // Check various possible locations for server metrics
  if (rawJson._metric_gigapi_ui?.queryTime) {
    return { queryTime: rawJson._metric_gigapi_ui.queryTime };
  }
  
  if (rawJson._metric?.queryTime) {
    return { queryTime: rawJson._metric.queryTime };
  }
  
  if (rawJson.queryTime) {
    return { queryTime: rawJson.queryTime };
  }
  
  return null;
}

/**
 * Extract transformed query from response data
 */
export function extractTransformedQuery(rawJson: any): string | null {
  if (!rawJson) return null;
  
  try {
    if (typeof rawJson === "object") {
      if (rawJson._processed_query) {
        return rawJson._processed_query;
      }
      if (rawJson.query) {
        return rawJson.query;
      }
    } else if (typeof rawJson === "string") {
      // For NDJSON, try to extract from metadata
      const lines = rawJson.split("\n");
      const lastLine = lines[lines.length - 1];
      if (lastLine?.includes("_processed_query")) {
        const metadataObj = JSON.parse(lastLine);
        if (metadataObj._processed_query) {
          return metadataObj._processed_query;
        }
      }
    }
  } catch (e) {
    console.warn("Error extracting transformed query:", e);
  }
  
  return null;
}

/**
 * Calculate response size estimate
 */
export function calculateResponseSize(rawJson: any, results: any[]): number {
  if (!rawJson && !results) return 0;
  
  try {
    let sizeEstimate = 0;
    
    if (typeof rawJson === "string") {
      sizeEstimate = new Blob([rawJson]).size;
    } else if (rawJson) {
      sizeEstimate = new Blob([JSON.stringify(rawJson)]).size;
    } else if (results) {
      sizeEstimate = new Blob([JSON.stringify(results)]).size;
    }
    
    return sizeEstimate;
  } catch {
    return 0;
  }
}