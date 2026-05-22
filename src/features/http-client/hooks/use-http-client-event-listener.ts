import { useEffect } from "react";
import { useBufferStore } from "@/features/editor/stores/buffer-store";
import { hasTextContent } from "@/features/panes/types/pane-content";
import { useUIState } from "@/features/window/stores/ui-state-store";
import { useHttpClientStore } from "../stores/http-client-store";
import { parseHttpFile } from "../services/http-parser";

export function useHttpClientEventListener() {
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
