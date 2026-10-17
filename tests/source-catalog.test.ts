import { describe, it, expect } from "vitest";
import fs from "node:fs";
import { referenceSources } from "../shared/sources";
import { sourceDomains } from "../convex/evidence";
describe("Approved source catalogue", () => {
  it("matches every approved source entry in AGENTS.md", () => {
    const text = fs.readFileSync(new URL("../AGENTS.md", import.meta.url), "utf8").split("### How Tigermom uses these sources")[0];
    const urls = [...text.matchAll(/^\d+\.\s*(https:\/\/\S+)/gm)].map(match => match[1].replace(/[)\]]+$/, ""));
    expect(urls).toHaveLength(24);
    expect(referenceSources.map(source => source.url)).toEqual(urls);
    expect(referenceSources.every(source => source.description.length > 20)).toBe(true);
  });
  it("keeps Evidence Based Birth link-only and news separate from clinical guidance", () => {
    expect(sourceDomains).not.toContain("evidencebasedbirth.com");
    expect(referenceSources.find(source => source.title === "Evidence Based Birth")?.description).toMatch(/link.only/i);
    expect(referenceSources.find(source => source.title === "NICE")?.description).toContain("UK");
    expect(referenceSources.find(source => source.title === "The Hindu")?.description).toMatch(/not clinical guidance/i);
  });
});
