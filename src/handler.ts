// src/handler.ts
import {
  CognitoIdentityProviderClient,
  SignUpCommand,
  ConfirmSignUpCommand,
  InitiateAuthCommand,
  ChangePasswordCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import type {
  APIGatewayProxyEvent,
  APIGatewayProxyEventV2,
  APIGatewayProxyResult,
} from "aws-lambda";

const REGION = "us-east-1";
const CLIENT_ID = "4svgrm4b2mpb525nadl6gt682e";
const DOMAIN = "https://us-east-1c2ij1z29m.auth.us-east-1.amazoncognito.com";
const IS_PROD = true;

const cip = new CognitoIdentityProviderClient({ region: REGION });

// ---------- helpers ----------
type Res = APIGatewayProxyResult;

function json(
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

function cookieHeader(
  name: string,
  value: string,
  opts: Record<string, any> = {}
): string {
  const {
    httpOnly = true,
    secure = IS_PROD,
    path = "/",
    sameSite = IS_PROD ? "None" : "Lax",
    maxAge = 60 * 60 * 24 * 30, // 30 days
  } = opts;
  const parts = [
    `${name}=${value}`,
    `Path=${path}`,
    `Max-Age=${maxAge}`,
    `SameSite=${sameSite}`,
    httpOnly ? "HttpOnly" : "",
    secure ? "Secure" : "",
    DOMAIN ? `Domain=${DOMAIN}` : "",
  ].filter(Boolean);
  return parts.join("; ");
}

function extractCookie(cookieHeader?: string, name = "rt"): string | null {
  if (!cookieHeader) return null;
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

function corsHeaders(origin?: string): Record<string, string> {
  const allowOrigin = origin || "*";
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Headers": "content-type,authorization,x-csrf",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  };
}

function extractClaims(event: any): Record<string, any> | null {
  return (
    event?.requestContext?.authorizer?.claims ||
    event?.requestContext?.authorizer?.jwt?.claims ||
    null
  );
}

// ---------- handlers ----------
async function handleSignup(event: any): Promise<Res> {
  const headers = corsHeaders(event.headers?.origin);
  const body = JSON.parse(event.body || "{}");
  const { email, password, firstName, lastName } = body;
  if (!email || !password)
    return json(400, { error: "Missing email or password" }, headers);

  try {
    await cip.send(
      new SignUpCommand({
        ClientId: CLIENT_ID,
        Username: email,
        Password: password,
        UserAttributes: [
          { Name: "email", Value: email },
          { Name: "given_name", Value: firstName || "" },
          { Name: "family_name", Value: lastName || "" },
        ],
      })
    );
    return json(
      200,
      { ok: true, message: "Signup successful. Please verify email." },
      headers
    );
  } catch (e: any) {
    return json(400, { error: e.message || "Signup failed" }, headers);
  }
}

async function handleVerify(event: any): Promise<Res> {
  const headers = corsHeaders(event.headers?.origin);
  const body = JSON.parse(event.body || "{}");
  const { email, code } = body;
  if (!email || !code)
    return json(400, { error: "Missing email or code" }, headers);

  try {
    await cip.send(
      new ConfirmSignUpCommand({
        ClientId: CLIENT_ID,
        Username: email,
        ConfirmationCode: code,
      })
    );
    return json(
      200,
      { ok: true, message: "Email verified successfully." },
      headers
    );
  } catch (e: any) {
    return json(400, { error: e.message || "Verification failed" }, headers);
  }
}

async function handleLogin(event: any): Promise<Res> {
  const headers = corsHeaders(event.headers?.origin);
  const body = JSON.parse(event.body || "{}");
  const { email, password } = body;
  if (!email || !password)
    return json(400, { error: "Missing credentials" }, headers);

  try {
    const resp = await cip.send(
      new InitiateAuthCommand({
        AuthFlow: "USER_PASSWORD_AUTH",
        ClientId: CLIENT_ID,
        AuthParameters: { USERNAME: email, PASSWORD: password },
      })
    );
    const auth = resp.AuthenticationResult;
    if (!auth?.AccessToken || !auth?.RefreshToken)
      return json(401, { error: "Invalid login" }, headers);

    const setCookie = cookieHeader("rt", encodeURIComponent(auth.RefreshToken));
    return {
      statusCode: 200,
      headers: { ...headers, "Set-Cookie": setCookie },
      body: JSON.stringify({
        accessToken: auth.AccessToken,
        expiresIn: auth.ExpiresIn,
        idToken: auth.IdToken,
      }),
    };
  } catch (e: any) {
    return json(401, { error: e.message || "Login failed" }, headers);
  }
}

async function handleRefresh(event: any): Promise<Res> {
  const headers = corsHeaders(event.headers?.origin);
  const cookieHeader = event.headers?.cookie || event.headers?.Cookie;
  const rt = extractCookie(cookieHeader);
  if (!rt) return json(401, { error: "Missing refresh token" }, headers);

  try {
    const resp = await cip.send(
      new InitiateAuthCommand({
        AuthFlow: "REFRESH_TOKEN_AUTH",
        ClientId: CLIENT_ID,
        AuthParameters: { REFRESH_TOKEN: rt },
      })
    );
    const auth = resp.AuthenticationResult;
    if (!auth?.AccessToken)
      return json(401, { error: "Invalid refresh" }, headers);

    const newRt = auth.RefreshToken || rt;
    const setCookie = cookieHeader("rt", encodeURIComponent(newRt));
    return {
      statusCode: 200,
      headers: { ...headers, "Set-Cookie": setCookie },
      body: JSON.stringify({
        accessToken: auth.AccessToken,
        expiresIn: auth.ExpiresIn,
        idToken: auth.IdToken,
      }),
    };
  } catch (e: any) {
    return json(
      401,
      { error: e.message || "Failed to refresh token" },
      headers
    );
  }
}

async function handleChangePassword(event: any): Promise<Res> {
  const headers = corsHeaders(event.headers?.origin);
  const body = JSON.parse(event.body || "{}");
  const { accessToken, previousPassword, proposedPassword } = body;
  if (!accessToken || !previousPassword || !proposedPassword)
    return json(400, { error: "Missing fields" }, headers);

  try {
    await cip.send(
      new ChangePasswordCommand({
        AccessToken: accessToken,
        PreviousPassword: previousPassword,
        ProposedPassword: proposedPassword,
      })
    );
    return json(
      200,
      { ok: true, message: "Password changed successfully." },
      headers
    );
  } catch (e: any) {
    return json(
      400,
      { error: e.message || "Failed to change password" },
      headers
    );
  }
}

async function handleLogout(event: any): Promise<Res> {
  const headers = corsHeaders(event.headers?.origin);
  const clear = cookieHeader("rt", "", { maxAge: 0 });
  return {
    statusCode: 204,
    headers: { ...headers, "Set-Cookie": clear },
    body: "",
  };
}

// ---------- main ----------
export async function main(
  event: APIGatewayProxyEvent | APIGatewayProxyEventV2
): Promise<Res> {
  const method =
    (event.requestContext as any)?.http?.method ||
    (event as any).httpMethod ||
    "GET";
  const path = (event as any).rawPath || (event as any).path || "/";
  const normalized = path.toLowerCase();
  const claims = extractClaims(event);

  if (method === "OPTIONS") {
    const headers = corsHeaders(event.headers?.origin || event.headers?.Origin);
    return { statusCode: 204, headers, body: "" };
  }

  // --- public routes ---
  if (method === "POST" && normalized.endsWith("/auth/signup"))
    return handleSignup(event);
  if (method === "POST" && normalized.endsWith("/auth/verify"))
    return handleVerify(event);
  if (method === "POST" && normalized.endsWith("/auth/login"))
    return handleLogin(event);
  if (method === "POST" && normalized.endsWith("/auth/refresh"))
    return handleRefresh(event);
  if (method === "POST" && normalized.endsWith("/auth/change-password"))
    return handleChangePassword(event);
  if (method === "POST" && normalized.endsWith("/auth/logout"))
    return handleLogout(event);

  // --- protected routes ---
  if (!claims) {
    const headers = corsHeaders(event.headers?.origin);
    return json(
      401,
      { error: "Unauthorized: missing valid Cognito token" },
      headers
    );
  }

  // Example protected route
  if (method === "GET" && normalized.endsWith("/me")) {
    return json(200, { user: claims });
  }

  return json(404, { error: "Not Found", path });
}
