import { type NDJSONRecord } from "@/types/dashboard.types";


export type FieldType = {
  type: string;
  format?: string;
  precision?: number;
  scale?: number;
  nullable?: boolean;
  cardinality?: "low" | "medium" | "high" | "unique";
  distribution?: "uniform" | "normal" | "skewed" | "bimodal";
  semantic?:
    | "id"
    | "measurement"
    | "dimension"
    | "metric"
    | "timestamp"
    | "category"
    | "ordinal";
  semanticType?:
    | "id"
    | "measurement"
    | "dimension"
    | "metric"
    | "timestamp"
    | "category"
    | "ordinal";
  patterns?: string[];
  range?: { min: any; max: any };
  suggestions?: {
    visualizations: string[];
    aggregations: string[];
    roles: string[];
  };
};

interface FieldStats {
  count: number;
  nullCount: number;
  uniqueCount: number;
  cardinality: "low" | "medium" | "high" | "unique";
  min?: any;
  max?: any;
  avg?: number;
  median?: number;
  mode?: any;
  stdDev?: number;
  commonValues?: Array<{ value: any; count: number }>;
  patterns?: Set<string>;
}

export class SchemaAnalyzer {
  private static readonly TIMESTAMP_PATTERNS = [
    "__timestamp",
    "timestamp",
    "ts",
    "time",
    "datetime",
    "date",
    "created_at",
    "updated_at",
    "modified_at",
    "event_time",
    "ingestion_time",
    "processing_time",
    "_time",
  ];

  private static readonly ID_PATTERNS = [
    "id",
    "uuid",
    "guid",
    "key",
    "pk",
    "primary_key",
    "user_id",
    "session_id",
    "transaction_id",
    "request_id",
  ];

  private static readonly METRIC_PATTERNS = [
    "count",
    "sum",
    "total",
    "amount",
    "value",
    "score",
    "rate",
    "percentage",
    "ratio",
    "measure",
    "metric",
    "kpi",
    "revenue",
    "cost",
    "price",
    "quantity",
    "volume",
    "size",
    "weight",
  ];

