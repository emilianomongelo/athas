import { describe, expect, it } from "bun:test";
import { parseHttpFile } from "../services/http-parser";

describe("parseHttpFile", () => {
  it("parses a single GET request", () => {
    const content = "GET https://api.example.com/users";
    const blocks = parseHttpFile(content);

    expect(blocks).toHaveLength(1);
    expect(blocks[0]!.method).toBe("GET");
    expect(blocks[0]!.url).toBe("https://api.example.com/users");
    expect(blocks[0]!.headers).toEqual({});
    expect(blocks[0]!.body).toBe("");
  });

  it("parses a request with headers", () => {
    const content = [
      "POST https://api.example.com/data",
      "Content-Type: application/json",
      "Authorization: Bearer token123",
      "",
      '{"key": "value"}',
    ].join("\n");

    const blocks = parseHttpFile(content);

    expect(blocks).toHaveLength(1);
    expect(blocks[0]!.method).toBe("POST");
    expect(blocks[0]!.headers).toEqual({
      "Content-Type": "application/json",
      Authorization: "Bearer token123",
    });
    expect(blocks[0]!.body).toBe('{"key": "value"}');
  });

  it("parses multiple requests separated by ###", () => {
    const content = [
      "GET https://api.example.com/users",
      "",
      "### Get User by ID",
      "GET https://api.example.com/users/1",
      "Accept: application/json",
    ].join("\n");

    const blocks = parseHttpFile(content);

    expect(blocks).toHaveLength(2);
    expect(blocks[0]!.method).toBe("GET");
    expect(blocks[0]!.url).toBe("https://api.example.com/users");
    expect(blocks[1]!.method).toBe("GET");
    expect(blocks[1]!.url).toBe("https://api.example.com/users/1");
  });

  it("handles blank lines between requests", () => {
    const content = [
      "GET https://api.example.com/users",
      "",
      "",
      "### ",
      "",
      "POST https://api.example.com/data",
    ].join("\n");

    const blocks = parseHttpFile(content);

    expect(blocks).toHaveLength(2);
  });

  it("returns empty array for empty content", () => {
    expect(parseHttpFile("")).toEqual([]);
    expect(parseHttpFile("\n\n\n")).toEqual([]);
  });

  it("returns empty array for content with no valid requests", () => {
    expect(parseHttpFile("### Just a comment")).toEqual([]);
    expect(parseHttpFile("Some random text")).toEqual([]);
  });

  it("parses all supported HTTP methods", () => {
    for (const method of ["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS"]) {
      const content = `${method} https://api.example.com/test`;
      const blocks = parseHttpFile(content);
      expect(blocks).toHaveLength(1);
      expect(blocks[0]!.method).toBe(method);
    }
  });

  it("handles methods case-insensitively", () => {
    const content = "post https://api.example.com/data";
    const blocks = parseHttpFile(content);

    expect(blocks).toHaveLength(1);
    expect(blocks[0]!.method).toBe("POST");
  });

  it("captures line numbers for each block", () => {
    const content = [
      "GET https://api.example.com/first",
      "",
      "### separator",
      "",
      "POST https://api.example.com/second",
      "Content-Type: application/json",
      "",
      "body here",
    ].join("\n");

    const blocks = parseHttpFile(content);

    expect(blocks).toHaveLength(2);
    expect(blocks[0]!.startLine).toBe(0);
    expect(blocks[0]!.endLine).toBe(2);
    expect(blocks[1]!.startLine).toBe(3);
    expect(blocks[1]!.endLine).toBe(8);
  });

  it("parses a real-world .http file", () => {
    const content = [
      "### Get Request to some endpoint",
      "POST https://some-api.com/v1/some-endpoint",
      "Content-Type: application/json",
      "X-Api-Key: XXXX",
      "Some-Other-Header: FooBar",
      "",
      "### Post Request to some endpoint - ### worked as divisor",
      "POST https://some-api.com/v1/some-endpoint",
      "Content-Type: application/json",
      "X-Api-Key: XXXX",
      "Some-Other-Header: FooBar",
      "",
      "{",
      '    "some_key": "some_value"',
      "}",
    ].join("\n");

    const blocks = parseHttpFile(content);

    expect(blocks).toHaveLength(2);
    expect(blocks[0]!.method).toBe("POST");
    expect(blocks[0]!.url).toBe("https://some-api.com/v1/some-endpoint");
    expect(blocks[0]!.headers["Content-Type"]).toBe("application/json");
    expect(blocks[0]!.headers["X-Api-Key"]).toBe("XXXX");

    expect(blocks[1]!.method).toBe("POST");
    expect(blocks[1]!.body).toContain('"some_key"');
  });
});
