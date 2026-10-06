// @vitest-environment jsdom
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "../src/App";

const state = vi.hoisted(() => ({
  authenticated: false,
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
    useQuery: () => ({ sms: false, ai: false }),
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
    value: { cancel: vi.fn() },
  });
});
afterEach(cleanup);
describe("Conversation screens", () => {
  it("labels the sample and offers sources without pretending to run AI", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(
      screen.getByRole("button", { name: /Read a sample conversation/ }),
    );
    expect(screen.getByText(/Written sample/)).toBeDefined();
    expect(
      screen
        .getByRole("link", { name: /ACOG · Pregnancy after 35/ })
        .getAttribute("href"),
    ).toContain("acog.org/womens-health/faqs/");
    expect(state.reply).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Our sources" }));
    expect(screen.getByRole("link", { name: /FOGSI/ })).toBeDefined();
  });
  it("requires a valid phone and never claims an unconfigured code was sent", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(
      screen.getByRole("button", { name: /Start a conversation/ }),
    );
    const phone = screen.getByLabelText("Mobile number");
    await user.type(phone, "1234567890");
    await user.click(
      screen.getByRole("button", { name: /Send verification code/ }),
    );
    expect(screen.getByRole("alert").textContent).toContain("valid 10-digit");
    await user.clear(phone);
    await user.type(phone, "9876543210");
    await user.click(
      screen.getByRole("button", { name: /Send verification code/ }),
    );
    expect(screen.getByRole("alert").textContent).toContain(
      "No code has been sent",
    );
    expect(state.signIn).not.toHaveBeenCalled();
    expect(state.begin).not.toHaveBeenCalled();
  });
  it("shows an answer and sources, then ends and clears a temporary conversation", async () => {
    state.authenticated = true;
    const user = userEvent.setup();
    render(<App />);
    await user.click(
      screen.getByRole("button", { name: /Start a conversation/ }),
    );
    await user.type(
      await screen.findByRole("textbox", { name: "Your question" }),
      "Help me prepare for my visit",
    );
    await user.click(screen.getByRole("button", { name: "Send question" }));
    expect(await screen.findByRole("link", { name: "ACOG" })).toBeDefined();
    expect(screen.getByText("Help me prepare for my visit")).toBeDefined();
    await user.click(
      screen.getByRole("button", { name: "End & delete conversation" }),
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
    await user.click(screen.getByRole("button", { name: "Finish" }));
    expect(screen.getByText("Your voice matters.")).toBeDefined();
  });
});
