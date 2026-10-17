import type { Recognition } from "./speech";

export const VOICE_PAUSE_MS = 4000;
const normalize = (text: string) => text.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();

type VoiceOptions = {
  createRecognition: () => Recognition;
  getDraft: () => string;
  canSend: () => boolean;
  onDraft: (text: string) => void;
  onQuestion: (text: string) => Promise<void>;
  onListening: (active: boolean) => void;
  onError: (message: string) => void;
  cancelSpeech: () => void;
};

// Owns the microphone lifetime and turn timing. It makes no AI calls itself.
export class VoiceConversation {
  private enabled = false;
  private recognition: Recognition | null = null;
  private pauseTimer: ReturnType<typeof setTimeout> | undefined;
  private restartTimer: ReturnType<typeof setTimeout> | undefined;
  private segments = new Map<number, string>();
  private consumedThrough = 0;
  private carry = "";
  private base = "";
  private utteranceStarted = false;
  private speechActive = false;
  private lastActivity = 0;
  private speakingText = "";
  private echoUntil = 0;
  private replyGeneration = 0;
  revision = 0;

  constructor(private options: VoiceOptions) {}

  start() {
    if (this.enabled) return;
    this.enabled = true;
    this.options.cancelSpeech();
    this.options.onListening(true);
    this.listen();
  }

  stop() {
    this.enabled = false;
    clearTimeout(this.pauseTimer);
    clearTimeout(this.restartTimer);
    this.consumeDraft();
    this.speakingText = "";
    this.echoUntil = 0;
    this.speechActive = false;
    this.replyGeneration++;
    const recognition = this.recognition;
    this.recognition = null;
    if (recognition) {
      recognition.onresult = recognition.onerror = recognition.onend = null;
      recognition.onspeechstart = recognition.onspeechend = null;
      try { recognition.abort(); } catch { /* The browser may have already ended capture. */ }
    }
    this.options.cancelSpeech();
    this.options.onListening(false);
  }

  get hasPendingSpeech() { return this.utteranceStarted; }

  replyStarted(text: string) {
    const generation = ++this.replyGeneration;
    this.speakingText = normalize(text);
    this.echoUntil = Infinity;
    return () => {
      if (generation === this.replyGeneration) this.echoUntil = Date.now() + 600;
    };
  }

  consumeDraft() {
    clearTimeout(this.pauseTimer);
    if (this.segments.size) this.consumedThrough = Math.max(this.consumedThrough, ...Array.from(this.segments.keys(), index => index + 1));
    this.segments.clear();
    this.carry = this.base = "";
    this.utteranceStarted = false;
  }

  ready() { this.schedule(); }

  private words() {
    return [this.base, this.carry, ...Array.from(this.segments.entries()).sort(([a], [b]) => a - b).map(([, text]) => text)]
      .filter(Boolean).join(" ").trim();
  }

  private schedule() {
    clearTimeout(this.pauseTimer);
    if (!this.enabled || !this.utteranceStarted || this.speechActive) return;
    this.pauseTimer = setTimeout(() => {
      if (!this.enabled || this.speechActive || !this.options.canSend()) return;
      const question = this.words();
      if (!question) return;
      this.consumeDraft();
      void this.options.onQuestion(question).catch(() => {
        if (this.enabled) this.options.onError("Busy right now. Try again in a few minutes.");
      });
    }, Math.max(0, VOICE_PAUSE_MS - (Date.now() - this.lastActivity)));
  }

  private listen() {
    if (!this.enabled) return;
    const recognition = this.options.createRecognition();
    this.recognition = recognition;
    recognition.lang = "en-IN";
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.onspeechstart = () => {
      if (!this.enabled || this.recognition !== recognition) return;
      this.speechActive = true;
      this.lastActivity = Date.now();
      clearTimeout(this.pauseTimer);
    };
    recognition.onspeechend = () => {
      if (!this.enabled || this.recognition !== recognition) return;
      this.speechActive = false;
      this.lastActivity = Date.now();
      this.schedule();
    };
    recognition.onresult = event => {
      if (!this.enabled || this.recognition !== recognition) return;
      let received = false;
      for (let index = event.resultIndex ?? 0; index < event.results.length; index++) {
        if (index < this.consumedThrough || event.results[index].isFinal === false) continue;
        const text = event.results[index][0]?.transcript.trim();
        if (!text) { this.segments.delete(index); continue; }
        const normalized = normalize(text);
        // Recognition may hear the speaker. Ignore matching reply fragments,
        // but keep listening so different words can interrupt the reply.
        if (normalized && Date.now() <= this.echoUntil && this.speakingText.includes(normalized)) {
          this.segments.delete(index);
          if (event.results[index].isFinal) this.consumedThrough = index + 1;
          continue;
        }
        if (!this.utteranceStarted) {
          this.utteranceStarted = true;
          this.base = this.options.getDraft().trim();
          this.revision++;
          this.replyGeneration++;
          this.speakingText = "";
          this.echoUntil = 0;
          this.options.cancelSpeech();
        }
        // Android returns cumulative final transcripts. The latest final
        // replaces this recognition's earlier result rather than joining it.
        this.segments.clear();
        this.segments.set(index, text);
        this.speechActive = false;
        received = true;
      }
      if (!received) return;
      this.lastActivity = Date.now();
      this.options.onDraft(this.words());
      this.schedule();
    };
    recognition.onerror = event => {
      if (!this.enabled || this.recognition !== recognition) return;
      if (event.error === "no-speech" || event.error === "aborted") return;
      this.stop();
      this.options.onError("The microphone stopped. Check permission, turn voice on again, or type your question.");
    };
    recognition.onend = () => {
      if (!this.enabled || this.recognition !== recognition) return;
      this.carry = [this.carry, ...Array.from(this.segments.entries()).sort(([a], [b]) => a - b).map(([, text]) => text)].filter(Boolean).join(" ");
      this.segments.clear();
      this.consumedThrough = 0;
      this.speechActive = false;
      this.recognition = null;
      this.schedule();
      // Restart single-utterance recognition automatically. Keep the same
      // draft and pause clock while opening the next listening segment.
      this.restartTimer = setTimeout(() => this.listen(), 200);
    };
    try { recognition.start(); }
    catch {
      this.stop();
      this.options.onError("Microphone could not start. You can type instead.");
    }
  }
}
