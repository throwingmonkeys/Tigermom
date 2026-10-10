// @vitest-environment jsdom
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "../src/App";
import type { Recognition } from "../src/speech";

const state = vi.hoisted(() => ({
  authenticated: false,
  ai: true,
  signIn: vi.fn(),
  signOut: vi.fn(),
  begin: vi.fn(),
  finish: vi.fn(),
  heartbeat: vi.fn(),
  reply: vi.fn(),
}));
vi.mock("convex/react", async () => {
  const { getFunctionName } = await import("convex/server");
  return {
    useConvexAuth: () => ({
      isAuthenticated: state.authenticated,
      isLoading: false,
    }),
    useQuery: () => ({ sms: false, ai: state.ai }),
    useAction: () => state.reply,
    useMutation: (reference: Parameters<typeof getFunctionName>[0]) => {
      const name = getFunctionName(reference);
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
  state.begin.mockResolvedValue("session-test");
  state.finish.mockResolvedValue(null);
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
    expect(screen.getByText(/Tigermom curates its responses/)).toBeDefined();
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
    expect(await screen.findByRole("link", { name: "ACOG" })).toBeDefined();
    expect(window.speechSynthesis.speak).toHaveBeenCalled();
    expect(screen.getByText("Help me prepare for my visit")).toBeDefined();
    await user.click(
      screen.getByRole("button", { name: "Stop conversation" }),
    );
    await waitFor(() =>
      expect(state.finish).toHaveBeenCalledWith({ sessionId: "session-test" }),
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
    await user.click(screen.getByRole("button", { name: /Continue to sources/ }));
    expect(screen.getByRole("heading", { name: "Sources" })).toBeDefined();
    expect(screen.getByRole("link", { name: /FOGSI/ })).toBeDefined();
    expect(screen.queryByText(/Membership will/)).toBeNull();
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
    expect(state.finish).toHaveBeenCalledWith({ sessionId: "session-test" });
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
  it("waits for a full pause after consent, then speaks the reply and keeps voice on", async () => {
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
    await user.click(await screen.findByRole("button", { name: "Use microphone" }));
    expect(state.reply).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Use voice input" }));
    vi.useFakeTimers();
    await act(async () => { microphone.onresult?.({ results: [[{ transcript: "Explain my doctor's advice" }]] }); });
    expect(state.reply).not.toHaveBeenCalled();
    await act(async () => { await vi.advanceTimersByTimeAsync(4000); });
    expect(state.reply).toHaveBeenCalledWith(expect.objectContaining({ text: "Explain my doctor's advice" }));
    expect(window.speechSynthesis.speak).toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Stop listening" })).toBeDefined();
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
    fireEvent.click(screen.getByRole("button", { name: "Use microphone" }));
    fireEvent.click(screen.getByRole("button", { name: "Use voice input" }));
    await act(async () => {
      mic.onresult?.({ results: [[{ transcript: "First complete question" }]] });
      await vi.advanceTimersByTimeAsync(4000);
    });
    expect(state.reply).toHaveBeenCalledTimes(1);
    expect((screen.getByRole("button", { name: "Stop listening" }) as HTMLButtonElement).disabled).toBe(false);
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
  it("clears private content immediately when the server reports expiry", async () => {
    state.authenticated = true;
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: /Talk to Tigermom/ }));
    await user.type(await screen.findByRole("textbox", { name: "Your question" }), "Private question");
    await user.click(screen.getByRole("button", { name: "Send question" }));
    await screen.findByRole("link", { name: "ACOG" });
    state.heartbeat.mockRejectedValueOnce(new Error("Your session has ended"));
    await act(async () => { document.dispatchEvent(new Event("visibilitychange")); });
    expect(screen.queryByText("Private question")).toBeNull();
    expect(screen.getByText("Was this conversation useful?")).toBeDefined();
    expect(window.speechSynthesis.cancel).toHaveBeenCalled();
    expect(state.finish).toHaveBeenCalledWith({ sessionId: "session-test" });
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