  private static readonly DIMENSION_PATTERNS = [
    "name",
    "type",
    "category",
    "group",
    "class",
    "status",
    "state",
    "region",
    "country",
    "city",
    "department",
    "team",
  ];
  static analyzeFieldType(
    fieldName: string,
    value: any,
    schemaType?: string
  ): FieldType {
    const fieldLower = fieldName.toLowerCase();

    // Use schema type if available
    if (schemaType) {
      const typeLower = schemaType.toLowerCase();
      if (typeLower.includes("datetime") || typeLower.includes("timestamp")) {
        return { type: "DATETIME", format: "Time" };
      }
      // Handle our timestamp types from schema detection
      if (typeLower === "timestamp_ns") {
        return { type: "BIGINT", format: "Time (ns)" };
      }
      if (typeLower === "timestamp_us") {
        return { type: "BIGINT", format: "Time (μs)" };
      }
      if (typeLower === "timestamp_ms") {
        return { type: "BIGINT", format: "Time (ms)" };
      }
      if (typeLower === "timestamp_s") {
        return { type: "INTEGER", format: "Time (s)" };
      }
      if (typeLower.includes("bigint") || typeLower === "int64" || typeLower === "uint64") {
        // Enhanced BIGINT timestamp detection
        if (
          fieldLower.includes("time") ||
          fieldLower.includes("timestamp") ||
          fieldLower.includes("date") ||
          fieldName === "__timestamp" ||
          fieldLower.endsWith("_at") ||
          fieldLower.endsWith("_ts") ||
          fieldLower.endsWith("_ns") ||
          fieldLower.endsWith("_ms") ||
          fieldLower.endsWith("_us")
        ) {
          // Try to infer time unit from field name
          if (fieldLower.endsWith("_ns") || fieldName === "__timestamp") {
            return { type: "BIGINT", format: "Time (ns)" };
          } else if (fieldLower.endsWith("_us") || fieldLower.endsWith("_μs")) {
            return { type: "BIGINT", format: "Time (μs)" };
          } else if (fieldLower.endsWith("_ms")) {
            return { type: "BIGINT", format: "Time (ms)" };
          } else if (fieldLower.endsWith("_s")) {
            return { type: "BIGINT", format: "Time (s)" };
          }
          // Default to nanoseconds for BIGINT timestamps
          return { type: "BIGINT", format: "Time (ns)" };
        }
        return { type: "BIGINT" };
      }
      if (typeLower.includes("int")) {
        return { type: "INTEGER" };
      }
      if (typeLower.includes("double") || typeLower.includes("float")) {
        return { type: "DOUBLE" };
      }
      if (typeLower.includes("string") || typeLower.includes("varchar")) {
        return { type: "VARCHAR" };
      }
    }

    // Fallback to value-based analysis
    if (
      fieldLower.includes("time") ||
      fieldLower.includes("date") ||
      fieldLower.includes("timestamp") ||
      fieldName === "__timestamp"
    ) {
      if (typeof value === "number") {
        // Better timestamp detection based on value ranges
        if (value > 1e18) {
          return { type: "BIGINT", format: "Time (ns)" };
        } else if (value > 1e15) {
          return { type: "BIGINT", format: "Time (ns)" };
        } else if (value > 1e12) {
          return { type: "BIGINT", format: "Time (μs)" };
        } else if (value > 1e10) {
          return { type: "BIGINT", format: "Time (ms)" };
        } else if (value > 1e9) {
          return { type: "INTEGER", format: "Time (s)" };
        } else {
          return { type: "INTEGER", format: "Time (s)" };
        }
      }
      return { type: "DATETIME", format: "Time" };
    }

    // Special handling for __timestamp field
    if (fieldName === "__timestamp") {
      if (typeof value === "number") {
        // Assume nanoseconds for __timestamp by default
        return { type: "BIGINT", format: "Time (ns)" };
      }
      return { type: "DATETIME", format: "Time" };
    }

    if (typeof value === "number") {
      if (Number.isInteger(value)) {
        return { type: "INTEGER" };
      }
      return { type: "DOUBLE" };
    }

    if (typeof value === "string") {
      if (!isNaN(Number(value))) {
        return { type: "VARCHAR", format: "Numeric String" };
      }
      if (!isNaN(Date.parse(value))) {
        return { type: "VARCHAR", format: "Date String" };
      }
      return { type: "VARCHAR" };
    }

    if (typeof value === "boolean") {
      return { type: "BOOLEAN" };
    }

    return { type: "UNKNOWN" };
  }

  static findTimeField(fields: string[]): string | null {
    // Prioritize __timestamp first
    if (fields.includes("__timestamp")) {
      return "__timestamp";
    }

    const timePatterns = [
      "timestamp",
      "time",
      "date",
      "created_at",
      "updated_at",
    ];

    for (const pattern of timePatterns) {
      const field = fields.find(
        (f) => f.toLowerCase() === pattern.toLowerCase()
      );
      if (field) return field;
    }

    // Look for fields containing time-related words
    for (const field of fields) {
      const lower = field.toLowerCase();
      if (
        lower.includes("time") ||
        lower.includes("date") ||
        lower.includes("timestamp")
      ) {
        return field;
      }
    }

    return null;
  }

  static isTimeField(fieldName: string, value?: any): boolean {
    const fieldLower = fieldName.toLowerCase();

    // Check field name patterns
    if (
      fieldLower.includes("time") ||
      fieldLower.includes("date") ||
      fieldLower.includes("timestamp") ||
      fieldName === "__timestamp"
    ) {
      return true;
    }

    // Check value if provided
    if (value !== undefined) {
      const fieldType = this.analyzeFieldType(fieldName, value);
      return (
        fieldType.format?.includes("Time") || fieldType.type === "DATETIME"
      );
    }

    return false;
  }

