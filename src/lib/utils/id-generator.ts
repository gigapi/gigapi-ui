/**
 * Unified ID generation utility using UUID
 */
export function generateId(): string {
  return crypto.randomUUID();
}

/**
 * Generate ID with prefix
 */
export function generateIdWithPrefix(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`;
}

/**
 * Generate query-specific ID
 */
export function generateQueryId(): string {
  return generateIdWithPrefix('query');
}