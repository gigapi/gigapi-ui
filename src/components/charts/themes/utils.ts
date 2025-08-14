import { useEffect, useState } from "react";
import type { ChartTheme } from "../core/types";
import { getTheme } from "./gigapiCharts";

/**
 * Hook to detect and track theme changes
 */
export function useTheme(): { isDarkMode: boolean; theme: ChartTheme } {
  const [isDarkMode, setIsDarkMode] = useState(() =>
    document.documentElement.classList.contains("dark")
  );

  useEffect(() => {
    const observer = new MutationObserver(() => {
      setIsDarkMode(document.documentElement.classList.contains("dark"));
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });

    return () => observer.disconnect();
  }, []);

  return {
    isDarkMode,
    theme: getTheme(isDarkMode),
  };
}

/**
 * Format time for axis labels based on time span
 */
export function formatAxisTime(timestamp: number, spanMs: number): string {
  // uPlot passes timestamp in seconds, convert to milliseconds for Date constructor
  const date = new Date(timestamp * 1000);

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");
  const milliseconds = String(date.getMilliseconds()).padStart(3, "0");

  const dayMs = 24 * 60 * 60 * 1000;
  const hourMs = 60 * 60 * 1000;
  const minuteMs = 60 * 1000;
  const secondMs = 1000;

  // More than 30 days - show month/day/year
  if (spanMs > 30 * dayMs) {
    return `${month}/${day}/${year}`;
  }

  // More than 7 days - show month/day
  if (spanMs > 7 * dayMs) {
    return `${month}/${day}`;
  }

  // More than a day - show date and time (no seconds)
  if (spanMs > dayMs) {
    return `${month}/${day} ${hours}:${minutes}`;
  }

  // More than 2 hours - show hours and minutes only
  if (spanMs > 2 * hourMs) {
    return `${hours}:${minutes}`;
  }

  // More than 10 minutes - show hours, minutes and seconds
  if (spanMs > 10 * minuteMs) {
    return `${hours}:${minutes}:${seconds}`;
  }

  // More than 1 minute - show full time with seconds
  if (spanMs > minuteMs) {
    return `${hours}:${minutes}:${seconds}`;
  }

  // More than 10 seconds - show time with seconds
  if (spanMs > 10 * secondMs) {
    return `${hours}:${minutes}:${seconds}`;
  }

  // Less than 10 seconds - show time with milliseconds
  return `${hours}:${minutes}:${seconds}.${milliseconds}`;
}

/**
 * Format values for display
 */
export function formatValue(
  value: number,
  decimals: number = 2,
  unit?: string
): string {
  let formattedValue: string;

  if (Math.abs(value) >= 1e9) {
    formattedValue = (value / 1e9).toFixed(decimals) + "B";
  } else if (Math.abs(value) >= 1e6) {
    formattedValue = (value / 1e6).toFixed(decimals) + "M";
  } else if (Math.abs(value) >= 1e3) {
    formattedValue = (value / 1e3).toFixed(decimals) + "K";
  } else {
    formattedValue = value.toFixed(decimals);
  }

  return unit ? `${formattedValue} ${unit}` : formattedValue;
}

/**
 * Get color from theme palette
 */
export function getSeriesColor(theme: ChartTheme, index: number): string {
  return theme.colors[index % theme.colors.length];
}
