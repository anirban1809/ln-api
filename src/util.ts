import { IS_PROD, DOMAIN, Res } from "./handler";

export function json(
  status: number,
  data: any,
  headers: Record<string, string> = {}
): Res {
  return {
    statusCode: status,
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(data),
  };
}

export function cookieHeader(
  name: string,
  value: string,
  opts: Record<string, any> = {}
): string {
  const {
    httpOnly = true,
    secure = false,
    path = "/",
    sameSite = "Lax",
    maxAge = 60 * 60 * 24 * 30, // 30 days
  } = opts;
  const parts = [
    `${name}=${value}`,
    `Path=${path}`,
    `Max-Age=${maxAge}`,
    secure ? "Secure" : "",
    `SameSite=${sameSite}`,
    httpOnly ? "HttpOnly" : "",
  ].filter(Boolean);
  return parts.join("; ");
}

export function extractCookie(
  cookieHeader?: string,
  name = "rt"
): string | null {
  if (!cookieHeader) return null;
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

export function corsHeaders(origin?: string): Record<string, string> {
  const allowOrigin = origin || "*";
  return {
    "Access-Control-Allow-Origin": "http://localhost:8080",
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Headers": "content-type,authorization,x-csrf",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  };
}

export function extractClaims(event: any): Record<string, any> | null {
  return (
    event?.requestContext?.authorizer?.claims ||
    event?.requestContext?.authorizer?.jwt?.claims ||
    null
  );
}
