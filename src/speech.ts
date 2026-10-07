export interface SpeechResultEvent {
  results: { transcript: string }[][];
}
export interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: SpeechResultEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
declare global {
  interface Window {
    SpeechRecognition?: new () => Recognition;
    webkitSpeechRecognition?: new () => Recognition;
  }
}
export function recognitionConstructor() {
  return window.SpeechRecognition ?? window.webkitSpeechRecognition;
}
export function readAloud(text: string) {
  if (!window.speechSynthesis || typeof SpeechSynthesisUtterance === "undefined")
    throw new Error("Spoken replies are not available in this browser. You can read the answer here.");
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(
    text.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1").replace(/[*#]/g, ""),
  );
  utterance.lang = "en-IN";
  utterance.rate = 0.94;
  const voices = window.speechSynthesis.getVoices();
  const local =
    voices.find((v) => v.localService && v.lang === "en-IN" && /female|heera|neerja|priya|veena/i.test(v.name)) ??
    voices.find((v) => v.localService && v.lang.startsWith("en") && /female|zira|samantha|susan|hazel|aria|jenny/i.test(v.name)) ??
    voices.find((v) => v.localService && v.lang === "en-IN") ??
    voices.find((v) => v.localService && v.lang.startsWith("en"));
  if (!local)
    throw new Error(
      "A local English voice is not available on this device. You can read the answer here.",
    );
  utterance.voice = local;
  window.speechSynthesis.speak(utterance);
}
