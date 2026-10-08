import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VoiceConversation, VOICE_PAUSE_MS } from "../src/voice";
import type { Recognition, SpeechResultEvent } from "../src/speech";

class Microphone implements Recognition {
  lang = "";
  continuous = false;
  interimResults = false;
  onresult: Recognition["onresult"] = null;
  onerror: Recognition["onerror"] = null;
  onend: Recognition["onend"] = null;
  onspeechstart: Recognition["onspeechstart"] = null;
  onspeechend: Recognition["onspeechend"] = null;
  start = vi.fn();
  stop = vi.fn();
  abort = vi.fn();
}
const result = (text: string, isFinal = true) => Object.assign([{ transcript: text }], { isFinal });
function fixture() {
  const microphones: Microphone[] = [];
  let draft = "";
  let available = true;
  const onQuestion = vi.fn(async (_text: string) => { draft = ""; });
  const cancelSpeech = vi.fn();
  const onListening = vi.fn();
  const onError = vi.fn();
  const voice = new VoiceConversation({
    createRecognition: () => { const mic = new Microphone(); microphones.push(mic); return mic; },
    getDraft: () => draft,
    canSend: () => available,
    onDraft: text => { draft = text; },
    onQuestion, cancelSpeech, onListening, onError,
  });
  voice.start();
  return { voice, microphones, onQuestion, cancelSpeech, onListening, onError,
    getDraft: () => draft, setAvailable: (value: boolean) => { available = value; } };
}
beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("Hands-free conversation", () => {
  it("keeps the full sentence across a browser stop and waits four seconds", async () => {
    const f = fixture();
    const first = f.microphones[0];
    expect(first.continuous).toBe(true);
    expect(first.interimResults).toBe(true);
    first.onresult?.({ results: [result("My doctor mentioned induction")] });
    await vi.advanceTimersByTimeAsync(2000);
    first.onend?.();
    await vi.advanceTimersByTimeAsync(200);
    expect(f.microphones).toHaveLength(2);
    f.microphones[1].onresult?.({ results: [result("and I want to understand why")] });
    await vi.advanceTimersByTimeAsync(VOICE_PAUSE_MS - 1);
    expect(f.onQuestion).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(f.onQuestion).toHaveBeenCalledExactlyOnceWith("My doctor mentioned induction and I want to understand why");
    expect(f.onListening).toHaveBeenLastCalledWith(true);
    f.voice.stop();
  });

  it("replaces partial words rather than sending or repeating them", async () => {
    const f = fixture();
    const mic = f.microphones[0];
    mic.onspeechstart?.();
    mic.onresult?.({ results: [result("What should", false)] });
    await vi.advanceTimersByTimeAsync(5000);
    expect(f.onQuestion).not.toHaveBeenCalled();
    mic.onresult?.({ results: [result("What should I ask at my next appointment")] });
    await vi.advanceTimersByTimeAsync(VOICE_PAUSE_MS);
    expect(f.onQuestion).toHaveBeenCalledExactlyOnceWith("What should I ask at my next appointment");
    f.voice.stop();
  });

  it("accepts a second turn without another microphone click or duplicate first turn", async () => {
    const f = fixture();
    const mic = f.microphones[0];
    mic.onresult?.({ results: [result("First question")] });
    await vi.advanceTimersByTimeAsync(VOICE_PAUSE_MS);
    mic.onresult?.({ resultIndex: 1, results: [result("First question"), result("Another question")] });
    await vi.advanceTimersByTimeAsync(VOICE_PAUSE_MS);
    expect(f.onQuestion.mock.calls.map(([text]) => text)).toEqual(["First question", "Another question"]);
    expect(mic.start).toHaveBeenCalledTimes(1);
    f.voice.stop();
  });

  it("ignores its own reply but stops speaking as soon as different words arrive", async () => {
    const f = fixture();
    const mic = f.microphones[0];
    const finishSpeaking = f.voice.replyStarted("You can ask your doctor about the options.");
    f.cancelSpeech.mockClear();
    mic.onresult?.({ results: [result("You can ask your doctor")] });
    await vi.advanceTimersByTimeAsync(VOICE_PAUSE_MS);
    expect(f.cancelSpeech).not.toHaveBeenCalled();
    expect(f.onQuestion).not.toHaveBeenCalled();
    mic.onresult?.({ resultIndex: 1, results: [result("You can ask your doctor"), result("Wait, I have another question", false)] });
    expect(f.cancelSpeech).toHaveBeenCalledTimes(1);
    expect(f.getDraft()).toBe("Wait, I have another question");
    finishSpeaking();
    mic.onresult?.({ resultIndex: 1, results: [result("You can ask your doctor"), result("Wait, I have another question")] });
    await vi.advanceTimersByTimeAsync(VOICE_PAUSE_MS);
    expect(f.onQuestion).toHaveBeenCalledExactlyOnceWith("Wait, I have another question");
    f.voice.stop();
  });

  it("holds a new spoken turn during an AI request and sends it when ready", async () => {
    const f = fixture();
    f.setAvailable(false);
    f.microphones[0].onresult?.({ results: [result("My follow-up question")] });
    await vi.advanceTimersByTimeAsync(VOICE_PAUSE_MS + 2000);
    expect(f.onQuestion).not.toHaveBeenCalled();
    expect(f.getDraft()).toBe("My follow-up question");
    f.setAvailable(true);
    f.voice.ready();
    await vi.advanceTimersByTimeAsync(1);
    expect(f.onQuestion).toHaveBeenCalledExactlyOnceWith("My follow-up question");
    f.voice.stop();
  });

  it("stops recognition, retries and pending sends when voice is turned off", async () => {
    const f = fixture();
    const mic = f.microphones[0];
    mic.onresult?.({ results: [result("An unfinished question")] });
    const lateEnd = mic.onend;
    mic.onend?.();
    f.voice.stop();
    lateEnd?.();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(f.microphones).toHaveLength(1);
    expect(f.onQuestion).not.toHaveBeenCalled();
    expect(f.onListening).toHaveBeenLastCalledWith(false);
  });

  it("preserves the draft and stops retrying after a permission error", async () => {
    const f = fixture();
    const mic = f.microphones[0];
    mic.onresult?.({ results: [result("Keep these words")] });
    mic.onerror?.({ error: "not-allowed" });
    mic.onend?.();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(mic.abort).toHaveBeenCalledTimes(1);
    expect(f.getDraft()).toBe("Keep these words");
    expect(f.onQuestion).not.toHaveBeenCalled();
    expect(f.onError).toHaveBeenCalledWith(expect.stringContaining("Check permission"));
    expect(f.microphones).toHaveLength(1);
  });

  it("does not send the same words again after the Send button consumes them", async () => {
    const f = fixture();
    f.microphones[0].onresult?.({ results: [result("Send this question")] });
    f.voice.consumeDraft();
    await vi.advanceTimersByTimeAsync(VOICE_PAUSE_MS);
    expect(f.onQuestion).not.toHaveBeenCalled();
    f.voice.stop();
  });
});
