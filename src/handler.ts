// src/handler.ts
import { CognitoIdentityProviderClient } from "@aws-sdk/client-cognito-identity-provider";
import type {
  APIGatewayProxyEvent,
  APIGatewayProxyEventV2,
  APIGatewayProxyResult,
} from "aws-lambda";
import { extractClaims, corsHeaders, json } from "./util";
import {
  handleSignup,
  handleVerify,
  handleLogin,
  handleRefresh,
  handleChangePassword,
  handleLogout,
} from "./auth";

//move them to env variables
export const REGION = "us-east-1";
export const CLIENT_ID = "4svgrm4b2mpb525nadl6gt682e";
export const DOMAIN =
  "https://us-east-1c2ij1z29m.auth.us-east-1.amazoncognito.com";
export const IS_PROD = true;

export const cip = new CognitoIdentityProviderClient({ region: REGION });

// ---------- helpers ----------
export type Res = APIGatewayProxyResult;

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

  const headers = corsHeaders(event.headers?.origin);
  // --- protected routes ---
  if (!claims) {
    return json(
      401,
      { error: "Unauthorized: missing valid Cognito token" },
      headers
    );
  }

  // Example protected route
  if (method === "GET" && normalized.endsWith("/me")) {
    return json(200, { user: claims }, headers);
  }

  return json(404, { error: "Not Found", path });
}
