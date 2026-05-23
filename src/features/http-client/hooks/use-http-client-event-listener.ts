import { useEffect, useRef } from "react";
import { useBufferStore } from "@/features/editor/stores/buffer-store";
import { hasTextContent } from "@/features/panes/types/pane-content";
import { useUIState } from "@/features/window/stores/ui-state-store";
import { useHttpClientStore } from "../stores/http-client-store";
import { parseHttpFile } from "../services/http-parser";
import { loadEnvironments } from "../services/environment-service";

export function useHttpClientEventListener() {
  const loadedPathsRef = useRef<Set<string>>(new Set());

  // Load environments when a .http file buffer is opened
  useEffect(() => {
    const unsub = useBufferStore.subscribe((state) => {
      for (const buffer of state.buffers) {
        if (!hasTextContent(buffer)) continue;
        const isHttpFile = buffer.path.endsWith(".http") || buffer.path.endsWith(".rest");
        if (!isHttpFile) continue;

        if (!loadedPathsRef.current.has(buffer.path)) {
          loadedPathsRef.current.add(buffer.path);
          void loadEnvironments(buffer.path);
        }
      }
    });

    // Also check existing buffers
    const existing = useBufferStore.getState().buffers;
    for (const buffer of existing) {
      if (!hasTextContent(buffer)) continue;
      const isHttpFile = buffer.path.endsWith(".http") || buffer.path.endsWith(".rest");
      if (!isHttpFile) continue;
      if (!loadedPathsRef.current.has(buffer.path)) {
        loadedPathsRef.current.add(buffer.path);
        void loadEnvironments(buffer.path);
      }
    }

    return () => unsub();
  }, []);

  useEffect(() => {
    const handleRunRequest = (event: Event) => {
      const detail = (event as CustomEvent).detail as
        | {
            filePath: string;
            blockIndex: number;
          }
        | undefined;

      if (!detail?.filePath || detail.blockIndex === undefined) return;

      const buffers = useBufferStore.getState().buffers;
      const buffer = buffers.find((b) => b.path === detail.filePath);
      if (!buffer || !hasTextContent(buffer)) return;

      // Ensure environments are loaded before executing
      void loadEnvironments(detail.filePath);

      const blocks = parseHttpFile(buffer.content);
      const block = blocks[detail.blockIndex];
      if (!block) return;

      const uiState = useUIState.getState();
      uiState.setIsBottomPaneVisible(true);
      uiState.setBottomPaneActiveTab("httpClient");

      const { executeRequest } = useHttpClientStore.getState().actions;
      void executeRequest(detail.filePath, detail.blockIndex, block);
    };

    window.addEventListener("http-client-run", handleRunRequest);
    return () => window.removeEventListener("http-client-run", handleRunRequest);
  }, []);
}
