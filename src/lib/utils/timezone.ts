/**
 * Get browser's timezone
 */
export function getBrowserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

/**
 * Format timezone for display
 */
export function formatTimezone(timezone: string): string {
  if (!timezone) return "UTC";
  
  // Handle special cases
  if (timezone === "UTC" || timezone === "GMT") {
    return timezone;
  }
  
  // Format standard timezone names
  return timezone
    .split("/")
    .map(part => part.replace(/_/g, " "))
    .join(" / ");
}

/**
 * Get timezone offset display
 */
export function getTimezoneOffset(timezone: string): string {
  try {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat("en", {
      timeZone: timezone,
      timeZoneName: "short"
    });
    
    const parts = formatter.formatToParts(now);
    const timeZoneName = parts.find(part => part.type === "timeZoneName")?.value;
    
    if (timeZoneName) {
      return timeZoneName;
    }
    
    // Fallback: calculate offset manually
    const utc = new Date(now.toLocaleString("en-US", { timeZone: "UTC" }));
    const local = new Date(now.toLocaleString("en-US", { timeZone: timezone }));
    const offset = (local.getTime() - utc.getTime()) / (1000 * 60 * 60);
    
    const sign = offset >= 0 ? "+" : "-";
    const hours = Math.floor(Math.abs(offset));
    const minutes = Math.floor((Math.abs(offset) % 1) * 60);
    
    return `UTC${sign}${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}`;
  } catch {
    return "UTC+00:00";
  }
}
