export function validateChartConfiguration(config: any): boolean {
  if (!config || typeof config !== "object") return false;
  return true;
}

export function mergeChartConfigurations(base: any, override: any): any {
  return { ...base, ...override };
}
