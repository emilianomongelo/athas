import type { HttpRequestBlock, HttpResponse } from "../types";
import { useEnvironmentStore } from "../stores/environment-store";
import { substituteVariables } from "./environment-service";

export async function executeHttpRequest(request: HttpRequestBlock): Promise<HttpResponse> {
  const startTime = performance.now();

  // Substitute variables using the current environment
  const state = useEnvironmentStore.getState();
  const { environments, selectedEnvironment } = state;

  const resolvedUrl = substituteVariables(request.url, environments, selectedEnvironment);
  const resolvedHeaders: Record<string, string> = {};
  for (const [key, value] of Object.entries(request.headers)) {
    resolvedHeaders[key] = substituteVariables(value, environments, selectedEnvironment);
  }
  const resolvedBody = substituteVariables(request.body, environments, selectedEnvironment);

  const { fetch: tauriFetch } = await import("@tauri-apps/plugin-http");

  const headers = new Headers(resolvedHeaders);
  const requestBody = resolvedBody || undefined;

  const response = await tauriFetch(resolvedUrl, {
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
    requestUrl: resolvedUrl,
    requestHeaders: resolvedHeaders,
    requestBody: resolvedBody,
  };
}
