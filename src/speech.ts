export interface SpeechResultEvent {
  resultIndex?: number;
  results: ({ transcript: string }[] & { isFinal?: boolean })[];
}
export interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: SpeechResultEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  onspeechstart?: (() => void) | null;
  onspeechend?: (() => void) | null;
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
export function readAloud(text: string, onEnd?: () => void) {
  if (!window.speechSynthesis || typeof SpeechSynthesisUtterance === "undefined")
    throw new Error("Spoken replies are not available in this browser. You can read the answer here.");
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(
    text.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1").replace(/[*#]/g, ""),
  );
  utterance.lang = "en-IN";
  utterance.rate = 1;
  utterance.pitch = 0.7;
  const voices = window.speechSynthesis.getVoices();
  // Prefer an older local synthetic voice for the requested robotic sound.
  const standard = voices.filter(v => v.localService && v.lang.startsWith("en") && !/natural|neural|online|premium/i.test(v.name));
  const local =
    standard.find(v => /zira|hazel|susan/i.test(v.name)) ??
    standard.find(v => /female|heera|priya|veena/i.test(v.name)) ??
    standard[0] ??
    voices.find((v) => v.localService && v.lang.startsWith("en") && /female|zira|samantha|susan|hazel|aria|jenny/i.test(v.name)) ??
    voices.find((v) => v.localService && v.lang === "en-IN") ??
    voices.find((v) => v.localService && v.lang.startsWith("en"));
  if (!local)
    throw new Error(
      "A local English voice is not available on this device. You can read the answer here.",
    );
  utterance.voice = local;
  utterance.lang = local.lang;
  utterance.onend = () => onEnd?.();
  utterance.onerror = () => onEnd?.();
  window.speechSynthesis.speak(utterance);
}
