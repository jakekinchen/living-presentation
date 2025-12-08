import { NextRequest } from "next/server";

const requestLog = new Map<string, number[]>();

export function getClientId(request: NextRequest): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.ip ||
    "unknown"
  );
}

export function isRateLimited(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const windowStart = now - windowMs;

  const timestamps = requestLog.get(key)?.filter((ts) => ts > windowStart) ?? [];
  timestamps.push(now);

  requestLog.set(key, timestamps);

  return timestamps.length > limit;
}
