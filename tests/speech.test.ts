// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { readAloud } from "../src/speech";
afterEach(() => vi.unstubAllGlobals());

it("prefers a standard local synthetic voice and uses a flatter pitch", () => {
  const standard = { name: "Microsoft Zira", lang: "en-US", localService: true };
  const speak = vi.fn();
  Object.defineProperty(window, "speechSynthesis", { configurable: true, value: {
    cancel: vi.fn(), speak,
    getVoices: () => [
      { name: "Heera Natural", lang: "en-IN", localService: true },
      standard,
      { name: "Neerja Online", lang: "en-IN", localService: false },
    ],
  } });
  vi.stubGlobal("SpeechSynthesisUtterance", class {
    constructor(public text: string) {}
  });
  readAloud("A short reply.");
  expect(speak).toHaveBeenCalledWith(expect.objectContaining({
    voice: standard, pitch: 0.7, rate: 1, lang: "en-US",
  }));
});
