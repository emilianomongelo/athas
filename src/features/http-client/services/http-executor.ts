import type { HttpRequestBlock, HttpResponse } from "../types";

export async function executeHttpRequest(request: HttpRequestBlock): Promise<HttpResponse> {
  const startTime = performance.now();

  const { fetch: tauriFetch } = await import("@tauri-apps/plugin-http");

  const headers = new Headers(request.headers);
  const requestBody = request.body || undefined;

  const response = await tauriFetch(request.url, {
    method: request.method,
    headers,
    body: requestBody || undefined,
  });

  const timingMs = Math.round(performance.now() - startTime);
  const responseBody = await response.text();

  const responseHeaders: Record<string, string> = {};
  response.headers.forEach((value, key) => {
    responseHeaders[key] = value;
  });

  const contentType = response.headers.get("content-type") ?? "";

  return {
    status: response.status,
    statusText: response.statusText,
    headers: responseHeaders,
    body: responseBody,
    contentType,
    timingMs,
    requestMethod: request.method,
    requestUrl: request.url,
    requestHeaders: request.headers,
    requestBody: request.body,
  };
}
