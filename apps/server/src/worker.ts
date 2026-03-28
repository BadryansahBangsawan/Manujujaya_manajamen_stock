import { createContext } from "@Manujujaya-Manajemen-stock/api/context";
import { appRouter } from "@Manujujaya-Manajemen-stock/api/routers/index";
import { configureDatabase } from "@Manujujaya-Manajemen-stock/db";
import { OpenAPIHandler } from "@orpc/openapi/fetch";
import { OpenAPIReferencePlugin } from "@orpc/openapi/plugins";
import { onError } from "@orpc/server";
import { RPCHandler } from "@orpc/server/fetch";
import { ZodToJsonSchemaConverter } from "@orpc/zod/zod4";

type WorkerEnv = {
  DB: NonNullable<Parameters<typeof configureDatabase>[0]>["d1"];
  CORS_ORIGIN?: string;
};

const rpcHandler = new RPCHandler(appRouter, {
  interceptors: [
    onError((error) => {
      console.error(error);
    }),
  ],
});

const apiHandler = new OpenAPIHandler(appRouter, {
  plugins: [
    new OpenAPIReferencePlugin({
      schemaConverters: [new ZodToJsonSchemaConverter()],
    }),
  ],
  interceptors: [
    onError((error) => {
      console.error(error);
    }),
  ],
});

let runtimeConfigured = false;

function parseAllowedOrigins(value?: string) {
  return (value ?? "http://localhost:3001,http://localhost:5173,https://*.workers.dev")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function matchesWildcardOrigin(origin: string, rule: string) {
  const hasProtocolWildcard = rule.startsWith("http://*.") || rule.startsWith("https://*.");
  const hasHostWildcard = rule.startsWith("*.");
  if (!hasProtocolWildcard && !hasHostWildcard) return false;

  try {
    const url = new URL(origin);
    let expectedProtocol: string | null = null;
    let wildcardHost = rule.replace("*.", "");

    if (hasProtocolWildcard) {
      const separatorIndex = rule.indexOf("://");
      if (separatorIndex === -1) return false;
      expectedProtocol = rule.slice(0, separatorIndex);
      wildcardHost = rule.slice(separatorIndex + 3).replace("*.", "");
    }

    if (!wildcardHost) return false;
    if (expectedProtocol && url.protocol !== `${expectedProtocol}:`) return false;

    return url.hostname === wildcardHost || url.hostname.endsWith(`.${wildcardHost}`);
  } catch {
    return false;
  }
}

function isOriginAllowed(origin: string | null, allowedOrigins: string[]) {
  if (!origin) return true;
  if (allowedOrigins.includes("*")) return true;
  if (allowedOrigins.includes(origin)) return true;

  return allowedOrigins.some((rule) => matchesWildcardOrigin(origin, rule));
}

function buildCorsHeaders(origin: string | null, allowedOrigins: string[]) {
  if (!isOriginAllowed(origin, allowedOrigins)) return new Headers();

  const headers = new Headers();
  headers.set("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With, x-request-id");
  headers.set("Vary", "Origin, Access-Control-Request-Headers");
  headers.set("Access-Control-Allow-Origin", origin ?? "*");
  return headers;
}

function withCors(response: Response, corsHeaders: Headers) {
  const headers = new Headers(response.headers);
  for (const [key, value] of corsHeaders.entries()) {
    headers.set(key, value);
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export default {
  async fetch(request: Request, env: WorkerEnv) {
    if (!runtimeConfigured) {
      configureDatabase({ d1: env.DB ?? null });
      runtimeConfigured = true;
    }

    const origin = request.headers.get("origin");
    const allowedOrigins = parseAllowedOrigins(env.CORS_ORIGIN);
    const corsHeaders = buildCorsHeaders(origin, allowedOrigins);

    if (request.method === "OPTIONS") {
      if (origin && !isOriginAllowed(origin, allowedOrigins)) {
        return new Response("CORS blocked", { status: 403 });
      }

      return new Response(null, {
        status: 204,
        headers: corsHeaders,
      });
    }

    const url = new URL(request.url);
    if (url.pathname === "/") {
      return withCors(new Response("OK", { status: 200 }), corsHeaders);
    }

    const context = await createContext({ req: request });

    const rpcResult = await rpcHandler.handle(request, {
      prefix: "/rpc",
      context,
    });
    if (rpcResult.matched) return withCors(rpcResult.response, corsHeaders);

    const apiResult = await apiHandler.handle(request, {
      prefix: "/api-reference",
      context,
    });
    if (apiResult.matched) return withCors(apiResult.response, corsHeaders);

    return withCors(new Response("Not Found", { status: 404 }), corsHeaders);
  },
};
