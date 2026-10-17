import { describe, expect, it } from "vitest";
import { formatAnswerCitations, stripProviderCitations } from "../convex/citations";

describe("Server citation formatting", () => {
  it.each([
    "Evidence \u3010cite\u3011turn0search0\u3011.",
    "Evidence \u3010cite\u2020turn0search0\u2020turn0search1\u3011.",
    "Evidence \uE200cite\uE202turn0search0\uE201.",
    "Evidence turn0search0.",
  ])("removes provider syntax from %s", text => {
    expect(stripProviderCitations(text)).toBe("Evidence.");
  });
  it("keeps only references that match the numbered sources list", () => {
    expect(formatAnswerCitations("First [1]. Second [2]. Unknown [3].", 2))
      .toBe("First [1]. Second [2]. Unknown .");
  });
  it("leaves fixed guidance and ordinary text unchanged", () => {
    expect(formatAnswerCitations("Contact your doctor now.", 0)).toBe("Contact your doctor now.");
  });
});
