export function generateId(prefix = 'id') {
  const randomPart = Math.random().toString(36).substring(2, 10);
  return `${prefix}-${randomPart}`;
}