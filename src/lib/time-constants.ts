import type { TimeRange } from "../components/TimeRangeSelector";

// Default time range
export const DEFAULT_TIME_RANGE: TimeRange = {
  from: "now-1h",
  to: "now",
  display: "Last 1 hour",
  enabled: true
};

// Special option to disable time filtering
export const NO_TIME_FILTER: TimeRange = {
  display: "No time filter",
  from: "",
  to: "",
  enabled: false
};

// Quick range options
export const QUICK_RANGES: TimeRange[] = [
  { display: "Last 5 minutes", from: "now-5m", to: "now" },
  { display: "Last 15 minutes", from: "now-15m", to: "now" },
  { display: "Last 30 minutes", from: "now-30m", to: "now" },
  { display: "Last 1 hour", from: "now-1h", to: "now" },
  { display: "Last 3 hours", from: "now-3h", to: "now" },
  { display: "Last 6 hours", from: "now-6h", to: "now" },
  { display: "Last 12 hours", from: "now-12h", to: "now" },
  { display: "Last 24 hours", from: "now-24h", to: "now" },
  { display: "Last 2 days", from: "now-2d", to: "now" },
  { display: "Last 7 days", from: "now-7d", to: "now" },
  { display: "Last 30 days", from: "now-30d", to: "now" },
  { display: "Last 90 days", from: "now-90d", to: "now" },
  { display: "Last 6 months", from: "now-6M", to: "now" },
  { display: "Last 1 year", from: "now-1y", to: "now" },
  { display: "Today", from: "now/d", to: "now" },
  { display: "Yesterday", from: "now-1d/d", to: "now/d" },
  { display: "This week", from: "now/w", to: "now" },
  { display: "Previous week", from: "now-1w/w", to: "now/w" },
  { display: "This month", from: "now/M", to: "now" },
  { display: "Previous month", from: "now-1M/M", to: "now/M" },
  { display: "This year", from: "now/y", to: "now" },
  { display: "Previous year", from: "now-1y/y", to: "now/y" },
]; 