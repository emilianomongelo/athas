import { useMemo, useState } from "react";

interface ResponseBodyViewerProps {
  body: string;
  contentType: string;
}

export function ResponseBodyViewer({ body, contentType }: ResponseBodyViewerProps) {
  const [mode, setMode] = useState<"pretty" | "raw">("pretty");

  const formattedBody = useMemo(() => {
    if (mode === "raw") return body;

    if (contentType.includes("json") || looksLikeJson(body)) {
      try {
        return JSON.stringify(JSON.parse(body), null, 2);
      } catch {
        return body;
      }
    }

    return body;
  }, [body, contentType, mode]);

  const maxDisplayLength = 1_000_000;
  const isTruncated = body.length > maxDisplayLength;
  const displayBody = isTruncated ? body.slice(0, maxDisplayLength) : formattedBody;

  return (
    <div className="h-full">
      <div className="mb-2 flex items-center gap-2">
        <button
          type="button"
          className={`rounded px-2 py-0.5 ui-text-xs ${mode === "pretty" ? "bg-accent/20 text-accent" : "text-text-lighter hover:text-text"}`}
          onClick={() => setMode("pretty")}
        >
          Pretty
        </button>
        <button
          type="button"
          className={`rounded px-2 py-0.5 ui-text-xs ${mode === "raw" ? "bg-accent/20 text-accent" : "text-text-lighter hover:text-text"}`}
          onClick={() => setMode("raw")}
        >
          Raw
        </button>
      </div>

      <pre className="editor-font ui-text-sm whitespace-pre-wrap break-words text-text">
        {displayBody}
      </pre>

      {isTruncated && (
        <div className="mt-2 rounded-md bg-yellow-500/10 px-3 py-1.5 text-yellow-400 ui-text-xs">
          Response body truncated at 1 MB. {formatBytes(body.length)} total.
        </div>
      )}
    </div>
  );
}

function looksLikeJson(text: string): boolean {
  const trimmed = text.trim();
  return (
    (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
    (trimmed.startsWith("[") && trimmed.endsWith("]"))
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
