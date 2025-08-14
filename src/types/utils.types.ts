// Core time-related types
export interface TimeRange {
  from: string;
  to: string;
  display?: string;
  enabled?: boolean;
}

export const TIME_UNITS = {
  NANOSECOND: "ns",
  MICROSECOND: "us",
  MILLISECOND: "ms",
  SECOND: "s",
} as const;

export type TimeUnit = (typeof TIME_UNITS)[keyof typeof TIME_UNITS];

// Database schema types
export interface ColumnSchema {
  columnName: string;
  dataType?: string;
  timeUnit?: TimeUnit;
}

// URL hash query types
export interface HashQueryParams {
  query?: string;
  db?: string;
  table?: string;
  timeField?: string;
  timeFrom?: string;
  timeTo?: string;
}

export const TIME_VARIABLE_PATTERNS = {
  TIME_FILTER: /\$__timeFilter/g,
  TIME_FIELD: /\$__timeField/g,
  TIME_FROM: /\$__timeFrom/g,
  TIME_TO: /\$__timeTo/g,
  TABLE: /\$__table/g,
  ALL_TIME_VARS: /\$__(timeFilter|timeField|timeFrom|timeTo)/,
  ALL_VARIABLES: /\$__(timeFilter|timeField|timeFrom|timeTo|table)/,
} as const;

export const DEFAULT_TIME_RANGE: TimeRange = {
  from: "now-1h",
  to: "now",
  display: "Last 1 hour",
  enabled: true,
};

export const NO_TIME_FILTER: TimeRange = {
  display: "No time filter",
  from: "",
  to: "",
  enabled: false,
};

export const QUICK_RANGES: TimeRange[] = [
  {
    display: "Last 5 minutes",
    from: "now-5m",
    to: "now",
    enabled: true,
  },
  {
    display: "Last 15 minutes",
    from: "now-15m",
    to: "now",
    enabled: true,
  },
  {
    display: "Last 30 minutes",
    from: "now-30m",
    to: "now",
    enabled: true,
  },
  {
    display: "Last 1 hour",
    from: "now-1h",
    to: "now",
    enabled: true,
  },
  {
    display: "Last 3 hours",
    from: "now-3h",
    to: "now",
    enabled: true,
  },
  {
    display: "Last 6 hours",
    from: "now-6h",
    to: "now",
    enabled: true,
  },
  {
    display: "Last 12 hours",
    from: "now-12h",
    to: "now",
    enabled: true,
  },
  {
    display: "Last 24 hours",
    from: "now-1d",
    to: "now",
    enabled: true,
  },
  {
    display: "Last 2 days",
    from: "now-2d",
    to: "now",
    enabled: true,
  },
  {
    display: "Last 7 days",
    from: "now-7d",
    to: "now",
    enabled: true,
  },
  {
    display: "Last 30 days",
    from: "now-30d",
    to: "now",
    enabled: true,
  },
  {
    display: "Last 90 days",
    from: "now-90d",
    to: "now",
    enabled: true,
  },
  {
    display: "Last 6 months",
    from: "now-6M",
    to: "now",
    enabled: true,
  },
  {
    display: "Last 1 year",
    from: "now-1y",
    to: "now",
    enabled: true,
  },
  {
    display: "Today",
    from: "now/d",
    to: "now",
    enabled: true,
  },
  {
    display: "Yesterday",
    from: "now-1d/d",
    to: "now-1d/d+1d",
    enabled: true,
  },
  {
    display: "This week",
    from: "now/w",
    to: "now",
    enabled: true,
  },
  {
    display: "This month",
    from: "now/M",
    to: "now",
    enabled: true,
  },
];
