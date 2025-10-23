// src/handler.ts
import type {
  APIGatewayProxyEvent,
  APIGatewayProxyEventV2,
  APIGatewayProxyResult,
} from "aws-lambda";

type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "OPTIONS";
type Res = APIGatewayProxyResult;

type Req = {
  method: HttpMethod;
  path: string;
  query: Record<string, string | undefined>;
  headers: Record<string, string | undefined>;
  params: Record<string, string>;
  body: any;
  claims: Record<string, any> | null; // Cognito JWT claims when authorizer is enabled
  rawEvent: APIGatewayProxyEvent | APIGatewayProxyEventV2;
};

type Handler = (req: Req) => Promise<Res> | Res;

type Route = {
  method: HttpMethod;
  path: string; // supports /users/:id
  handler: Handler;
};

// ----------------- helpers -----------------
function trimSlashes(s: string) {
  return s.replace(/^\/+|\/+$/g, "");
}

function matchPath(
  template: string,
  actual: string
): { ok: boolean; params: Record<string, string> } {
  const tParts = trimSlashes(template).split("/");
  const aParts = trimSlashes(actual).split("/");
  if (tParts.length !== aParts.length) return { ok: false, params: {} };
  const params: Record<string, string> = {};
  for (let i = 0; i < tParts.length; i++) {
    const t = tParts[i],
      a = aParts[i];
    if (t.startsWith(":")) params[t.slice(1)] = decodeURIComponent(a);
    else if (t !== a) return { ok: false, params: {} };
  }
  return { ok: true, params };
}

function json(
  statusCode: number,
  data: any,
  headers: Record<string, string> = {}
): Res {
  return {
    statusCode,
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(data),
  };
}

function text(
  statusCode: number,
  body: string,
  headers: Record<string, string> = {}
): Res {
  return {
    statusCode,
    headers: { "Content-Type": "text/plain; charset=utf-8", ...headers },
    body,
  };
}

function getMethodAndPath(event: any): { method: HttpMethod; path: string } {
  const method = (event.requestContext?.http?.method ||
    event.httpMethod ||
    "GET") as HttpMethod;
  const path = event.rawPath || event.path || "/";
  return { method, path };
}

function getQuery(event: any) {
  return event.queryStringParameters || {};
}

function getHeaders(event: any) {
  return event.headers || {};
}

function parseBody(event: any): any {
  if (!event.body) return null;
  const raw = event.isBase64Encoded
    ? Buffer.from(event.body, "base64").toString("utf8")
    : event.body;
  const ct = (
    event.headers?.["content-type"] ||
    event.headers?.["Content-Type"] ||
    ""
  ).toLowerCase();
  if (ct.includes("application/json")) {
    try {
      return JSON.parse(raw);
    } catch {
      return raw;
    }
  }
  return raw;
}

// Extract Cognito claims for REST APIs with a User Pool authorizer.
// For REST APIs, claims are usually under requestContext.authorizer.claims
// For HTTP APIs v2 w/ JWT authorizer, they are under requestContext.authorizer.jwt.claims
function extractClaims(event: any): Record<string, any> | null {
  return (
    event?.requestContext?.authorizer?.claims ||
    event?.requestContext?.authorizer?.jwt?.claims ||
    null
  );
}

// ----------------- routes -----------------
const routes: Route[] = [
  // Unauthenticated if you configured API Gateway /public method without authorizer
  {
    method: "GET",
    path: "/public/ping",
    handler: async () => json(200, { pong: true }),
  },

  // Authenticated: return user identity from Cognito token
  {
    method: "GET",
    path: "/me",
    handler: async (req) => {
      if (!req.claims) return json(401, { error: "Unauthorized" });
      const { sub, email, "cognito:username": username, scope } = req.claims;
      return json(200, { sub, username, email, scope });
    },
  },

  // Simple examples
  {
    method: "GET",
    path: "/hello",
    handler: async (req) => {
      const name = req.query.name ?? "world";
      return json(200, { message: `Hello, ${name}!` });
    },
  },

  {
    method: "GET",
    path: "/users/:id",
    handler: async (req) => json(200, { userId: req.params.id }),
  },

  {
    method: "POST",
    path: "/echo",
    handler: async (req) => json(200, { received: req.body }),
  },
];

// ----------------- entry -----------------
export async function main(
  event: APIGatewayProxyEvent | APIGatewayProxyEventV2
): Promise<Res> {
  const { method, path } = getMethodAndPath(event);
  const query = getQuery(event);
  const headers = getHeaders(event);
  const body = parseBody(event);
  const claims = extractClaims(event);

  const matches = routes
    .map((r) => ({ r, m: matchPath(r.path, path) }))
    .filter((x) => x.m.ok);
  if (matches.length === 0) return json(404, { error: "Not Found", path });

  const chosen = matches.find((x) => x.r.method === method);
  if (!chosen) {
    const allow = [...new Set(matches.map((x) => x.r.method))].join(", ");
    return text(405, "Method Not Allowed", { Allow: allow });
  }

  const req: Req = {
    method,
    path,
    query,
    headers,
    params: chosen.m.params,
    body,
    claims,
    rawEvent: event,
  };

  try {
    const res = await chosen.r.handler(req);
    // Add permissive CORS; API Gateway CORS is also configured in your stack
    return {
      ...res,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type,Authorization",
        ...(res.headers || {}),
      },
    };
  } catch (err) {
    console.error("Handler error:", err);
    return json(500, { error: "Internal Server Error" });
  }
}
