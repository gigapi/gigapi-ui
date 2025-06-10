/**
 * Get browser timezone
 */
export function getBrowserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch (error) {
    console.error("Error getting browser timezone:", error);
    return "UTC";
  }
}

/**
 * Format timezone for display
 */
export function formatTimezone(timezone: string): string {
  if (!timezone || typeof timezone !== "string") return "UTC";

  // Handle special Browser_Time case
  if (timezone === "Browser_Time") {
    return `Browser Time (${getTimezoneOffset(timezone)})`;
  }

  try {
    // Format: Continent/City -> City (UTC+XX:XX)
    const parts = timezone.split("/");
    const city =
      parts.length > 1 ? parts[parts.length - 1].replace(/_/g, " ") : timezone;

    // Get the UTC offset
    const now = new Date();
    const formatter = new Intl.DateTimeFormat("en-GB", {
      timeZone: timezone,
      timeZoneName: "short",
    });

    const formatted = formatter.format(now);
    const tzPart = formatted.split(" ").pop() || "";

    return `${city} (${tzPart})`;
  } catch (error) {
    console.error("Error formatting timezone:", error);
    return timezone;
  }
}

/**
 * Get timezone offset string
 */
export function getTimezoneOffset(timezone: string): string {
  if (!timezone || typeof timezone !== "string") return "UTC+00:00";

  try {
    // Special handling for Browser Time
    if (timezone === "Browser_Time") {
      const offset = -new Date().getTimezoneOffset();
      const hours = Math.floor(Math.abs(offset) / 60);
      const minutes = Math.abs(offset) % 60;
      const sign = offset >= 0 ? "+" : "-";
      return `UTC${sign}${hours.toString().padStart(2, "0")}:${minutes
        .toString()
        .padStart(2, "0")}`;
    }

    // For all other timezones
    const now = new Date();
    const utcTime = now.getTime() + now.getTimezoneOffset() * 60000;
    const tzTime = new Date(
      utcTime + getTimezoneOffsetInMinutes(timezone) * 60000
    );

    const offsetMinutes = (tzTime.getTime() - utcTime) / 60000;
    const hours = Math.floor(Math.abs(offsetMinutes) / 60);
    const minutes = Math.abs(offsetMinutes) % 60;
    const sign = offsetMinutes >= 0 ? "+" : "-";

    return `UTC${sign}${hours.toString().padStart(2, "0")}:${Math.floor(minutes)
      .toString()
      .padStart(2, "0")}`;
  } catch (error) {
    console.error("Error getting timezone offset:", error);
    return "UTC+00:00";
  }
}

/**
 * Get timezone offset in minutes for a given timezone
 */
export function getTimezoneOffsetInMinutes(timezone: string): number {
  try {
    const now = new Date();
    const utc = new Date(now.getTime() + now.getTimezoneOffset() * 60000);
    const local = new Date(
      utc.toLocaleString("en-US", { timeZone: timezone })
    );
    return (local.getTime() - utc.getTime()) / 60000;
  } catch (error) {
    console.error("Error getting timezone offset in minutes:", error);
    return 0;
  }
}
