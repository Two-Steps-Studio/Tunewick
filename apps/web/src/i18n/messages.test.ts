import { readFileSync } from "node:fs";
import { join } from "node:path";
import { type MessageFormatElement, parse, TYPE } from "@formatjs/icu-messageformat-parser";
import { describe, expect, it } from "vitest";
import { routing } from "./routing";

type Messages = Record<string, unknown>;

function load(locale: string): Messages {
  return JSON.parse(readFileSync(join(__dirname, "../../messages", `${locale}.json`), "utf8"));
}

function entries(value: unknown, prefix = ""): [string, unknown][] {
  if (typeof value !== "object" || value === null) return [[prefix, value]];
  return Object.entries(value).flatMap(([k, v]) => entries(v, prefix ? `${prefix}.${k}` : k));
}

/** The arguments (name:type) and rich-text tags a message uses - translations must keep them. */
function signature(message: string): string[] {
  const found = new Set<string>();
  const walk = (elements: MessageFormatElement[]) => {
    for (const el of elements) {
      if (el.type === TYPE.literal || el.type === TYPE.pound) continue;
      found.add(`${el.value}:${el.type}`);
      if (el.type === TYPE.tag) walk(el.children);
      if (el.type === TYPE.plural || el.type === TYPE.select) {
        for (const option of Object.values(el.options)) walk(option.value);
      }
    }
  };
  walk(parse(message));
  return [...found].sort();
}

const en = load("en");
const reference = new Map(entries(en));

describe.each(routing.locales)("messages/%s.json", (locale) => {
  const messages = load(locale);
  const own = entries(messages);

  it("defines exactly the English keys", () => {
    expect(own.map(([k]) => k).sort()).toEqual([...reference.keys()].sort());
  });

  it("contains no empty strings", () => {
    expect(own.filter(([, v]) => typeof v === "string" && v.trim() === "").map(([k]) => k)).toEqual(
      [],
    );
  });

  it("keeps every message's arguments and tags", () => {
    const broken = own.flatMap(([key, value]) => {
      const original = reference.get(key);
      if (typeof value !== "string" || typeof original !== "string") return [];
      try {
        const a = signature(value).join(",");
        const b = signature(original).join(",");
        return a === b ? [] : [`${key}: ${a} ≠ ${b}`];
      } catch (error) {
        return [`${key}: ${(error as Error).message}`];
      }
    });
    expect(broken).toEqual([]);
  });
});
