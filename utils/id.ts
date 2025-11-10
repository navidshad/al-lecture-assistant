export function generateSessionId(fileName: string): string {
  const timestamp = Date.now();
  // Normalize filename for id safety
  const safeName = fileName
    .replace(/\s+/g, "-")
    .replace(/[^a-zA-Z0-9._-]/g, "");
  return `${safeName}-${timestamp}`;
}
