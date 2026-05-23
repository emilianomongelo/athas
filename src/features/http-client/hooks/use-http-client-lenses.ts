import { useCallback, useEffect, useRef, useState } from "react";
import { useBufferStore } from "@/features/editor/stores/buffer-store";
import { hasTextContent } from "@/features/panes/types/pane-content";
import type { CodeLensItem } from "@/features/editor/lsp/use-code-lens";
import { parseHttpFile } from "../services/http-parser";
import { useSettingsStore } from "@/features/settings/store";

const HTTP_LENS_DEBOUNCE_MS = 300;
const MAX_FILE_SIZE_FOR_LENSES = 1_000_000;

export function useHttpClientLenses(
  filePath: string | undefined,
  enabled: boolean,
): CodeLensItem[] {
  const [lenses, setLenses] = useState<CodeLensItem[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const parseRunIdRef = useRef(0);

  const isHttpFile = filePath?.endsWith(".http") || filePath?.endsWith(".rest");

  const computeLenses = useCallback(() => {
    if (!filePath || !enabled || !isHttpFile) {
      setLenses([]);
      return;
    }

    const buffer = useBufferStore.getState().buffers.find((b) => b.path === filePath);
    if (!buffer || !hasTextContent(buffer)) {
      setLenses([]);
      return;
    }

    const content = buffer.content;
    if (!content || content.length > MAX_FILE_SIZE_FOR_LENSES) {
      setLenses([]);
      return;
    }

    const runId = ++parseRunIdRef.current;
    const blocks = parseHttpFile(content);

    if (runId !== parseRunIdRef.current) return;

    const items: CodeLensItem[] = blocks.map((block, index) => ({
      line: block.startLine,
      title: "Send Request",
      command: "http-client.run",
      arguments: [index],
      kind: "http-run" as const,
    }));

    setLenses(items);
  }, [filePath, enabled, isHttpFile]);

  useEffect(() => {
    void computeLenses();
  }, [computeLenses]);

  useEffect(() => {
    if (!filePath || !enabled || !isHttpFile) return;

    const unsubscribe = useBufferStore.subscribe((state, prev) => {
      if (state.buffers === prev.buffers) return;

      const buffer = state.buffers.find((b) => b.path === filePath);
      if (!buffer || !hasTextContent(buffer)) return;

      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        computeLenses();
      }, HTTP_LENS_DEBOUNCE_MS);
    });

    return () => {
      unsubscribe();
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [filePath, enabled, isHttpFile, computeLenses]);

  return lenses;
}

export function useIsHttpFile(filePath: string | undefined): boolean {
  const { settings } = useSettingsStore();
  const enabled = settings.coreFeatures.httpClient ?? false;

  if (!enabled || !filePath) return false;
  return filePath.endsWith(".http") || filePath.endsWith(".rest");
}
