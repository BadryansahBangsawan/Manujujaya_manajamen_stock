import type { Request } from "express";

interface CreateContextOptions {
  req: Request;
}

export async function createContext(opts: CreateContextOptions) {
  return {
    auth: null,
    session: null,
    requestId: opts.req.headers["x-request-id"]?.toString() ?? crypto.randomUUID(),
  };
}

export type Context = Awaited<ReturnType<typeof createContext>>;
