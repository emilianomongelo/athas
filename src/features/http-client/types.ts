export interface HttpRequestBlock {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: string;
  startLine: number;
  endLine: number;
}

export interface HttpResponse {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: string;
  contentType: string;
  timingMs: number;
  requestMethod: string;
  requestUrl: string;
  requestHeaders: Record<string, string>;
  requestBody: string;
}

export interface HttpClientState {
  responses: Record<string, HttpResponse>;
  isExecuting: boolean;
  activeResponseKey: string | null;
  error: string | null;
}
