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
  return new Set(
    (value ?? "http://localhost:3001,http://localhost:5173")
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean),
  );
}

function isOriginAllowed(origin: string | null, allowedOrigins: Set<string>) {
  if (!origin) return true;
  if (allowedOrigins.has("*")) return true;
  return allowedOrigins.has(origin);
}

function buildCorsHeaders(origin: string | null, allowedOrigins: Set<string>) {
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
