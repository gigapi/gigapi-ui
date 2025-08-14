/**
 * JSON Sanitization Utility
 * Handles control characters and malformed JSON strings from AI responses
 */

/**
 * Sanitizes a JSON string by removing control characters and fixing common issues
 */
export function sanitizeJsonString(jsonString: string): string {
  // Remove any BOM characters
  let sanitized = jsonString.replace(/^\uFEFF/, '');
  
  // First, handle newlines within JSON string values
  // This regex finds strings and escapes newlines within them
  sanitized = sanitized.replace(/"([^"\\]*(\\.[^"\\]*)*)"/g, (match) => {
    // Escape unescaped newlines within the string
    return match.replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t');
  });
  
  // Replace problematic control characters with spaces
  // Keep \n, \r, \t but remove other control characters
  sanitized = sanitized.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, ' ');
  
  // Fix common JSON issues
  // Remove trailing commas before closing brackets/braces
  sanitized = sanitized.replace(/,(\s*[}\]])/g, '$1');
  
  // Trim whitespace
  sanitized = sanitized.trim();
  
  return sanitized;
}

/**
 * Attempts to parse JSON with fallback sanitization
 */
export function safeJsonParse<T = any>(jsonString: string): T | null {
  if (!jsonString || typeof jsonString !== 'string') {
    return null;
  }
  
  // First attempt: direct parse
  try {
    return JSON.parse(jsonString);
  } catch (firstError) {
    // Second attempt: sanitize and parse
    try {
      const sanitized = sanitizeJsonString(jsonString);
      return JSON.parse(sanitized);
    } catch (secondError) {
      try {
        let aggressive = jsonString;
        
        // Find and fix multi-line strings (common in SQL)
        // This matches strings that might contain unescaped newlines
        aggressive = aggressive.replace(/"([^"]*)"/g, (content) => {
          // Escape newlines, tabs, and carriage returns
          const escaped = content
            .replace(/\\/g, '\\\\')  // Escape backslashes first
            .replace(/\n/g, '\\n')    // Then escape newlines
            .replace(/\r/g, '\\r')    // Escape carriage returns
            .replace(/\t/g, '\\t')    // Escape tabs
            .replace(/"/g, '\\"');    // Escape any quotes inside
          return `"${escaped}"`;
        });
        
        // Remove trailing commas
        aggressive = aggressive.replace(/,(\s*[}\]])/g, '$1');
        
        return JSON.parse(aggressive);
      } catch (thirdError) {
        // Fourth attempt: try to extract just the content we need
        try {
          // Look for common patterns in our artifacts
          const queryMatch = jsonString.match(/"query"\s*:\s*"([^"]*)"/);
          const titleMatch = jsonString.match(/"title"\s*:\s*"([^"]*)"/);
          const databaseMatch = jsonString.match(/"database"\s*:\s*"([^"]*)"/);
          const typeMatch = jsonString.match(/"type"\s*:\s*"([^"]*)"/);
          
          if (queryMatch || titleMatch) {
            // Reconstruct a minimal valid JSON
            const reconstructed = {
              title: titleMatch ? titleMatch[1] : 'Query',
              query: queryMatch ? queryMatch[1].replace(/\\n/g, '\n') : '',
              database: databaseMatch ? databaseMatch[1] : 'default',
              type: typeMatch ? typeMatch[1] : undefined
            };
            return reconstructed as T;
          }
        } catch (extractError) {
          // Extraction failed
        }
        
        console.error('Failed to parse JSON after all attempts:', {
          original: jsonString.substring(0, 200),
          firstError: firstError instanceof Error ? firstError.message : firstError,
          secondError: secondError instanceof Error ? secondError.message : secondError,
          thirdError: thirdError instanceof Error ? thirdError.message : thirdError
        });
        return null;
      }
    }
  }
}

/**
 * Validates that an artifact has required properties
 */
export function validateArtifactStructure(artifact: any): boolean {
  if (!artifact || typeof artifact !== 'object') {
    return false;
  }
  
  // Check for required base properties based on artifact type
  if (artifact.type === 'query' || artifact.type === 'chart' || artifact.type === 'table') {
    return Boolean(artifact.query);
  }
  
  if (artifact.type === 'proposal' || artifact.type === 'chart_proposal' || artifact.type === 'query_proposal') {
    // Proposals might have different structure
    return Boolean(artifact.query || artifact.description);
  }
  
  // For other types, just check if it has some content
  return Boolean(artifact.title || artifact.content || artifact.data);
}

/**
 * Ensures artifact has proper structure with defaults
 */
export function normalizeArtifact(artifact: any): any {
  if (!artifact) return null;
  
  const normalized = { ...artifact };
  
  // Ensure database field exists
  if (!normalized.database) {
    normalized.database = 'default';
  }
  
  // Ensure title exists
  if (!normalized.title) {
    normalized.title = normalized.type ? `${normalized.type} artifact` : 'Untitled';
  }
  
  // For chart artifacts, ensure fieldMapping exists
  if ((artifact.type === 'chart' || artifact.chart_type) && !artifact.fieldMapping) {
    // Try to create fieldMapping from x_axis/y_axes if they exist
    if (artifact.x_axis || artifact.y_axes) {
      normalized.fieldMapping = {
        xField: artifact.x_axis || artifact.xField,
        yField: artifact.y_axes || artifact.yField
      };
    }
  }
  
  return normalized;
}