// @vitest-environment jsdom
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "../src/App";
import type { Recognition } from "../src/speech";
import { urgentMessage } from "../convex/urgent";

const state = vi.hoisted(() => ({
  authenticated: false,
  ai: true,
  signIn: vi.fn(),
  signOut: vi.fn(),
  begin: vi.fn(),
  finish: vi.fn(),
  heartbeat: vi.fn(),
  reply: vi.fn(),
  responseFeedback: vi.fn(),
  survey: vi.fn(),
}));
vi.mock("convex/react", async () => {
  const { getFunctionName } = await import("convex/server");
  return {
    useConvexAuth: () => ({
      isAuthenticated: state.authenticated,
      isLoading: false,
    }),
    useQuery: () => ({ sms: false, ai: state.ai }),
    useAction: (reference: Parameters<typeof getFunctionName>[0]) => getFunctionName(reference) === "feedback:submit" ? state.responseFeedback : state.reply,
    useMutation: (reference: Parameters<typeof getFunctionName>[0]) => {
      const name = getFunctionName(reference);
      if (name === "survey:submit") return state.survey;
      return name === "sessions:begin"
        ? state.begin
        : name === "sessions:finish"
          ? state.finish
          : name === "sessions:heartbeat"
            ? state.heartbeat
            : vi.fn();
    },
  };
});
vi.mock("@convex-dev/auth/react", () => ({
  useAuthActions: () => ({ signIn: state.signIn, signOut: state.signOut }),
  useAuthToken: () => null,
}));
beforeEach(() => {
  vi.clearAllMocks();
  state.authenticated = false;
  state.ai = true;
  state.heartbeat.mockResolvedValue(null);
  state.responseFeedback.mockResolvedValue(null);
  state.begin.mockResolvedValue("session-test");
  state.finish.mockResolvedValue(null);
  state.survey.mockResolvedValue(null);
  state.signOut.mockResolvedValue(null);
  state.reply.mockResolvedValue({
    text: "Let’s prepare a question for your care provider.",
    sources: [{ title: "ACOG", url: "https://www.acog.org/womens-health" }],
  });
  Element.prototype.scrollIntoView = vi.fn();
  Object.defineProperty(window, "speechSynthesis", {
    configurable: true,
    value: { cancel: vi.fn(), speak: vi.fn(), getVoices: () => [{ name: "Heera", lang: "en-IN", localService: true }] },
  });
  vi.stubGlobal("SpeechSynthesisUtterance", class {
    text: string;
    constructor(text: string) { this.text = text; }
  });
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); delete window.SpeechRecognition; });
describe("Conversation screens", () => {
  it.each(["A short answer [1].", "A longer explanation with everyday words. ".repeat(30) + "[1]."])("keeps a labelled, usable follow-up box after an answer: %s", async answer => {
    state.authenticated = true;
    state.reply.mockResolvedValueOnce({ text: answer, sources: [{ title: "ACOG", url: "https://www.acog.org/womens-health" }] });
    const user = userEvent.setup();
    render(<App />);
    await user.type(screen.getByRole("textbox", { name: "Your question" }), "Explain birth preparation");
    await user.click(screen.getByRole("button", { name: "Send question" }));
    await screen.findByText("Ask a follow-up question");
    expect(screen.getByRole("textbox", { name: "Your question" }).hasAttribute("disabled")).toBe(false);
    expect(screen.getByRole("button", { name: "Send question" }).textContent).toContain("Send");
    await user.click(screen.getByRole("button", { name: /Read aloud/ }));
    await user.type(screen.getByRole("textbox", { name: "Your question" }), "And what does that mean?");
    expect((screen.getByRole("textbox", { name: "Your question" }) as HTMLTextAreaElement).value).toBe("And what does that mean?");
    expect(screen.getByRole("button", { name: "Send question" }).hasAttribute("disabled")).toBe(false);
    expect(screen.getByRole("link", { name: /\[1\] ACOG/ }).getAttribute("href")).toBe("https://www.acog.org/womens-health");
  });
  it("offers questions only, without an upload control or report starter", () => {
    render(<App />);
    expect(screen.queryByRole("button", { name: "Upload report" })).toBeNull();
    expect(document.querySelector('input[type="file"]')).toBeNull();
    expect(screen.queryByText("Can you help me understand my report?")).toBeNull();
    expect(screen.getByText("Ask Tigermom a question. No sign-up needed.")).toBeTruthy();
  });
  it("opens Privacy notice as the third page and returns to the conversation", async () => {
    const user = userEvent.setup();
    render(<App />);
    const nav = screen.getByRole("navigation", { name: "Main navigation" });
    expect([...nav.querySelectorAll("button")].map(button => button.textContent?.trim())).toEqual(["Your conversation", "Our sources", "Privacy notice"]);
    await user.click(screen.getByRole("button", { name: "Privacy notice" }));
    expect(screen.getByRole("heading", { name: "Privacy notice" })).toBeTruthy();
    expect(screen.getByText(/private step uses your question and relevant conversation/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Read OpenAI's data policy" }).getAttribute("href")).toBe("https://developers.openai.com/api/docs/guides/your-data");
    await user.click(screen.getByRole("button", { name: "Back to your conversation" }));
    expect(screen.getByRole("textbox", { name: "Your question" })).toBeTruthy();
    expect(state.begin).not.toHaveBeenCalled();
  });
  it("shows all approved sources and explains their different roles", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: "Our sources" }));
    const links = document.querySelectorAll(".source-list > a");
    expect(links).toHaveLength(24);
    expect(screen.getByRole("heading", { name: "International Confederation of Midwives" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Health New Zealand" })).toBeTruthy();
    expect(screen.getByText(/Link-only resource/)).toBeTruthy();
    expect(screen.getByText(/UK guidance: identify it/)).toBeTruthy();
    expect(screen.queryByText("Ina May Gaskin")).toBeNull();
  });
  it("lets an urgent reply be rated without removing it or asking another AI question", async () => {
    state.authenticated = true;
    state.ai = false;
    state.reply.mockResolvedValueOnce({ text: urgentMessage, sources: [] });
    const user = userEvent.setup();
    render(<App />);
    await user.type(screen.getByRole("textbox", { name: "Your question" }), "My waters broke");
    await user.click(screen.getByRole("button", { name: "Send question" }));
    const like = await screen.findByRole("button", { name: "Like this response" });
    await user.click(like);
    await waitFor(() => expect(state.responseFeedback).toHaveBeenCalledWith(expect.objectContaining({ answer: urgentMessage, vote: "like" })));
    expect(screen.getByText(urgentMessage)).toBeTruthy();
    expect(state.reply).toHaveBeenCalledTimes(1);
  });
  it("saves one-tap feedback for the selected response, with no follow-up rating questions", async () => {
    state.authenticated = true;
    const user = userEvent.setup();
    render(<App />);
    await user.type(screen.getByRole("textbox", { name: "Your question" }), "Hello");
    await user.click(screen.getByRole("button", { name: "Send question" }));
    const like = await screen.findByRole("button", { name: "Like this response" });
    await user.click(like);
    await waitFor(() => expect(state.responseFeedback).toHaveBeenCalledWith(expect.objectContaining({ sessionId: "session-test", responseKey: "response-1", vote: "like", question: "Hello" })));
    await waitFor(() => expect(like.getAttribute("aria-pressed")).toBe("true"));
    expect(screen.getByText("Thanks for your feedback")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Dislike this response" }));
    await waitFor(() => expect(state.responseFeedback).toHaveBeenLastCalledWith(expect.objectContaining({ vote: "dislike" })));
    expect(screen.queryByText("Why did you dislike this?")).toBeNull();
  });
  it("keeps one question box and no permanent warning", () => {
    render(<App />);
    expect(screen.getAllByRole("textbox", { name: "Your question" })).toHaveLength(1);
    expect(screen.queryByText(urgentMessage)).toBeNull();
    expect(screen.queryByText(/Contact your doctor or hospital now for urgent symptoms/)).toBeNull();
    expect(screen.getAllByRole("button", { name: "Talk to Tigermom" })).toHaveLength(1);
  });
  it("puts an urgent reply beside its question without starting a session when AI is paused", async () => {
    state.ai = false;
    state.reply.mockResolvedValueOnce({ text: urgentMessage, sources: [] });
    const user = userEvent.setup();
    render(<App />);
    await user.type(screen.getByRole("textbox", { name: "Your question" }), "My waters broke");
    await user.click(screen.getByRole("button", { name: "Send question" }));
    const reply = await screen.findByText(urgentMessage);
    expect(reply.closest("article")?.previousElementSibling?.textContent).toContain("My waters broke");
    expect(state.signIn).not.toHaveBeenCalled();
    expect(state.begin).not.toHaveBeenCalled();
    expect(screen.getAllByRole("textbox", { name: "Your question" })).toHaveLength(1);
  });
  it("sends the first typed question after opening the private session", async () => {
    state.authenticated = true;
    const user = userEvent.setup();
    render(<App />);
    await user.type(screen.getByRole("textbox", { name: "Your question" }), "Explain birth preparation");
    await user.click(screen.getByRole("button", { name: "Send question" }));
    await waitFor(() => expect(state.reply).toHaveBeenCalledWith(expect.objectContaining({ text: "Explain birth preparation", sessionId: "session-test" })));
    expect(screen.getAllByRole("textbox", { name: "Your question" })).toHaveLength(1);
  });
  it("returns home when feedback is skipped without forcing Sources", async () => {
    state.authenticated = true;
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: "Talk to Tigermom" }));
    await user.click(await screen.findByRole("button", { name: "Stop conversation" }));
    await user.click(await screen.findByRole("button", { name: "Skip feedback" }));
    expect(screen.queryByRole("heading", { name: "Sources" })).toBeNull();
    expect(screen.getAllByRole("textbox", { name: "Your question" })).toHaveLength(1);
  });
  it("uses the requested start label without testimonials in v1", async () => {
    const user = userEvent.setup();
    render(<App />);
    expect(screen.queryByRole("heading", { name: "Testimonials" })).toBeNull();
    expect(screen.queryByText("I now know what to ask my doctor")).toBeNull();
    expect(screen.getByRole("button", { name: "Talk to Tigermom" })).toBeDefined();
    expect(screen.queryByText("A space to feel heard")).toBeNull();
    expect(screen.queryByText("There?s no question too small.")).toBeNull();
  });
  it("opens the requested Sources page", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: "Our sources" }));
    expect(screen.getByText(/These are Tigermom's approved sources/)).toBeDefined();
    expect(screen.getByRole("link", { name: /FOGSI/ })).toBeDefined();
    expect(state.reply).not.toHaveBeenCalled();
  });
  it("starts a private guest conversation without asking for a phone or code", async () => {
    const user = userEvent.setup();
    state.signIn.mockResolvedValue({ signingIn: true });
    const { rerender } = render(<App />);
    await user.click(
      screen.getByRole("button", { name: /Talk to Tigermom/ }),
    );
    expect(state.begin).not.toHaveBeenCalled();
    state.authenticated = true;
    rerender(<App />);
    expect(
      await screen.findByRole("textbox", { name: "Your question" }),
    ).toBeDefined();
    expect(state.signIn).toHaveBeenCalledWith("anonymous");
    expect(state.begin).toHaveBeenCalledWith({});
    expect(screen.queryByLabelText("Mobile number")).toBeNull();
    expect(screen.queryByLabelText("Verification code")).toBeNull();
  });
  it("shows an answer and sources, then ends and clears a temporary conversation", async () => {
    state.authenticated = true;
    const user = userEvent.setup();
    render(<App />);
    await user.click(
      screen.getByRole("button", { name: /Talk to Tigermom/ }),
    );
    await user.type(
      await screen.findByRole("textbox", { name: "Your question" }),
      "Help me prepare for my visit",
    );
    await user.click(screen.getByRole("button", { name: "Send question" }));
    expect(await screen.findByRole("link", { name: "[1] ACOG" })).toBeDefined();
    expect(window.speechSynthesis.speak).toHaveBeenCalled();
    expect(screen.getByText("Help me prepare for my visit")).toBeDefined();
    await user.click(
      screen.getByRole("button", { name: "Stop conversation" }),
    );
    await waitFor(() =>
      expect(state.finish).toHaveBeenCalledWith({ sessionId: "session-test", surveyToken: expect.stringMatching(/^[a-f0-9]{64}$/) }),
    );
    expect(
      await screen.findByText("Was this conversation useful?"),
    ).toBeDefined();
    expect(screen.queryByText("Help me prepare for my visit")).toBeNull();
    expect(state.signOut).toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Yes, it helped" }));
    await user.selectOptions(
      screen.getByLabelText("What best describes how you feel?"),
      "I feel clearer",
    );
    state.survey.mockRejectedValueOnce(new Error("Synthetic connection failure"));
    await user.click(screen.getByRole("button", { name: "Submit" }));
    expect((await screen.findByRole("alert")).textContent).toContain("Your rating did not save");
    expect(screen.getByLabelText("What best describes how you feel?")).toHaveProperty("value", "I feel clearer");
    expect(screen.getByText("Was this conversation useful?")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Submit" }));
    await waitFor(() => expect(screen.queryByText("Was this conversation useful?")).toBeNull());
    expect(state.survey).toHaveBeenLastCalledWith({ token: expect.stringMatching(/^[a-f0-9]{64}$/), useful: true, reason: "I feel clearer" });
    expect(screen.queryByRole("heading", { name: "Sources" })).toBeNull();
    expect(screen.getAllByRole("textbox", { name: "Your question" })).toHaveLength(1);
    expect(screen.queryByText(/Membership will/)).toBeNull();
    expect(state.begin).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Talk to Tigermom" })).toBeDefined();
  });
  it("shows that AI is paused and does not send a question", async () => {
    state.authenticated = true;
    state.ai = false;
    const user = userEvent.setup();
    render(<App />);
    expect(screen.getByText(/Live AI replies are paused/)).toBeDefined();
    await user.click(screen.getByRole("button", { name: /Talk to Tigermom/ }));
    await user.type(await screen.findByRole("textbox", { name: "Your question" }), "My question");
    expect((screen.getByRole("button", { name: "Send question" }) as HTMLButtonElement).disabled).toBe(true);
    expect(state.reply).not.toHaveBeenCalled();
  });
  it("clears the chat at ten minutes and ignores an answer arriving afterwards", async () => {
    vi.useFakeTimers();
    state.authenticated = true;
    let resolveReply!: (value: { text: string; sources: [] }) => void;
    state.reply.mockImplementationOnce(() => new Promise((resolve) => { resolveReply = resolve; }));
    render(<App />);
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /Talk to Tigermom/ })); });
    expect(screen.getByRole("timer").textContent).toContain("10:00");
    fireEvent.change(screen.getByRole("textbox", { name: "Your question" }), { target: { value: "Private question" } });
    fireEvent.click(screen.getByRole("button", { name: "Send question" }));
    await act(async () => { await vi.advanceTimersByTimeAsync(600_000); });
    expect(screen.getByText("Your free 10 minutes are up.")).toBeDefined();
    expect(state.finish).toHaveBeenCalledWith({ sessionId: "session-test", surveyToken: expect.stringMatching(/^[a-f0-9]{64}$/) });
    expect(screen.queryByText("Private question")).toBeNull();
    await act(async () => { resolveReply({ text: "Late private answer", sources: [] }); });
    expect(screen.queryByText("Late private answer")).toBeNull();
  });
  it("clears temporary questions when the tab leaves the page", async () => {
    state.authenticated = true;
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: /Talk to Tigermom/ }));
    await user.type(await screen.findByRole("textbox", { name: "Your question" }), "Private unsent question");
    await act(async () => { window.dispatchEvent(new Event("pagehide")); });
    expect(state.finish).toHaveBeenCalledWith({ sessionId: "session-test" });
    expect((screen.getByRole("textbox", { name: "Your question" }) as HTMLTextAreaElement).value).toBe("");
    await user.click(screen.getByRole("button", { name: /Talk to Tigermom/ }));
    expect((await screen.findByRole("textbox", { name: "Your question" }) as HTMLTextAreaElement).value).toBe("");
  });
  it("starts the mic directly and waits for a full pause, then speaks the reply and keeps voice on", async () => {
    state.authenticated = true;
    let microphone!: Recognition;
    window.SpeechRecognition = class {
      lang = ""; continuous = false; interimResults = false;
      onresult: Recognition["onresult"] = null;
      onerror: Recognition["onerror"] = null;
      onend: Recognition["onend"] = null;
      constructor() { microphone = this; }
      start() {} stop() {} abort() {}
    };
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: /Talk to Tigermom/ }));
    expect(state.reply).not.toHaveBeenCalled();
    vi.useFakeTimers();
    await act(async () => { microphone.onresult?.({ results: [[{ transcript: "Explain my doctor's advice" }]] }); });
    expect(state.reply).not.toHaveBeenCalled();
    await act(async () => { await vi.advanceTimersByTimeAsync(4000); });
    expect(state.reply).toHaveBeenCalledWith(expect.objectContaining({ text: "Explain my doctor's advice" }));
    expect(window.speechSynthesis.speak).toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Stop conversation" })).toBeDefined();
    vi.useRealTimers();
    await user.click(screen.getByRole("checkbox", { name: "Spoken replies" }));
    expect(window.speechSynthesis.cancel).toHaveBeenCalled();
  });
  it("keeps a spoken follow-up while waiting and does not read the interrupted answer", async () => {
    vi.useFakeTimers();
    state.authenticated = true;
    let mic!: Recognition;
    window.SpeechRecognition = class {
      lang = ""; continuous = false; interimResults = false;
      onresult: Recognition["onresult"] = null;
      onerror: Recognition["onerror"] = null;
      onend: Recognition["onend"] = null;
      constructor() { mic = this; }
      start() {} stop() {} abort() {}
    };
    let resolveFirst!: (reply: { text: string; sources: [] }) => void;
    state.reply.mockImplementationOnce(() => new Promise(resolve => { resolveFirst = resolve; }));
    render(<App />);
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Talk to Tigermom" })); });
    await act(async () => {
      mic.onresult?.({ results: [[{ transcript: "First complete question" }]] });
      await vi.advanceTimersByTimeAsync(4000);
    });
    expect(state.reply).toHaveBeenCalledTimes(1);
    expect((screen.getByRole("button", { name: "Stop conversation" }) as HTMLButtonElement).disabled).toBe(false);
    await act(async () => {
      mic.onresult?.({ resultIndex: 1, results: [[{ transcript: "First complete question" }], [{ transcript: "Wait, my follow-up question" }]] });
      await vi.advanceTimersByTimeAsync(4000);
    });
    expect(state.reply).toHaveBeenCalledTimes(1);
    await act(async () => { resolveFirst({ text: "The first answer", sources: [] }); });
    expect(window.speechSynthesis.speak).not.toHaveBeenCalled();
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(state.reply).toHaveBeenCalledTimes(2);
    expect(state.reply.mock.calls[1][0]).toMatchObject({
      text: "Wait, my follow-up question",
      history: [{ role: "user", text: "First complete question" }, { role: "assistant", text: "The first answer" }],
    });
    expect(window.speechSynthesis.speak).toHaveBeenCalledTimes(1);
  });
  it("uses one visible toggle that starts voice and ends and deletes the session", async () => {
    state.authenticated = true;
    const abort = vi.fn();
    window.SpeechRecognition = class {
      lang = ""; continuous = false; interimResults = false;
      onresult: Recognition["onresult"] = null;
      onerror: Recognition["onerror"] = null;
      onend: Recognition["onend"] = null;
      start = vi.fn(); stop = vi.fn(); abort = abort;
    };
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: "Talk to Tigermom" }));
    const stop = await screen.findByRole("button", { name: "Stop conversation" });
    expect(screen.queryByRole("button", { name: "Use voice input" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Keep typing" })).toBeNull();
    expect(screen.getAllByRole("button", { name: "Stop conversation" })).toHaveLength(1);
    await user.click(stop);
    expect(abort).toHaveBeenCalledOnce();
    await screen.findByText("Was this conversation useful?");
    expect(state.finish).toHaveBeenCalledWith({ sessionId: "session-test", surveyToken: expect.stringMatching(/^[a-f0-9]{64}$/) });
    expect(state.signOut).toHaveBeenCalled();
  });

  it("clears private content immediately when the server reports expiry", async () => {
    state.authenticated = true;
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: /Talk to Tigermom/ }));
    await user.type(await screen.findByRole("textbox", { name: "Your question" }), "Private question");
    await user.click(screen.getByRole("button", { name: "Send question" }));
    await screen.findByRole("link", { name: "[1] ACOG" });
    state.heartbeat.mockRejectedValueOnce(new Error("Your session has ended"));
    await act(async () => { document.dispatchEvent(new Event("visibilitychange")); });
    expect(screen.queryByText("Private question")).toBeNull();
    expect(screen.getByText("Was this conversation useful?")).toBeDefined();
    expect(window.speechSynthesis.cancel).toHaveBeenCalled();
    expect(state.finish).toHaveBeenCalledWith({ sessionId: "session-test", surveyToken: expect.stringMatching(/^[a-f0-9]{64}$/) });
  });
  it("deletes a session that finishes starting after the page has closed", async () => {
    state.authenticated = true;
    let resolveBegin!: (id: string) => void;
    state.begin.mockImplementationOnce(() => new Promise((resolve) => { resolveBegin = resolve; }));
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: /Talk to Tigermom/ }));
    await act(async () => { window.dispatchEvent(new Event("pagehide")); resolveBegin("cancelled-session"); });
    expect(state.finish).toHaveBeenCalledWith({ sessionId: "cancelled-session" });
    expect((screen.getByRole("textbox", { name: "Your question" }) as HTMLTextAreaElement).value).toBe("");
  });
});