  static findNumericFields(record: NDJSONRecord, fields: string[]): string[] {
    return fields.filter((field) => {
      const value = record[field];
      return (
        typeof value === "number" ||
        (typeof value === "string" && !isNaN(Number(value)))
      );
    });
  }

  static findStringFields(record: NDJSONRecord, fields: string[]): string[] {
    return fields.filter((field) => {
      const value = record[field];
      return typeof value === "string" && isNaN(Number(value));
    });
  }

  static getSmartFieldDefaults(
    fields: string[],
    fieldTypes: Record<string, FieldType>,
    schemaFields: { name: string; type: string }[],
    panelType: string = "timeseries"
  ): any {
    const mapping: any = {};

    // Combine schema and runtime field analysis
    const allFieldTypes: Record<string, FieldType> = {
      ...fieldTypes,
    };
    schemaFields.forEach((field) => {
      if (!allFieldTypes[field.name]) {
        allFieldTypes[field.name] = this.analyzeFieldType(
          field.name,
          null,
          field.type
        );
      }
    });

    const allFields = [
      ...new Set([...fields, ...schemaFields.map((f) => f.name)]),
    ];

    // Find time fields (prioritize timestamp fields with Time format)
    const timeFields = allFields.filter((field) => {
      const fieldType = allFieldTypes[field];
      return (
        field === "__timestamp" || // Always include __timestamp
        fieldType?.format?.includes("Time") ||
        fieldType?.type === "DATETIME" ||
        field.toLowerCase().includes("time") ||
        field.toLowerCase().includes("timestamp") ||
        field.toLowerCase().includes("date")
      );
    });

    // Find numeric fields for Y-axis
    const numericFields = allFields.filter((field) => {
      const fieldType = allFieldTypes[field];
      return (
        fieldType?.type === "DOUBLE" ||
        fieldType?.type === "INTEGER" ||
        (fieldType?.type === "BIGINT" && !fieldType?.format?.includes("Time"))
      );
    });

    // Find string/category fields
    const stringFields = allFields.filter((field) => {
      const fieldType = allFieldTypes[field];
      return fieldType?.type === "VARCHAR" || fieldType?.type === "STRING";
    });

    // Panel-specific field selection logic
    switch (panelType) {
      case "timeseries":
        // Time-based panels - prefer time field for X-axis
        if (timeFields.length > 0) {
          const preferredTimeField =
            timeFields.find((field) => field === "__timestamp") ||
            timeFields.find((field) =>
              allFieldTypes[field]?.format?.includes("Time")
            ) ||
            timeFields[0];
          mapping.xField = preferredTimeField;
        } else if (allFields.length > 0) {
          mapping.xField = allFields[0];
        }

        // Numeric field for Y-axis
        if (numericFields.length > 0) {
          const preferredNumField =
            numericFields.find(
              (field) => allFieldTypes[field]?.type === "DOUBLE"
            ) ||
            numericFields.find(
              (field) => allFieldTypes[field]?.type === "INTEGER"
            ) ||
            numericFields[0];
          mapping.yField = preferredNumField;
        }
        break;

      case "pie":
        // Pie charts - category field for grouping, numeric for values
        if (stringFields.length > 0) {
          mapping.xField = stringFields[0]; // Category field
        } else if (allFields.length > 0) {
          mapping.xField = allFields[0];
        }

        if (numericFields.length > 0) {
          mapping.yField = numericFields[0]; // Value field
        }
        break;

      case "stat":
        // Stat panel - just needs a numeric value
        if (numericFields.length > 0) {
          mapping.yField = numericFields[0];
        }
        break;

      default:
        // Default logic for unknown panel types
        if (timeFields.length > 0) {
          const preferredTimeField =
            timeFields.find((field) => field === "__timestamp") ||
            timeFields.find((field) =>
              allFieldTypes[field]?.format?.includes("Time")
            ) ||
            timeFields[0];
          mapping.xField = preferredTimeField;
        } else if (allFields.length > 0) {
          mapping.xField = allFields[0];
        }

        if (numericFields.length > 0) {
          const preferredNumField =
            numericFields.find(
              (field) => allFieldTypes[field]?.type === "DOUBLE"
            ) ||
            numericFields.find(
              (field) => allFieldTypes[field]?.type === "INTEGER"
            ) ||
            numericFields[0];
          mapping.yField = preferredNumField;
        }
        break;
    }

    return mapping;
  }

