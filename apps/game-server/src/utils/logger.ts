export function logInfo(scope: string, message: string, context: Record<string, unknown> = {}): void {
  console.log(`[${scope}] ${message}`, context);
}

export function logError(scope: string, message: string, context: Record<string, unknown> = {}): void {
  console.error(`[${scope}] ${message}`, context);
}
