import { languages } from "monaco-editor";
import { useEnvironmentStore } from "@/features/http-client/stores/environment-store";

let registered = false;

/**
 * Register a Monaco completion provider for .http files that suggests
 * environment variables when the user types `{{`.
 */
export function registerHttpVariableCompletionProvider(): void {
  if (registered) {
    console.log("[http-completion] Already registered, skipping");
    return;
  }
  registered = true;

  console.log("[http-completion] Registering completion provider for 'http' language");

  const disposable = languages.registerCompletionItemProvider("http", {
    triggerCharacters: ["{"],

    provideCompletionItems: (model, position, _context, _token) => {
      console.log("[http-completion] provideCompletionItems called at", {
        line: position.lineNumber,
        col: position.column,
        languageId: model.getLanguageId(),
      });
      try {
        const envState = useEnvironmentStore.getState();
        const activeEnv = envState.selectedEnvironment;
        const envVars =
          activeEnv && envState.environments[activeEnv] ? envState.environments[activeEnv] : null;

        console.log(
          "[http-completion] Active env:",
          activeEnv,
          "Vars:",
          envVars ? Object.keys(envVars) : "none",
        );

        if (!envVars || Object.keys(envVars).length === 0) {
          console.log("[http-completion] No env vars available, returning empty");
          return { suggestions: [] };
        }

        // Get text from start of line to cursor
        const textUntilPosition = model.getValueInRange({
          startLineNumber: position.lineNumber,
          startColumn: 1,
          endLineNumber: position.lineNumber,
          endColumn: position.column,
        });

        console.log("[http-completion] Text until position:", JSON.stringify(textUntilPosition));

        // Find the last `{{` before cursor
        const lastOpen = textUntilPosition.lastIndexOf("{{");
        if (lastOpen === -1) {
          console.log("[http-completion] No '{{' found before cursor");
          return { suggestions: [] };
        }

        // Check there's no `}}` between the `{{` and cursor
        const textAfterOpen = textUntilPosition.slice(lastOpen + 2);
        if (textAfterOpen.includes("}}")) {
          console.log("[http-completion] '}}' already closed");
          return { suggestions: [] };
        }

        console.log(
          "[http-completion] Found '{{' at position",
          lastOpen,
          "textAfterOpen:",
          JSON.stringify(textAfterOpen),
        );

        // Range from `{{` start to cursor (Monaco 1-based columns)
        const range = {
          startLineNumber: position.lineNumber,
          startColumn: lastOpen + 1,
          endLineNumber: position.lineNumber,
          endColumn: position.column,
        };

        // Return ALL variables - Monaco will filter by what the user typed after `{{`
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

        console.log("[http-completion] Returning", suggestions.length, "suggestions");
        return { suggestions };
      } catch (error) {
        console.error("[http-completion] Error in provideCompletionItems:", error);
        return { suggestions: [] };
      }
    },
  });

  console.log("[http-completion] Provider registered, disposable:", !!disposable);

  // Also log all registered languages for debugging
  const allLanguages = languages.getLanguages();
  const httpLang = allLanguages.find((l) => l.id === "http");
  console.log("[http-completion] HTTP language registered:", !!httpLang, httpLang);
}