  /**
   * Analyze a complete dataset to understand field characteristics
   */
  static analyzeDataset(
    data: NDJSONRecord[],
    sampleSize: number = 1000
  ): Record<string, FieldType> {
    if (!data || data.length === 0) return {};

    // Sample data for performance
    const sample = data.slice(0, Math.min(sampleSize, data.length));
    const fields = this.getAllFields(sample);
    const result: Record<string, FieldType> = {};

    for (const field of fields) {
      const stats = this.calculateFieldStats(sample, field);
      result[field] = this.analyzeEnhancedFieldType(field, stats, sample);
    }

    return result;
  }

  /**
   * Get all unique field names from the dataset
   */
  private static getAllFields(data: NDJSONRecord[]): string[] {
    const fields = new Set<string>();
    data.forEach((record) => {
      Object.keys(record).forEach((key) => {
        if (!key.startsWith("_") || key === "__timestamp") {
          fields.add(key);
        }
      });
    });
    return Array.from(fields);
  }

  /**
   * Calculate comprehensive statistics for a field
   */
  private static calculateFieldStats(
    data: NDJSONRecord[],
    field: string
  ): FieldStats {
    const values = data
      .map((record) => record[field])
      .filter((v) => v !== null && v !== undefined);
    const uniqueValues = new Set(values);
    const numericValues = values
      .filter((v) => typeof v === "number")
      .map((v) => v as number);
    const stringValues = values
      .filter((v) => typeof v === "string")
      .map((v) => v as string);

    const stats: FieldStats = {
      count: values.length,
      nullCount: data.length - values.length,
      uniqueCount: uniqueValues.size,
      cardinality: "medium",
      patterns: new Set(),
    };

    // Determine cardinality
    const cardinalityRatio = stats.uniqueCount / stats.count;
    if (cardinalityRatio > 0.95) stats.cardinality = "unique";
    else if (cardinalityRatio < 0.1) stats.cardinality = "low";
    else if (cardinalityRatio > 0.5) stats.cardinality = "high";

    // Numeric statistics
    if (numericValues.length > 0) {
      stats.min = Math.min(...numericValues);
      stats.max = Math.max(...numericValues);
      stats.avg =
        numericValues.reduce((a, b) => a + b, 0) / numericValues.length;

      const sorted = [...numericValues].sort((a, b) => a - b);
      stats.median =
        sorted.length % 2 === 0
          ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
          : sorted[Math.floor(sorted.length / 2)];

      const variance =
        numericValues.reduce(
          (acc, val) => acc + Math.pow(val - stats.avg!, 2),
          0
        ) / numericValues.length;
      stats.stdDev = Math.sqrt(variance);
    }

    // String statistics and patterns
    if (stringValues.length > 0) {
      stats.min = stringValues.reduce((a, b) => (a.length < b.length ? a : b));
      stats.max = stringValues.reduce((a, b) => (a.length > b.length ? a : b));

      // Detect patterns
      stringValues.forEach((str) => {
        if (/^\d{4}-\d{2}-\d{2}/.test(str)) stats.patterns!.add("date");
        if (/^[a-fA-F0-9-]{36}$/.test(str)) stats.patterns!.add("uuid");
        if (/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(str))
          stats.patterns!.add("email");
        if (/^https?:\/\//.test(str)) stats.patterns!.add("url");
        if (/^\d+$/.test(str)) stats.patterns!.add("numeric_string");
        if (/^[A-Z]{2,3}$/.test(str)) stats.patterns!.add("code");
      });
    }

    // Common values
    const valueCounts = new Map();
    values.forEach((value) => {
      const key = String(value);
      valueCounts.set(key, (valueCounts.get(key) || 0) + 1);
    });

    stats.commonValues = Array.from(valueCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([value, count]) => ({ value, count }));

    return stats;
  }

  /**
   * Analyze field type with enhanced metadata
   */
  private static analyzeEnhancedFieldType(
    fieldName: string,
    stats: FieldStats,
    sample: NDJSONRecord[]
  ): FieldType {
    const firstValue = sample.find(
      (r) => r[fieldName] !== null && r[fieldName] !== undefined
    )?.[fieldName];

    // Base type analysis
    let baseType: FieldType = {
      type: "UNKNOWN",
      cardinality: stats.cardinality,
      nullable: stats.nullCount > 0,
      suggestions: {
        visualizations: [],
        aggregations: [],
        roles: [],
      },
    };

    // Timestamp detection
    if (this.isTimestampField(fieldName, firstValue, stats)) {
      baseType = this.analyzeTimestampField(fieldName, firstValue, stats);
    }
    // ID field detection
    else if (this.isIdField(fieldName, stats)) {
      baseType = this.analyzeIdField(fieldName, stats);
    }
    // Metric field detection
    else if (this.isMetricField(fieldName, firstValue, stats)) {
      baseType = this.analyzeMetricField(fieldName, firstValue, stats);
    }
    // Dimension field detection
    else if (this.isDimensionField(fieldName, firstValue, stats)) {
      baseType = this.analyzeDimensionField(fieldName, firstValue, stats);
    }
    // Numeric field
    else if (typeof firstValue === "number") {
      baseType = this.analyzeNumericField(fieldName, firstValue, stats);
    }
    // String field
    else if (typeof firstValue === "string") {
      baseType = this.analyzeStringField(fieldName, firstValue, stats);
    }
    // Boolean field
    else if (typeof firstValue === "boolean") {
      baseType = this.analyzeBooleanField(fieldName, stats);
    }

    // Add range information
    if (stats.min !== undefined && stats.max !== undefined) {
      baseType.range = { min: stats.min, max: stats.max };
    }

    // Add patterns
    if (stats.patterns && stats.patterns.size > 0) {
      baseType.patterns = Array.from(stats.patterns);
    }

    return baseType;
  }

  private static isTimestampField(
    fieldName: string,
    value: any,
    stats: FieldStats
  ): boolean {
    const fieldLower = fieldName.toLowerCase();

    // Check field name patterns
    if (
      this.TIMESTAMP_PATTERNS.some(
        (pattern) => fieldLower === pattern || fieldLower.includes(pattern)
      )
    ) {
      return true;
    }

    // Check value patterns
    if (typeof value === "number" && value > 1e9) return true; // Likely timestamp
    if (typeof value === "string" && stats.patterns?.has("date")) return true;

    return false;
  }

  private static isIdField(fieldName: string, stats: FieldStats): boolean {
    const fieldLower = fieldName.toLowerCase();
    return (
      this.ID_PATTERNS.some(
        (pattern) => fieldLower === pattern || fieldLower.includes(pattern)
      ) || stats.cardinality === "unique"
    );
  }

  private static isMetricField(
    fieldName: string,
    value: any,
    _stats: FieldStats
  ): boolean {
    const fieldLower = fieldName.toLowerCase();
    return (
      typeof value === "number" &&
      this.METRIC_PATTERNS.some((pattern) => fieldLower.includes(pattern))
    );
  }

  private static isDimensionField(
    fieldName: string,
    value: any,
    stats: FieldStats
  ): boolean {
    const fieldLower = fieldName.toLowerCase();
    return (
      (typeof value === "string" && stats.cardinality === "low") ||
      this.DIMENSION_PATTERNS.some((pattern) => fieldLower.includes(pattern))
    );
  }

  private static analyzeTimestampField(
    _fieldName: string,
    value: any,
    _stats: FieldStats
  ): FieldType {
    let format = "Time";
    let type = "DATETIME";

    if (typeof value === "number") {
      if (value > 1e18) {
        type = "BIGINT";
        format = "Time (ns)";
      } else if (value > 1e15) {
        type = "BIGINT";
        format = "Time (ns)";
      } else if (value > 1e12) {
        type = "BIGINT";
        format = "Time (μs)";
      } else if (value > 1e10) {
        type = "BIGINT";
        format = "Time (ms)";
      } else {
        type = "INTEGER";
        format = "Time (s)";
      }
    }

    return {
      type,
      format,
      semanticType: "timestamp",
      suggestions: {
        visualizations: ["timeseries"],
        aggregations: ["time_bucket", "date_trunc"],
        roles: ["x-axis", "time-filter"],
      },
    };
  }

  private static analyzeIdField(
    _fieldName: string,
    stats: FieldStats
  ): FieldType {
    const hasUUID = stats.patterns?.has("uuid");

    return {
      type: hasUUID ? "UUID" : "VARCHAR",
      semanticType: "id",
      cardinality: "unique",
      suggestions: {
        visualizations: [],
        aggregations: ["count_distinct"],
        roles: ["filter", "group-by"],
      },
    };
  }

  private static analyzeMetricField(
    _fieldName: string,
    value: any,
    _stats: FieldStats
  ): FieldType {
    const isInteger = Number.isInteger(value);
    const type = isInteger ? "INTEGER" : "DOUBLE";

    return {
      type,
      semanticType: "metric",
      precision: isInteger ? undefined : 2,
      suggestions: {
        visualizations: ["stat", "timeseries", "bar", "pie"],
        aggregations: ["sum", "avg", "min", "max", "count"],
        roles: ["y-axis", "value", "measure"],
      },
    };
  }

  private static analyzeDimensionField(
    _fieldName: string,
    value: any,
    stats: FieldStats
  ): FieldType {
    const isOrdinal = stats.cardinality === "low" && typeof value === "string";

    return {
      type: "VARCHAR",
      semanticType: isOrdinal ? "ordinal" : "dimension",
      suggestions: {
        visualizations: ["pie", "bar"],
        aggregations: ["count", "count_distinct"],
        roles: ["group-by", "filter", "series"],
      },
    };
  }

  private static analyzeNumericField(
    _fieldName: string,
    value: number,
    _stats: FieldStats
  ): FieldType {
    const isInteger = Number.isInteger(value);
    const type = isInteger ? "INTEGER" : "DOUBLE";

    return {
      type,
      precision: isInteger ? undefined : 2,
      suggestions: {
        visualizations: ["stat", "scatter"],
        aggregations: ["sum", "avg", "min", "max"],
        roles: ["y-axis", "value"],
      },
    };
  }

  private static analyzeStringField(
    _fieldName: string,
    _value: string,
    stats: FieldStats
  ): FieldType {
    const patterns = Array.from(stats.patterns || []);
    let format = undefined;

    if (patterns.includes("email")) format = "Email";
    else if (patterns.includes("url")) format = "URL";
    else if (patterns.includes("uuid")) format = "UUID";
    else if (patterns.includes("numeric_string")) format = "Numeric String";

    return {
      type: "VARCHAR",
      format,
      suggestions: {
        visualizations: stats.cardinality === "low" ? ["pie", "bar"] : [],
        aggregations: ["count", "count_distinct"],
        roles: ["filter", "group-by"],
      },
    };
  }

  private static analyzeBooleanField(
    _fieldName: string,
    _stats: FieldStats
  ): FieldType {
    return {
      type: "BOOLEAN",
      suggestions: {
        visualizations: ["pie", "bar"],
        aggregations: ["count"],
        roles: ["filter", "group-by"],
      },
    };
  }

  /**
   * Get smart field defaults with enhanced intelligence
   */
  static getEnhancedSmartDefaults(
    fieldAnalysis: Record<string, FieldType>,
    panelType: string = "timeseries"
  ): any {
    const fields = Object.keys(fieldAnalysis);
    const mapping: any = {};

    // Categorize fields by semantic type
    const timestampFields = fields.filter(
      (f) => fieldAnalysis[f].semanticType === "timestamp"
    );
    const metricFields = fields.filter(
      (f) => fieldAnalysis[f].semanticType === "metric"
    );
    const dimensionFields = fields.filter(
      (f) =>
        fieldAnalysis[f].semanticType === "dimension" ||
        fieldAnalysis[f].semanticType === "ordinal"
    );

    // Panel-specific intelligent mapping
    switch (panelType) {
      case "timeseries":
        mapping.xField = this.selectBestTimestampField(
          timestampFields,
          fieldAnalysis
        );
        mapping.yField = this.selectBestMetricField(
          metricFields,
          fieldAnalysis,
          ["sum", "avg"]
        );
        break;

      case "pie":
        mapping.xField = this.selectBestDimensionField(
          dimensionFields,
          fieldAnalysis
        );
        mapping.yField = this.selectBestMetricField(
          metricFields,
          fieldAnalysis,
          ["sum", "count"]
        );
        break;

      case "stat":
        mapping.yField = this.selectBestMetricField(
          metricFields,
          fieldAnalysis,
          ["sum", "avg", "count"]
        );
        break;

      case "scatter":
        const metrics = this.selectBestMetricFields(
          metricFields,
          fieldAnalysis,
          2
        );
        mapping.xField = metrics[0];
        mapping.yField = metrics[1];
        mapping.seriesField = this.selectBestDimensionField(
          dimensionFields,
          fieldAnalysis
        );
        break;

      default:
        mapping.xField =
          this.selectBestTimestampField(timestampFields, fieldAnalysis) ||
          this.selectBestDimensionField(dimensionFields, fieldAnalysis);
        mapping.yField = this.selectBestMetricField(
          metricFields,
          fieldAnalysis
        );
        break;
    }

    return mapping;
  }

  private static selectBestTimestampField(
    fields: string[],
    analysis: Record<string, FieldType>
  ): string | undefined {
    if (fields.length === 0) return undefined;

    // Prefer __timestamp, then highest precision timestamps
    return (
      fields.find((f) => f === "__timestamp") ||
      fields.find((f) => analysis[f].format?.includes("ns")) ||
      fields.find((f) => analysis[f].format?.includes("μs")) ||
      fields[0]
    );
  }

  private static selectBestMetricField(
    fields: string[],
    analysis: Record<string, FieldType>,
    preferredAggregations: string[] = []
  ): string | undefined {
    if (fields.length === 0) return undefined;

    // Prefer fields that support the desired aggregations
    for (const agg of preferredAggregations) {
      const field = fields.find((f) =>
        analysis[f].suggestions?.aggregations?.includes(agg)
      );
      if (field) return field;
    }

    return fields[0];
  }

  private static selectBestDimensionField(
    fields: string[],
    analysis: Record<string, FieldType>
  ): string | undefined {
    if (fields.length === 0) return undefined;

    // Prefer low cardinality fields for better grouping
    return fields.find((f) => analysis[f].cardinality === "low") || fields[0];
  }

  private static selectBestMetricFields(
    fields: string[],
    analysis: Record<string, FieldType>,
    count: number
  ): string[] {
    // Prefer DOUBLE over INTEGER for better scatter plots
    const sorted = fields.sort((a, b) => {
      const aType = analysis[a].type;
      const bType = analysis[b].type;
      if (aType === "DOUBLE" && bType !== "DOUBLE") return -1;
      if (bType === "DOUBLE" && aType !== "DOUBLE") return 1;
      return 0;
    });

    return sorted.slice(0, count);
  }
}
