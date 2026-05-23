import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import { createSelectors } from "@/utils/zustand-selectors";
import type { HttpClientState, HttpRequestBlock, HttpResponse } from "../types";
import { executeHttpRequest } from "../services/http-executor";

function responseKey(filePath: string, blockIndex: number): string {
  return `${filePath}:${blockIndex}`;
}

interface HttpClientActions {
  executeRequest: (
    filePath: string,
    blockIndex: number,
    request: HttpRequestBlock,
  ) => Promise<void>;
  clearResponses: (filePath?: string) => void;
  setActiveResponse: (responseKey: string | null) => void;
}

const httpClientStore = create(
  immer<HttpClientState & { actions: HttpClientActions }>((set) => ({
    responses: {},
    isExecuting: false,
    activeResponseKey: null,
    error: null,
    actions: {
      executeRequest: async (filePath: string, blockIndex: number, request: HttpRequestBlock) => {
        const key = responseKey(filePath, blockIndex);

        set((state) => {
          state.isExecuting = true;
          state.activeResponseKey = key;
          state.error = null;
        });

        try {
          const response: HttpResponse = await executeHttpRequest(request);

          set((state) => {
            state.responses[key] = response;
            state.isExecuting = false;
          });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);

          set((state) => {
            state.isExecuting = false;
            state.error = message;
          });
        }
      },

      clearResponses: (filePath?: string) => {
        set((state) => {
          if (filePath) {
            const prefix = `${filePath}:`;
            for (const key of Object.keys(state.responses)) {
              if (key.startsWith(prefix)) {
                delete state.responses[key];
              }
            }
            if (state.activeResponseKey?.startsWith(prefix)) {
              state.activeResponseKey = null;
            }
          } else {
            state.responses = {};
            state.activeResponseKey = null;
          }
          state.error = null;
        });
      },

      setActiveResponse: (responseKey: string | null) => {
        set((state) => {
          state.activeResponseKey = responseKey;
        });
      },
    },
  })),
);

export const useHttpClientStore = createSelectors(httpClientStore);
