/**
 * Unified NDJSON Parser
 * Consolidates all NDJSON parsing functionality with consistent error handling
 */

export interface NDJSONParseResult<T = any> {
  records: T[];
  errors: string[];
  metadata: {
    totalLines: number;
    validLines: number;
    errorLines: number;
  };
}

/**
 * Parse NDJSON (Newline Delimited JSON) data
 * Handles malformed lines gracefully and provides detailed error reporting
 */
export function parseNDJSON<T = any>(rawData: string): NDJSONParseResult<T> {
  const records: T[] = [];
  const errors: string[] = [];
  
  if (!rawData || typeof rawData !== 'string') {
    return {
      records,
      errors: ['Invalid NDJSON input: data must be a non-empty string'],
      metadata: {
        totalLines: 0,
        validLines: 0,
        errorLines: 0
      }
    };
  }
  
  const lines = rawData.trim().split('\n');
  let validLines = 0;
  let errorLines = 0;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue; // Skip empty lines
    
    try {
      const parsed = JSON.parse(line);
      records.push(parsed);
      validLines++;
    } catch (error) {
      errorLines++;
      const errorMessage = error instanceof Error ? error.message : 'Unknown parsing error';
      errors.push(`Line ${i + 1}: ${errorMessage}`);
      
      // If too many errors, bail out early to prevent memory issues
      if (errors.length > 100) {
        errors.push(`... and ${lines.length - i - 1} more lines with potential errors (stopped parsing)`);
        break;
      }
    }
  }
  
  return {
    records,
    errors,
    metadata: {
      totalLines: lines.length,
      validLines,
      errorLines
    }
  };
}

/**
 * Stringify objects to NDJSON format
 */
export function stringifyNDJSON<T = any>(records: T[]): string {
  return records.map(record => JSON.stringify(record)).join('\n');
}

/**
 * Validate NDJSON format without full parsing
 * Useful for quick validation of large files
 */
export function validateNDJSON(rawData: string, maxLinesToCheck: number = 100): {
  isValid: boolean;
  errors: string[];
  sampleErrors: string[];
} {
  const errors: string[] = [];
  const sampleErrors: string[] = [];
  
  if (!rawData || typeof rawData !== 'string') {
    return {
      isValid: false,
      errors: ['Invalid input: data must be a non-empty string'],
      sampleErrors: []
    };
  }
  
  const lines = rawData.trim().split('\n').slice(0, maxLinesToCheck);
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    
    try {
      JSON.parse(line);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown parsing error';
      const fullError = `Line ${i + 1}: ${errorMessage}`;
      errors.push(fullError);
      
      if (sampleErrors.length < 5) {
        sampleErrors.push(fullError);
      }
    }
  }
  
  return {
    isValid: errors.length === 0,
    errors,
    sampleErrors
  };
}

/**
 * Parse NDJSON with streaming support for large files
 * Processes data in chunks to avoid memory issues
 */
export function parseNDJSONStream<T = any>(
  rawData: string,
  options: {
    chunkSize?: number;
    onChunk?: (chunk: T[], chunkIndex: number) => void;
    onError?: (error: string, lineNumber: number) => void;
  } = {}
): NDJSONParseResult<T> {
  const { chunkSize = 1000, onChunk, onError } = options;
  
  const allRecords: T[] = [];
  const errors: string[] = [];
  
  if (!rawData || typeof rawData !== 'string') {
    return {
      records: allRecords,
      errors: ['Invalid NDJSON input: data must be a non-empty string'],
      metadata: {
        totalLines: 0,
        validLines: 0,
        errorLines: 0
      }
    };
  }
  
  const lines = rawData.trim().split('\n');
  let validLines = 0;
  let errorLines = 0;
  let chunkIndex = 0;
  
  for (let i = 0; i < lines.length; i += chunkSize) {
    const chunk: T[] = [];
    const endIndex = Math.min(i + chunkSize, lines.length);
    
    for (let j = i; j < endIndex; j++) {
      const line = lines[j].trim();
      if (!line) continue;
      
      try {
        const parsed = JSON.parse(line);
        chunk.push(parsed);
        allRecords.push(parsed);
        validLines++;
      } catch (error) {
        errorLines++;
        const errorMessage = error instanceof Error ? error.message : 'Unknown parsing error';
        const fullError = `Line ${j + 1}: ${errorMessage}`;
        errors.push(fullError);
        
        if (onError) {
          onError(fullError, j + 1);
        }
      }
    }
    
    if (onChunk && chunk.length > 0) {
      onChunk(chunk, chunkIndex++);
    }
  }
  
  return {
    records: allRecords,
    errors,
    metadata: {
      totalLines: lines.length,
      validLines,
      errorLines
    }
  };
}

/**
 * Convert various data formats to NDJSON
 */
export function convertToNDJSON<T = any>(data: T[] | string): string {
  if (typeof data === 'string') {
    // Assume it's already NDJSON or JSON
    try {
      const parsed = JSON.parse(data);
      if (Array.isArray(parsed)) {
        return stringifyNDJSON(parsed);
      }
      // Single object, convert to single-line NDJSON
      return JSON.stringify(parsed);
    } catch {
      // Assume it's already NDJSON
      return data;
    }
  }
  
  if (Array.isArray(data)) {
    return stringifyNDJSON(data);
  }
  
  throw new Error('Data must be an array or a JSON/NDJSON string');
}

// Export the main parser as default
export default parseNDJSON;