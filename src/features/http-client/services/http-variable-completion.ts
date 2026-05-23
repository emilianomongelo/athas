import { languages } from "monaco-editor";
import { useEnvironmentStore } from "@/features/http-client/stores/environment-store";

let registered = false;

/**
 * Register a Monaco completion provider for .http files that suggests
 * environment variables when the user types `{{`.
 */
export function registerHttpVariableCompletionProvider(): void {
  if (registered) return;
  registered = true;

  languages.registerCompletionItemProvider("http", {
    triggerCharacters: ["{"],

    provideCompletionItems: (model, position, _context, _token) => {
      try {
        const envState = useEnvironmentStore.getState();
        const activeEnv = envState.selectedEnvironment;
        const envVars =
          activeEnv && envState.environments[activeEnv] ? envState.environments[activeEnv] : null;

        if (!envVars || Object.keys(envVars).length === 0) return { suggestions: [] };

        // Get text from start of line to cursor
        const textUntilPosition = model.getValueInRange({
          startLineNumber: position.lineNumber,
          startColumn: 1,
          endLineNumber: position.lineNumber,
          endColumn: position.column,
        });

        // Find the last `{{` before cursor
        const lastOpen = textUntilPosition.lastIndexOf("{{");
        if (lastOpen === -1) return { suggestions: [] };

        // Check there's no `}}` between the `{{` and cursor
        const textAfterOpen = textUntilPosition.slice(lastOpen + 2);
        if (textAfterOpen.includes("}}")) return { suggestions: [] };

        // Range from `{{` start to cursor (Monaco 1-based columns)
        const range = {
          startLineNumber: position.lineNumber,
          startColumn: lastOpen + 1,
          endLineNumber: position.lineNumber,
          endColumn: position.column,
        };

        // Let Monaco filter by what the user typed after `{{`
        const suggestions: languages.CompletionItem[] = Object.keys(envVars).map((varName) => {
          const value = envVars[varName]!;
          return {
            label: varName,
            kind: languages.CompletionItemKind.Variable,
            detail: `${value} (${activeEnv})`,
            documentation: `${varName} = ${value} (${activeEnv})`,
            insertText: `{{${varName}}}`,
            range,
          };
        });

        return { suggestions };
      } catch {
        return { suggestions: [] };
      }
    },
  });
}
