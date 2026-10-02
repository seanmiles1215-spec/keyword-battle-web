import { describe, expect, it } from "vitest";
import { resolvePageEntryHref } from "../src/lib/pages-entry";

describe("Pages entry URL routing", () => {
  it("routes /tool/ to the new-report app route on a GitHub Pages project path", () => {
    expect(resolvePageEntryHref(
      "tool",
      "https://seanmiles1215-spec.github.io/keyword-battle-web/tool/",
    )).toBe("https://seanmiles1215-spec.github.io/keyword-battle-web/#/new-report");
  });

  it("routes /tool/ to the new-report app route on a custom domain", () => {
    expect(resolvePageEntryHref("tool", "https://milessean.com/tool/")).toBe(
      "https://milessean.com/#/new-report",
    );
  });

  it("preserves a regular report id under a GitHub Pages project path", () => {
    expect(resolvePageEntryHref(
      "report",
      "https://seanmiles1215-spec.github.io/keyword-battle-web/report/?id=report-123",
    )).toBe("https://seanmiles1215-spec.github.io/keyword-battle-web/#/reports/report-123");
  });

  it("encodes reserved characters in the report id", () => {
    expect(resolvePageEntryHref(
      "report",
      "https://milessean.com/report/?id=led%20lights%2Fstrip%25",
    )).toBe("https://milessean.com/#/reports/led%20lights%2Fstrip%25");
  });

  it.each([
    "https://milessean.com/report/",
    "https://milessean.com/report/?id=",
    "https://seanmiles1215-spec.github.io/keyword-battle-web/report/",
    "https://seanmiles1215-spec.github.io/keyword-battle-web/report/?id=",
  ])("returns to the app root when report id is missing or empty: %s", (url) => {
    const expectedRoot = url.includes("github.io/keyword-battle-web/")
      ? "https://seanmiles1215-spec.github.io/keyword-battle-web/"
      : "https://milessean.com/";
    expect(resolvePageEntryHref("report", url)).toBe(expectedRoot);
  });
});
