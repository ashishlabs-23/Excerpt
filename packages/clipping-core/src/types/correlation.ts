// A branded type to ensure correlation IDs are passed correctly
// Usage: const id: CorrelationId = generateId() as CorrelationId;
export type CorrelationId = string & { readonly __brand: unique symbol };

export function createCorrelationId(value: string): CorrelationId {
  return value as CorrelationId;
}

export function isCorrelationId(value: string): value is CorrelationId {
  // Just a string at runtime, but ensures we don't accidentally pass normal strings
  return typeof value === 'string' && value.length > 0;
}

