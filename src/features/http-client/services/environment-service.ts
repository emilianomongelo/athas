import { exists } from "@tauri-apps/plugin-fs";
import { useFileSystemStore } from "@/features/file-system/controllers/store";
import { readFileContent } from "@/features/file-system/controllers/file-operations";
import { getDirName, joinPath, normalizePath } from "@/utils/path-helpers";
import { useEnvironmentStore } from "../stores/environment-store";

const ENV_FILENAME = "http-client.env.json";

/**
 * Resolve the path to http-client.env.json relative to the given .http file.
 * Checks the directory of the .http file first, then the workspace root.
 */
async function resolveEnvFilePath(httpFilePath: string): Promise<string | null> {
  const httpDir = getDirName(httpFilePath);
  const dirCandidates = [normalizePath(httpDir)];

  const rootFolder = useFileSystemStore.getState().rootFolderPath;
  if (rootFolder) {
    const normalizedRoot = normalizePath(rootFolder);
    if (!dirCandidates.includes(normalizedRoot)) {
      dirCandidates.push(normalizedRoot);
    }
  }

  for (const dir of dirCandidates) {
    const candidatePath = joinPath(dir, ENV_FILENAME);
    try {
      const fileExists = await exists(candidatePath);
      if (fileExists) return candidatePath;
    } catch {
      // Ignore errors for individual candidates
    }
  }

  return null;
}

/**
 * Load environments from http-client.env.json, resolving it relative to the
 * given .http file path. Updates the environment store with the parsed data.
 */
export async function loadEnvironments(httpFilePath: string): Promise<void> {
  try {
    const envFilePath = await resolveEnvFilePath(httpFilePath);
    if (!envFilePath) {
      useEnvironmentStore.getState().actions.setEnvironments({});
      return;
    }

    const content = await readFileContent(envFilePath);
    const parsed = JSON.parse(content);

    // Validate shape: Record<string, Record<string, string>>
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      useEnvironmentStore.getState().actions.setEnvironments({});
      return;
    }

    const envs: Record<string, Record<string, string>> = {};
    for (const [envName, vars] of Object.entries(parsed)) {
      if (typeof vars === "object" && vars !== null && !Array.isArray(vars)) {
        envs[envName] = vars as Record<string, string>;
      }
    }

    useEnvironmentStore.getState().actions.setEnvironments(envs);
  } catch {
    useEnvironmentStore.getState().actions.setEnvironments({});
  }
}

/**
 * Substitute {{variable}} patterns in a string with values from the currently
 * selected environment. Leaves unknown variables as-is.
 */
export function substituteVariables(
  template: string,
  environments: Record<string, Record<string, string>>,
  selectedEnv: string,
): string {
  const vars = environments[selectedEnv];
  if (!vars) return template;

  return template.replace(/\{\{(\w+)\}\}/g, (match, varName: string) => {
    return varName in vars ? vars[varName]! : match;
  });
}

/**
 * Get the list of variable names available in the currently selected environment.
 */
export function getCurrentEnvironmentVariables(): string[] {
  const state = useEnvironmentStore.getState();
  const vars = state.environments[state.selectedEnvironment];
  return vars ? Object.keys(vars) : [];
}

/**
 * Get the environment names available.
 */
export function getEnvironmentNames(): string[] {
  return Object.keys(useEnvironmentStore.getState().environments);
}
