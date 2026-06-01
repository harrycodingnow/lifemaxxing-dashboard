// NextRequest builder.
import { NextRequest } from "next/server";

export function makeRequest(
  url: string,
  init: { method?: string; body?: unknown; headers?: Record<string, string> } = {},
): NextRequest {
  const headers = new Headers(init.headers || {});
  const method = init.method || "GET";
  const body =
    init.body == null
      ? undefined
      : typeof init.body === "string"
        ? init.body
        : JSON.stringify(init.body);
  if (body && !headers.has("content-type")) headers.set("content-type", "application/json");
  return new NextRequest(new URL(url, "http://localhost").toString(), {
    method,
    headers,
    body: body as BodyInit | undefined,
  });
}

export async function jsonOf(res: Response): Promise<any> {
  return res.json();
}
