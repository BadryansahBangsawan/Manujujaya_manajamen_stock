type HeaderRecord = Record<string, string | string[] | undefined>;

type RequestLike =
  | Request
  | {
      headers?: HeaderRecord;
      header?: (name: string) => string | undefined;
      get?: (name: string) => string | undefined;
    };

interface CreateContextOptions {
  req: RequestLike;
}

function readHeader(req: RequestLike, headerName: string) {
  if (req instanceof Request) {
    return req.headers.get(headerName) ?? undefined;
  }

  const lowered = headerName.toLowerCase();
  const raw =
    req.header?.(headerName) ??
    req.get?.(headerName) ??
    req.headers?.[headerName] ??
    req.headers?.[lowered];

  if (Array.isArray(raw)) return raw[0];
  return raw;
}

export async function createContext(opts: CreateContextOptions) {
  return {
    auth: null,
    session: null,
    requestId: readHeader(opts.req, "x-request-id")?.toString() ?? crypto.randomUUID(),
  };
}

export type Context = Awaited<ReturnType<typeof createContext>>;
