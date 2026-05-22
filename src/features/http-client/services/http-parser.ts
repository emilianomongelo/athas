import type { HttpRequestBlock } from "../types";

const VALID_METHODS = ["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS"] as const;

function isHttpMethod(token: string): token is (typeof VALID_METHODS)[number] {
  return VALID_METHODS.includes(token as (typeof VALID_METHODS)[number]);
}

/**
 * Parses an .http file into request blocks.
 * Format matches IntelliJ HTTP Client:
 * - Requests are separated by ### (with optional comment text after)
 * - First non-empty line: METHOD URL
 * - Subsequent lines until blank line: Headers (Name: Value)
 * - Everything after blank line: Request body
 */
export function parseHttpFile(content: string): HttpRequestBlock[] {
  const blocks: HttpRequestBlock[] = [];
  const lines = content.split("\n");

  let blockStart = 0;

  for (let i = 0; i <= lines.length; i++) {
    const line = i < lines.length ? lines[i] : "";
    const trimmed = line.trim();

    const isSeparator = trimmed.startsWith("###");
    const isEndOfFile = i === lines.length;

    if (isSeparator || isEndOfFile) {
      if (i > blockStart) {
        const block = parseBlock(lines, blockStart, i);
        if (block) {
          blocks.push(block);
        }
      }

      blockStart = i + 1;
    }
  }

  return blocks;
}

function parseBlock(lines: string[], startLine: number, endLine: number): HttpRequestBlock | null {
  const blockLines = lines.slice(startLine, endLine);
  let lineIndex = 0;

  while (lineIndex < blockLines.length && blockLines[lineIndex]!.trim() === "") {
    lineIndex++;
  }

  if (lineIndex >= blockLines.length) return null;

  const requestLine = blockLines[lineIndex]!.trim();
  const parts = requestLine.split(/\s+/);

  if (parts.length < 2) return null;

  const methodToken = parts[0]!.toUpperCase();
  if (!isHttpMethod(methodToken)) return null;

  const method = methodToken;
  const url = parts[1]!;
  lineIndex++;

  const headers: Record<string, string> = {};

  while (lineIndex < blockLines.length && blockLines[lineIndex]!.trim() !== "") {
    const headerLine = blockLines[lineIndex]!.trim();
    const colonIndex = headerLine.indexOf(":");

    if (colonIndex > 0) {
      const key = headerLine.slice(0, colonIndex).trim();
      const value = headerLine.slice(colonIndex + 1).trim();
      headers[key] = value;
    }

    lineIndex++;
  }

  if (lineIndex < blockLines.length && blockLines[lineIndex]!.trim() === "") {
    lineIndex++;
  }

  const bodyLines: string[] = [];
  while (lineIndex < blockLines.length) {
    bodyLines.push(blockLines[lineIndex]!);
    lineIndex++;
  }

  const body = bodyLines.join("\n").trimEnd();

  return {
    method,
    url,
    headers,
    body,
    startLine,
    endLine,
  };
}
