import {
  Clock,
  Hash,
  Type,
  BarChart3,
  Timer,
  CheckCircle2,
} from "lucide-react";
import { type FieldType } from "./schema-analyzer";

// Helper function to get smart field label
export const getSmartFieldLabel = (
  panelType: string,
  isXField: boolean
): string => {
  // For X field
  if (isXField) {
    if (
      panelType === "timeseries" ||
      panelType === "line" ||
      panelType === "area"
    ) {
      return "Time Field";
    }
    if (panelType === "bar" || panelType === "scatter") {
      return "X Axis (Category)";
    }
    return "X Field";
  }

  if (panelType === "pie" || panelType === "donut") {
    return "Category Field";
  }
  return "Value Field";
};

// Helper function to determine which field types are appropriate for each chart type
export const getAppropriateFields = (
  panelType: string,
  isXField: boolean,
  fieldTypes: Record<string, FieldType>
): string[] => {
  const allFields = Object.keys(fieldTypes);

  if (isXField) {
    // X field requirements by chart type
    switch (panelType) {
      case "timeseries":
      case "line":
      case "area":
        // Prefer time fields for time series
        return allFields
          .filter((field) => {
            const type = fieldTypes[field];
            return (
              type.format?.includes("Time") ||
              type.type === "DATETIME" ||
              field.toLowerCase().includes("time") ||
              field.toLowerCase().includes("date")
            );
          })
          .concat(
            allFields.filter((field) => {
              const type = fieldTypes[field];
              return !(
                type.format?.includes("Time") ||
                type.type === "DATETIME" ||
                field.toLowerCase().includes("time") ||
                field.toLowerCase().includes("date")
              );
            })
          );

      case "bar":
      case "scatter":
      case "pie":
      case "donut":
        // Prefer categorical fields
        return allFields
          .filter((field) => {
            const type = fieldTypes[field];
            return type.type === "VARCHAR" || type.type === "STRING";
          })
          .concat(
            allFields.filter((field) => {
              const type = fieldTypes[field];
              return !(type.type === "VARCHAR" || type.type === "STRING");
            })
          );

      default:
        return allFields;
    }
  } else {
    // Y field requirements
    switch (panelType) {
      case "pie":
      case "donut":
        // For pie charts, value field should be numeric
        return allFields.filter((field) => {
          const type = fieldTypes[field];
          return (
            type.type === "DOUBLE" ||
            type.type === "FLOAT" ||
            type.type === "INTEGER" ||
            type.type === "BIGINT"
          );
        });

      default:
        // For most charts, prefer numeric fields for Y
        return allFields
          .filter((field) => {
            const type = fieldTypes[field];
            return (
              type.type === "DOUBLE" ||
              type.type === "FLOAT" ||
              type.type === "INTEGER" ||
              type.type === "BIGINT"
            );
          })
          .concat(
            allFields.filter((field) => {
              const type = fieldTypes[field];
              return !(
                type.type === "DOUBLE" ||
                type.type === "FLOAT" ||
                type.type === "INTEGER" ||
                type.type === "BIGINT"
              );
            })
          );
    }
  }
};

// Helper function to get field type icon component
export const getFieldTypeIcon = (fieldType?: FieldType) => {
  if (!fieldType) return Type;

  if (fieldType.format?.includes("Time")) {
    return Clock;
  }

  switch (fieldType.type) {
    case "DOUBLE":
    case "FLOAT":
      return BarChart3;
    case "INTEGER":
    case "BIGINT":
      return fieldType.format?.includes("Time") ? Timer : Hash;
    case "VARCHAR":
    case "STRING":
      return Type;
    case "BOOLEAN":
      return CheckCircle2;
    case "DATETIME":
    case "TIMESTAMP":
      return Clock;
    default:
      return Type;
  }
};
