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
    triggerCharacters: ["{", " ", "."],
    provideCompletionItems: (model, position, _context, _token) => {
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

      // Extract what the user has typed so far after `{{`
      // Remove any leading/trailing spaces but allow partial variable names
      const typed = textAfterOpen.replace(/^\s+|\s+$/g, "");

      // Get current environment variables
      const envState = useEnvironmentStore.getState();
      const activeEnv = envState.selectedEnvironment;
      const envVars =
        activeEnv && envState.environments[activeEnv] ? envState.environments[activeEnv] : null;

      if (!envVars) return { suggestions: [] };

      const varNames = Object.keys(envVars);

      // Filter by typed prefix
      const filtered = typed
        ? varNames.filter((name) => name.toLowerCase().includes(typed.toLowerCase()))
        : varNames;

      if (filtered.length === 0) return { suggestions: [] };

      // Calculate the range from `{{` to current cursor position
      // Monaco uses 1-based columns
      const range = {
        startLineNumber: position.lineNumber,
        startColumn: lastOpen + 1,
        endLineNumber: position.lineNumber,
        endColumn: position.column,
      };

      const suggestions: languages.CompletionItem[] = filtered.map((varName) => {
        const value = envVars[varName]!;
        return {
          label: varName,
          kind: languages.CompletionItemKind.Variable,
          detail: `${envVars[varName]} (${activeEnv})`,
          documentation: `**${varName}** = \`${value}\`\n\nEnvironment: \`${activeEnv}\``,
          insertText: `{{${varName}}}`,
          range,
        };
      });

      return { suggestions };
    },
  });
}
