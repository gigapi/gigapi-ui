import type { ValidationError } from "@/types/utils.types";
import { parseRelativeTime } from "./time-parsing";

/**
 * Validate time inputs for user interfaces
 */
export function validateTimeInputs(
  fromInput: string,
  toInput: string
): boolean {
  if (
    !fromInput ||
    !toInput ||
    typeof fromInput !== "string" ||
    typeof toInput !== "string"
  ) {
    return false;
  }

  try {
    const fromDate =
      fromInput === "now"
        ? new Date()
        : parseRelativeTime(fromInput) || new Date(fromInput);

    const toDate =
      toInput === "now"
        ? new Date()
        : parseRelativeTime(toInput) || new Date(toInput);

    if (
      !fromDate ||
      !toDate ||
      isNaN(fromDate.getTime()) ||
      isNaN(toDate.getTime())
    ) {
      return false;
    }

    return fromDate.getTime() < toDate.getTime();
  } catch (error) {
    console.error("Error validating time inputs:", error);
    return false;
  }
}

/**
 * Validate input with comprehensive options
 */
export function validateInput(
  value: string,
  options: {
    required?: boolean;
    minLength?: number;
    maxLength?: number;
    pattern?: RegExp;
    allowEmpty?: boolean;
  } = {},
  fieldName = "Field"
): ValidationError | null {
  if (options.required && (!value || value.trim().length === 0)) {
    return {
      field: fieldName,
      message: `${fieldName} is required`,
      value: value
    };
  }

  if (!options.allowEmpty && value && value.trim().length === 0) {
    return {
      field: fieldName,
      message: `${fieldName} cannot be empty`,
      value: value
    };
  }

  if (value && options.minLength && value.length < options.minLength) {
    return {
      field: fieldName,
      message: `${fieldName} must be at least ${options.minLength} characters`,
      value: value
    };
  }

  if (value && options.maxLength && value.length > options.maxLength) {
    return {
      field: fieldName,
      message: `${fieldName} cannot exceed ${options.maxLength} characters`,
      value: value
    };
  }

  if (value && options.pattern && !options.pattern.test(value)) {
    return {
      field: fieldName,
      message: `${fieldName} format is invalid`,
      value: value
    };
  }

  return null;
}
