import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import { createSelectors } from "@/utils/zustand-selectors";

export interface EnvironmentVariables {
  [key: string]: string;
}

export interface EnvironmentData {
  [environmentName: string]: EnvironmentVariables;
}

interface EnvironmentState {
  environments: EnvironmentData;
  selectedEnvironment: string;
}

interface EnvironmentActions {
  setEnvironments: (envs: EnvironmentData) => void;
  setSelectedEnvironment: (name: string) => void;
}

const environmentStore = create(
  immer<EnvironmentState & { actions: EnvironmentActions }>((set) => ({
    environments: {},
    selectedEnvironment: "",
    actions: {
      setEnvironments: (envs: EnvironmentData) => {
        set((state) => {
          state.environments = envs;
          // Auto-select the first environment if none is selected or current is gone
          const keys = Object.keys(envs);
          if (keys.length > 0) {
            if (!state.selectedEnvironment || !envs[state.selectedEnvironment]) {
              state.selectedEnvironment = keys[0] ?? "";
            }
          } else {
            state.selectedEnvironment = "";
          }
        });
      },

      setSelectedEnvironment: (name: string) => {
        set((state) => {
          state.selectedEnvironment = name;
        });
      },
    },
  })),
);

export const useEnvironmentStore = createSelectors(environmentStore);
