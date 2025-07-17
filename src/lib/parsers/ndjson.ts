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
function parseNDJSON<T = any>(rawData: string): NDJSONParseResult<T> {
  const records: T[] = [];
  const errors: string[] = [];

  if (typeof rawData !== "string") {
    return {
      records,
      errors: ["Invalid NDJSON input: data must be a string"],
      metadata: {
        totalLines: 0,
        validLines: 0,
        errorLines: 0,
      },
    };
  }

  // Handle empty responses gracefully - return empty records, not an error
  if (!rawData || rawData.trim() === "") {
    return {
      records,
      errors: [],
      metadata: {
        totalLines: 0,
        validLines: 0,
        errorLines: 0,
      },
    };
  }

  const lines = rawData.trim().split("\n");
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
      const errorMessage =
        error instanceof Error ? error.message : "Unknown parsing error";
      errors.push(`Line ${i + 1}: ${errorMessage}`);

      // If too many errors, bail out early to prevent memory issues
      if (errors.length > 100) {
        errors.push(
          `... and ${
            lines.length - i - 1
          } more lines with potential errors (stopped parsing)`
        );
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
      errorLines,
    },
  };
}

// Export the main parser as default
export default parseNDJSON;
