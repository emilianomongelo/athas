import { useCallback, useEffect, useRef, useState } from "react";
import { Check } from "@phosphor-icons/react";
import { useEnvironmentStore } from "@/features/http-client/stores/environment-store";
import { loadEnvironments } from "@/features/http-client/services/environment-service";
import { Button } from "@/ui/button";
import { Dropdown } from "@/ui/dropdown";
import { cn } from "@/utils/cn";

interface EnvironmentSelectorProps {
  filePath: string | undefined;
}

const statusChipClass =
  "ui-font inline-flex h-5 items-center self-center rounded-md border border-transparent px-1.5 ui-text-xs leading-none text-text-lighter transition-colors hover:bg-hover hover:text-text";

export function EnvironmentSelector({ filePath }: EnvironmentSelectorProps) {
  const environments = useEnvironmentStore.use.environments();
  const selectedEnvironment = useEnvironmentStore.use.selectedEnvironment();
  const setSelectedEnvironment = useEnvironmentStore.getState().actions.setSelectedEnvironment;
  const [envNames, setEnvNames] = useState<string[]>([]);
  const [initialized, setInitialized] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Load environments when the .http file changes
  useEffect(() => {
    if (!filePath) return;

    const isHttpFile = filePath.endsWith(".http") || filePath.endsWith(".rest");
    if (!isHttpFile) return;

    setInitialized(false);
    loadEnvironments(filePath).then(() => {
      setInitialized(true);
    });
  }, [filePath]);

  // Watch for store changes and sync environment names
  useEffect(() => {
    setEnvNames(Object.keys(environments));
  }, [environments]);

  const handleSelect = useCallback(
    (value: string) => {
      setSelectedEnvironment(value);
      setIsOpen(false);
    },
    [setSelectedEnvironment],
  );

  if (!filePath) return null;

  const isHttpFile = filePath.endsWith(".http") || filePath.endsWith(".rest");
  if (!isHttpFile || !initialized) return null;

  if (envNames.length === 0) return null;

  return (
    <div className="relative flex h-5 items-center self-center">
      <Button
        ref={buttonRef}
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        variant="ghost"
        compact
        className={cn(statusChipClass, "min-w-0 cursor-pointer", isOpen && "bg-hover text-text")}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        tooltip="Select environment"
        tooltipSide="bottom"
      >
        {selectedEnvironment || envNames[0] || "No env"}
      </Button>
      <Dropdown
        isOpen={isOpen}
        anchorRef={buttonRef}
        anchorSide="bottom"
        anchorAlign="end"
        onClose={() => setIsOpen(false)}
        className="overflow-hidden rounded-lg p-1.5"
        style={{ minWidth: 120 }}
      >
        <div className="max-h-[200px] overflow-y-auto">
          {envNames.map((name) => (
            <Button
              key={name}
              type="button"
              onClick={() => handleSelect(name)}
              variant="ghost"
              compact
              className={cn(
                "flex w-full items-center justify-between gap-3 rounded-lg px-2.5 py-1.5 text-left ui-text-xs text-text transition-colors hover:bg-hover",
                name === selectedEnvironment && "text-accent",
              )}
              role="option"
              aria-selected={name === selectedEnvironment}
            >
              <span className="truncate">{name}</span>
              {name === selectedEnvironment && <Check className="shrink-0 text-accent" />}
            </Button>
          ))}
        </div>
      </Dropdown>
    </div>
  );
}
