import type { TimeRange } from "@/types/utils.types";
import { checkForTimeVariables } from "./query-processing";

/**
 * Validate that time variables can be processed in a query context
 */
export function validateTimeVariableContext(
  query: string,
  selectedTimeField: string | undefined,
  timeRange: TimeRange
): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];
  const hasTimeVars = checkForTimeVariables(query);

  if (!hasTimeVars) {
    return { isValid: true, errors: [] };
  }

  if (!selectedTimeField) {
    errors.push("Query contains time variables but no time field is selected");
  }

  if (!timeRange.enabled) {
    errors.push("Query contains time variables but time range is disabled");
  }

  if (!timeRange.from || !timeRange.to) {
    errors.push("Query contains time variables but time range is incomplete");
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}
