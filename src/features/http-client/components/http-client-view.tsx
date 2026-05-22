import { useCallback, useMemo, useState } from "react";
import { useBufferStore } from "@/features/editor/stores/buffer-store";
import { hasTextContent } from "@/features/panes/types/pane-content";
import { useSettingsStore } from "@/features/settings/store";
import { useHttpClientStore } from "../stores/http-client-store";
import { parseHttpFile } from "../services/http-parser";
import type { HttpRequestBlock, HttpResponse } from "../types";
import { ResponseBodyViewer } from "./response-body-viewer";
import { ResponseHeadersTable } from "./response-headers-table";

export default function HttpClientView() {
  const { settings } = useSettingsStore();
  const activeBufferId = useBufferStore.use.activeBufferId();
  const buffers = useBufferStore.use.buffers();
  const responses = useHttpClientStore.use.responses();
  const activeResponseKey = useHttpClientStore.use.activeResponseKey();
  const isExecuting = useHttpClientStore.use.isExecuting();
  const error = useHttpClientStore.use.error();

  const activeBuffer = useMemo(
    () => buffers.find((b) => b.id === activeBufferId) ?? null,
    [buffers, activeBufferId],
  );

  const filePath = activeBuffer?.path ?? "";
  const isHttpFile = filePath.endsWith(".http") || filePath.endsWith(".rest");

  const blocks = useMemo(() => {
    if (!activeBuffer || !hasTextContent(activeBuffer) || !isHttpFile) return [];
    return parseHttpFile(activeBuffer.content);
  }, [activeBuffer, isHttpFile]);

  const activeResponse = activeResponseKey ? responses[activeResponseKey] : null;

  if (!settings.coreFeatures.httpClient || !isHttpFile || blocks.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-text-lighter ui-text-sm">
        {!settings.coreFeatures.httpClient
          ? "HTTP Client feature is disabled."
          : !isHttpFile
            ? "Open a .http file to use the HTTP Client."
            : "No requests found in this file."}
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex flex-1 overflow-hidden">
        <RequestList
          blocks={blocks}
          filePath={filePath}
          responses={responses}
          isExecuting={isExecuting}
        />
        <ResponsePanel response={activeResponse} error={error} isExecuting={isExecuting} />
      </div>
    </div>
  );
}

function RequestList({
  blocks,
  filePath,
  responses,
  isExecuting,
}: {
  blocks: HttpRequestBlock[];
  filePath: string;
  responses: Record<string, HttpResponse>;
  isExecuting: boolean;
}) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  const handleRun = useCallback(
    async (index: number) => {
      const block = blocks[index];
      if (!block || isExecuting) return;

      const { executeRequest } = useHttpClientStore.getState().actions;
      await executeRequest(filePath, index, block);
    },
    [blocks, filePath, isExecuting],
  );

  return (
    <div className="w-72 shrink-0 overflow-y-auto border-r border-border/70 p-3">
      <div className="mb-2 ui-text-xs font-semibold text-text-lighter uppercase tracking-wider">
        Requests
      </div>

      {blocks.map((block, index) => {
        const responseKey = `${filePath}:${index}`;
        const hasResponse = responseKey in responses;
        const isSelected = selectedIndex === index;

        return (
          <button
            key={index}
            type="button"
            className={`mb-2 w-full rounded-md border p-2 text-left transition-colors ${
              isSelected
                ? "border-accent bg-accent/10"
                : "border-border/50 bg-primary-bg hover:border-border"
            }`}
            onClick={() => setSelectedIndex(index)}
          >
            <div className="flex items-center justify-between">
              <span
                className={`rounded px-1.5 py-0.5 ui-text-xs font-semibold ${getMethodColor(block.method)}`}
              >
                {block.method}
              </span>

              <button
                type="button"
                className="flex h-6 w-6 items-center justify-center rounded bg-green-500/20 text-green-400 hover:bg-green-500/30 disabled:opacity-40"
                disabled={isExecuting}
                onClick={(event) => {
                  event.stopPropagation();
                  void handleRun(index);
                }}
                title="Send Request"
              >
                <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
                  <path d="M2 1v10l9-5z" />
                </svg>
              </button>
            </div>

            <div className="mt-1 truncate ui-text-xs text-text-lighter">{block.url}</div>

            {hasResponse && <StatusBadge response={responses[responseKey]!} />}
          </button>
        );
      })}
    </div>
  );
}

function ResponsePanel({
  response,
  error,
  isExecuting,
}: {
  response: HttpResponse | null;
  error: string | null;
  isExecuting: boolean;
}) {
  if (isExecuting) {
    return (
      <div className="flex flex-1 items-center justify-center text-text-lighter ui-text-sm">
        Sending request...
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 p-4">
        <div className="rounded-md bg-error/10 px-3 py-2 text-error ui-text-sm">{error}</div>
      </div>
    );
  }

  if (!response) {
    return (
      <div className="flex flex-1 items-center justify-center text-text-lighter ui-text-sm">
        Select a request and click the play button to run it.
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <ResponseMeta response={response} />
      <ResponseTabs response={response} />
    </div>
  );
}

function ResponseMeta({ response }: { response: HttpResponse }) {
  return (
    <div className="shrink-0 border-b border-border/70 p-3">
      <div className="flex items-center gap-2">
        <StatusBadge response={response} />
        <span className="ui-text-xs text-text-lighter">{response.timingMs}ms</span>
        <span className="ui-text-xs text-text-lighter">{formatBytes(response.body.length)}</span>
      </div>

      <div className="mt-1 truncate ui-text-xs text-text-lighter">
        {response.requestMethod} {response.requestUrl}
      </div>
    </div>
  );
}

function ResponseTabs({ response }: { response: HttpResponse }) {
  const [activeTab, setActiveTab] = useState<"body" | "headers">("body");

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex shrink-0 border-b border-border/70">
        <button
          type="button"
          className={`px-3 py-1.5 ui-text-xs ${activeTab === "body" ? "border-b-2 border-accent text-text" : "text-text-lighter hover:text-text"}`}
          onClick={() => setActiveTab("body")}
        >
          Response Body
        </button>
        <button
          type="button"
          className={`px-3 py-1.5 ui-text-xs ${activeTab === "headers" ? "border-b-2 border-accent text-text" : "text-text-lighter hover:text-text"}`}
          onClick={() => setActiveTab("headers")}
        >
          Response Headers
        </button>
      </div>

      <div className="flex-1 overflow-auto p-3">
        {activeTab === "body" ? (
          <ResponseBodyViewer body={response.body} contentType={response.contentType} />
        ) : (
          <ResponseHeadersTable headers={response.headers} />
        )}
      </div>
    </div>
  );
}

function StatusBadge({ response }: { response: HttpResponse }) {
  const color =
    response.status < 300
      ? "text-green-400"
      : response.status < 400
        ? "text-yellow-400"
        : "text-red-400";

  return (
    <span className={`ui-text-xs font-medium ${color}`}>
      {response.status} {response.statusText}
    </span>
  );
}

function getMethodColor(method: string): string {
  switch (method.toUpperCase()) {
    case "GET":
      return "bg-blue-500/20 text-blue-400";
    case "POST":
      return "bg-green-500/20 text-green-400";
    case "PUT":
      return "bg-orange-500/20 text-orange-400";
    case "DELETE":
      return "bg-red-500/20 text-red-400";
    case "PATCH":
      return "bg-yellow-500/20 text-yellow-400";
    default:
      return "bg-gray-500/20 text-gray-400";
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
