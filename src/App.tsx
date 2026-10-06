import { useEffect, useRef, useState, type FormEvent } from "react";
import { useAction, useConvexAuth, useMutation, useQuery } from "convex/react";
import { useAuthActions, useAuthToken } from "@convex-dev/auth/react";
import {
  ArrowRight,
  AudioLines,
  BookOpen,
  Check,
  ChevronDown,
  ChevronRight,
  FileText,
  Heart,
  Leaf,
  LoaderCircle,
  LockKeyhole,
  Menu,
  MessageCircle,
  Mic,
  Paperclip,
  Send,
  ShieldCheck,
  Sparkles,
  Square,
  Volume2,
  X,
} from "lucide-react";
import { api } from "../convex/_generated/api";
import { recognitionConstructor, readAloud, type Recognition } from "./speech";
import type { Id } from "../convex/_generated/dataModel";

type Source = { title: string; url: string };
type Message = { role: "user" | "assistant"; text: string; sources?: Source[] };
type Report = { id: Id<"reports">; name: string };
const starters = [
  "Help me understand my doctor's advice",
  "I have a question about my report",
  "Help me prepare for my next appointment",
];
const example: Message[] = [
  {
    role: "user",
    text: "My doctor made me feel worried about being pregnant at 35.",
  },
  {
    role: "assistant",
    text: "That sounds hurtful when you were looking for support. You deserve a clear explanation, without being made to feel guilty.\n\nBeing 35 is not a reason to feel ashamed of your pregnancy. Age is one part of the picture; your own health and pregnancy history also matter.\n\nYou could ask: “What does my age mean for my care, given my own health?”\n\nDid your doctor explain a particular concern?",
    sources: [
      {
        title: "ACOG · Pregnancy after 35",
        url: "https://www.acog.org/womens-health/faqs/having-a-baby-after-age-35-how-aging-affects-fertility-and-pregnancy",
      },
    ],
  },
];
const feedbackReasons = [
  "I feel clearer",
  "I feel more confident",
  "I still have questions",
  "Something felt wrong",
];

function Brand({ small = false }: { small?: boolean }) {
  return (
    <span className={`brand ${small ? "small" : ""}`}>
      <span className="brand-mark">
        <Heart size={small ? 17 : 21} strokeWidth={1.7} />
      </span>
      <span>
        tigermom<span className="brand-dot">.</span>
      </span>
    </span>
  );
}
function Paragraphs({ text }: { text: string }) {
  // Model text is always rendered as plain text, never HTML.
  return (
    <>
      {text
        .split("\n\n")
        .filter(Boolean)
        .map((p, i) => (
          <p key={i}>
            {p.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1").replace(/\*\*/g, "")}
          </p>
        ))}
    </>
  );
}

export default function App() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const { signIn, signOut } = useAuthActions();
  const availability = useQuery(api.settings.availability);
  const ask = useAction(api.conversation.reply);
  const begin = useMutation(api.sessions.begin);
  const heartbeat = useMutation(api.sessions.heartbeat);
  const finish = useMutation(api.sessions.finish);
  const authToken = useAuthToken();
  const removeReport = useMutation(api.reports.remove);
  const [panel, setPanel] = useState<
    "home" | "phone" | "code" | "chat" | "example" | "feedback" | "thanks"
  >("home");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [sessionId, setSessionId] = useState<Id<"sessions"> | null>(null);
  const [reports, setReports] = useState<Report[]>([]);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [menu, setMenu] = useState(false);
  const [expired, setExpired] = useState(false);
  const [info, setInfo] = useState<"sources" | "privacy" | "membership" | null>(
    null,
  );
  const [useful, setUseful] = useState<boolean | null>(null);
  const [reason, setReason] = useState("");
  const [listening, setListening] = useState(false);
  const [voiceConsent, setVoiceConsent] = useState(false);
  const [voiceDialog, setVoiceDialog] = useState(false);
  const recognition = useRef<Recognition | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const sessionRef = useRef<Id<"sessions"> | null>(null);
  const fullPhone = `+91${phone.replace(/\D/g, "")}`;
  const active = panel === "chat" || panel === "example";
  useEffect(() => {
    sessionRef.current = sessionId;
  }, [sessionId]);
  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, busy]);
  useEffect(() => {
    // Do not store reports or conversation in browser storage. Explicit end deletes
    // server data; an expiring server lease covers closed tabs and network loss.
    const close = () => {
      const id = sessionRef.current;
      if (id) void finish({ sessionId: id }).catch(() => {});
      recognition.current?.abort();
    };
    window.addEventListener("pagehide", close);
    return () => {
      window.removeEventListener("pagehide", close);
      recognition.current?.abort();
    };
  }, [finish]);
  useEffect(() => {
    if (!sessionId) return;
    const ping = () => {
      if (document.visibilityState !== "visible") return;
      void heartbeat({ sessionId }).catch((e) => {
        if (
          String(e).includes("session has ended") ||
          String(e).includes("Sign in")
        ) {
          setExpired(true);
          setError(
            "Your session has expired. Start a new conversation to continue.",
          );
        }
      });
    };
    const timer = window.setInterval(ping, 60_000);
    document.addEventListener("visibilitychange", ping);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", ping);
    };
  }, [sessionId, heartbeat]);

  function showError(e: unknown, fallback: string) {
    const text = e instanceof Error ? e.message : "";
    if (text.includes("session has ended") || text.includes("Sign in before")) {
      setExpired(true);
      setError(
        "Your session has expired. Start a new conversation to continue.",
      );
      return;
    }
    setError(
      text.includes("not configured")
        ? "This service is not connected yet. You can explore the sample conversation while it is being set up."
        : fallback,
    );
  }
  async function start(prompt?: string) {
    setError("");
    setExpired(false);
    if (prompt) setDraft(prompt);
    if (!isAuthenticated) {
      setPanel("phone");
      return;
    }
    setBusy(true);
    try {
      const id = await begin({});
      setSessionId(id);
      setMessages([]);
      setReports([]);
      setPanel("chat");
    } catch (e) {
      showError(e, "The conversation could not start. Please try again.");
    } finally {
      setBusy(false);
    }
  }
  async function sendCode(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (!/^[6-9]\d{9}$/.test(phone.replace(/\D/g, ""))) {
      setError("Enter a valid 10-digit Indian mobile number.");
      return;
    }
    if (!availability?.sms) {
      setError(
        "Phone verification is being set up. No code has been sent. You can explore the sample conversation below.",
      );
      return;
    }
    setBusy(true);
    try {
      await signIn("phone", { phone: fullPhone });
      setPanel("code");
    } catch (e) {
      showError(
        e,
        "We could not send the code. Check your number and try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function verify(e: FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await signIn("phone", { phone: fullPhone, code });
      const id = await begin({});
      setSessionId(id);
      setPanel("chat");
    } catch (e) {
      showError(
        e,
        "That code could not be verified. Check it or request a new code.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function send(e: FormEvent) {
    e.preventDefault();
    if (!draft.trim() || busy || uploading || !sessionId) return;
    const text = draft.trim();
    const history = [...messages];
    setMessages((prev) => [...prev, { role: "user", text }]);
    setDraft("");
    setBusy(true);
    setError("");
    try {
      const result = await ask({
        sessionId,
        text,
        history: history
          .slice(-12)
          .map((m) => ({ role: m.role, text: m.text })),
      });
      setMessages((prev) => [
        ...prev,
        { role: "assistant", text: result.text, sources: result.sources },
      ]);
    } catch (e) {
      setMessages(history);
      setDraft(text);
      showError(
        e,
        "Tigermom could not answer just now. Your question is still here; please try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function upload(file?: File) {
    if (!file || !sessionId) return;
    setError("");
    if (
      !["application/pdf", "image/jpeg", "image/png", "image/webp"].includes(
        file.type,
      )
    ) {
      setError("Choose a PDF, JPG, PNG, or WebP photo of a written report.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError("That file is larger than 10 MB. Please use a smaller copy.");
      return;
    }
    setUploading(true);
    try {
      const site = import.meta.env.VITE_CONVEX_URL.replace(
        /\.convex\.cloud$/,
        ".convex.site",
      );
      const response = await fetch(`${site}/reports/upload`, {
        method: "POST",
        headers: {
          "Content-Type": file.type,
          Authorization: `Bearer ${authToken}`,
          "X-Session-Id": sessionId,
          "X-Report-Name": encodeURIComponent(file.name),
        },
        body: file,
      });
      if (!response.ok) throw new Error("Upload failed");
      const { id } = await response.json();
      setReports((prev) => [...prev, { id, name: file.name }]);
    } catch (e) {
      showError(e, "Your report could not be attached. Please try again.");
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }
  async function endConversation() {
    setBusy(true);
    setError("");
    recognition.current?.abort();
    window.speechSynthesis?.cancel();
    try {
      if (sessionId) await finish({ sessionId });
      setSessionId(null);
      setReports([]);
      setMessages([]);
      setDraft("");
      setPanel("feedback");
      await signOut().catch(() =>
        setError(
          "Your conversation was cleared, but sign-out could not finish. Please close this tab if you are on a shared device.",
        ),
      );
    } catch {
      setError(
        "We could not confirm deletion. Please try ending the conversation again.",
      );
    } finally {
      setBusy(false);
    }
  }
  function microphone(consented = false) {
    setError("");
    if (listening) {
      recognition.current?.stop();
      return;
    }
    if (!voiceConsent && !consented) {
      setVoiceDialog(true);
      return;
    }
    const Constructor = recognitionConstructor();
    if (!Constructor) {
      setError(
        "Voice input is not available in this browser. You can type your question below.",
      );
      return;
    }
    const r = new Constructor();
    r.lang = "en-IN";
    r.continuous = false;
    r.interimResults = false;
    r.onresult = (event) => {
      setDraft(
        (prev) => `${prev}${prev ? " " : ""}${event.results[0][0].transcript}`,
      );
    };
    r.onerror = () => {
      setError(
        "We could not hear you. Check microphone permission or type your question.",
      );
      setListening(false);
    };
    r.onend = () => setListening(false);
    recognition.current = r;
    try {
      r.start();
      setListening(true);
    } catch {
      setError("Microphone could not start. You can type instead.");
    }
  }
  return (
    <div className="app-shell">
      <aside className={`sidebar ${menu ? "open" : ""}`}>
        <a
          href="#"
          className="brand-link"
          aria-label="Tigermom home"
          onClick={(e) => {
            e.preventDefault();
            if (!sessionId) {
              setPanel("home");
              setMenu(false);
            }
          }}
        >
          <Brand />
        </a>
        <p className="sidebar-note">
          Your pregnancy.
          <br />
          Your voice.
        </p>
        <nav aria-label="Main navigation">
          <button
            className={`nav-item ${!info ? "selected" : ""}`}
            onClick={() => {
              setInfo(null);
              setMenu(false);
            }}
          >
            <MessageCircle size={19} /> Your conversation
          </button>
          <button
            className={`nav-item ${info === "sources" ? "selected" : ""}`}
            onClick={() => {
              setInfo("sources");
              setMenu(false);
            }}
          >
            <BookOpen size={19} /> Our sources
          </button>
          <button
            className={`nav-item ${info === "privacy" ? "selected" : ""}`}
            onClick={() => {
              setInfo("privacy");
              setMenu(false);
            }}
          >
            <ShieldCheck size={19} /> Your privacy
          </button>
        </nav>
        <div className="sidebar-bottom">
          <div className="membership-note">
            <Leaf size={22} />
            <h3>A little more support</h3>
            <p>Saved reports and conversations, whenever you need them.</p>
            <button
              onClick={() => {
                setInfo("membership");
                setMenu(false);
              }}
            >
              Membership coming soon <ChevronRight size={15} />
            </button>
          </div>
          <span className="made-for">Made with care, for you.</span>
        </div>
      </aside>
      {menu && (
        <button
          className="menu-backdrop"
          aria-label="Close navigation"
          onClick={() => setMenu(false)}
        />
      )}
      <main className="main">
        <header className="topbar">
          <div className="mobile-brand">
            <button
              className="icon-button"
              aria-label="Open navigation"
              onClick={() => setMenu(true)}
            >
              <Menu size={21} />
            </button>
            <Brand small />
          </div>
          <span className="topbar-label">A space to feel heard</span>
          <div className="private-badge">
            <LockKeyhole size={13} /> A private conversation
          </div>
        </header>
        {info ? (
          <section className="info-page">
            <button className="text-button" onClick={() => setInfo(null)}>
              Back to your conversation <ArrowRight size={15} />
            </button>
            {info === "sources" && (
              <>
                <BookOpen className="page-icon" />
                <h1>
                  Confidence starts
                  <br />
                  with clarity.
                </h1>
                <p className="intro">
                  You deserve explanations you can understand, and sources you
                  can check.
                </p>
                <div className="source-list">
                  {[
                    [
                      "FOGSI",
                      "Indian obstetric and gynaecological guidance",
                      "https://www.fogsi.org/",
                    ],
                    [
                      "ACOG",
                      "Pregnancy guidance from obstetric specialists",
                      "https://www.acog.org/womens-health",
                    ],
                    [
                      "Lamaze",
                      "Evidence-based childbirth education",
                      "https://www.lamaze.org/",
                    ],
                    [
                      "Ina May Gaskin",
                      "Clearly attributed childbirth perspectives",
                      "https://inamay.com/",
                    ],
                  ].map(([name, desc, url]) => (
                    <a key={name} href={url} target="_blank" rel="noreferrer">
                      <div>
                        <h3>{name}</h3>
                        <p>{desc}</p>
                      </div>
                      <ArrowRight size={19} />
                    </a>
                  ))}
                </div>
                <p className="fine-print">
                  These are reference sources, not endorsements or partners.
                  Individual answers must link to the specific material used.
                  News is included only when relevant and identified by date.
                </p>
              </>
            )}
            {info === "privacy" && (
              <>
                <ShieldCheck className="page-icon" />
                <h1>
                  Your story
                  <br />
                  belongs to you.
                </h1>
                <p className="intro">
                  Your free conversation is temporary. It is not saved as a
                  personal history.
                </p>
                <div className="prose">
                  <h3>What we keep</h3>
                  <p>
                    Your verified phone number and sign-in records are held in
                    Convex to provide secure access. They are separate from your
                    conversation.
                  </p>
                  <h3>What we delete</h3>
                  <p>
                    Ending your conversation deletes its temporary reports and
                    clears the chat from this page. Conversation messages are
                    not stored in our database. If a tab closes unexpectedly,
                    temporary uploads expire within five minutes after the page
                    stops checking in, for example when it is closed or left in
                    the background.
                  </p>
                  <h3>Who processes your information</h3>
                  <p>
                    Convex runs the app. Once connected, the configured AI
                    service will process your questions and any reports you
                    choose to attach. Phone codes use an SMS delivery service.
                    Provider setup and its data handling must be confirmed
                    before real use.
                  </p>
                  <h3>Your voice</h3>
                  <p>
                    Voice input is optional and handled by your browser, which
                    may use its own speech service. You will be asked before
                    using it. Typing is always available.
                  </p>
                </div>
              </>
            )}
            {info === "membership" && (
              <>
                <Leaf className="page-icon" />
                <h1>
                  Support that
                  <br />
                  stays with you.
                </h1>
                <p className="intro">Paid membership is coming soon.</p>
                <div className="prose">
                  <p>
                    Return to your conversations and keep your reports together.
                    These will be the first membership benefits.
                  </p>
                  <p>
                    There are no payments or subscriptions in this first
                    version.
                  </p>
                </div>
                <button
                  className="primary-button"
                  onClick={() => setInfo(null)}
                >
                  Back to Tigermom <ArrowRight size={17} />
                </button>
              </>
            )}
          </section>
        ) : (
          <div
            className={`workspace ${active ? "conversation-workspace" : ""}`}
          >
            <section className="welcome-column">
              <div className="welcome-copy">
                <div className="greeting-mark">
                  <Heart size={26} strokeWidth={1.4} />
                </div>
                <h1>
                  A little clarity.
                  <br />A lot more
                  <br />
                  confidence.
                </h1>
                <p className="intro">
                  Pregnancy comes with questions.
                  <br />
                  You don’t have to hold them all alone.
                </p>
                <p className="welcome-description">
                  Let’s make sense of your care, understand your reports, and
                  find the words for your next appointment. One conversation at
                  a time.
                </p>
              </div>
              <div className="support-promise">
                <span className="promise-icon">
                  <Leaf size={21} />
                </span>
                <p>
                  Warmth first. Evidence always.
                  <br />
                  <span>Your choices, your voice.</span>
                </p>
              </div>
              <div className="care-note">
                <ShieldCheck size={16} />
                <p>
                  I’m an AI guide, here to help you understand. Your care
                  provider is here to care for you.
                </p>
              </div>
            </section>
            <section
              className="conversation-column"
              aria-label="Conversation with Tigermom"
            >
              <div className="conversation-header">
                <div className="guide-avatar">
                  <Heart size={22} strokeWidth={1.5} />
                </div>
                <div>
                  <h2>Tigermom</h2>
                  <p>
                    {panel === "example"
                      ? "A sample of how we talk"
                      : "Your AI guide. Here to listen."}
                  </p>
                </div>
                <span className="conversation-flower">
                  <Sparkles size={20} />
                </span>
              </div>
              {panel === "home" && (
                <div className="start-content">
                  <h2>What’s on your mind?</h2>
                  <p>
                    There’s no question too small.
                    <br />
                    Start wherever you are.
                  </p>
                  <div className="starter-list">
                    {starters.map((s, i) => (
                      <button key={s} onClick={() => void start(s)}>
                        <span>
                          {i === 1 ? (
                            <FileText size={18} />
                          ) : i === 2 ? (
                            <BookOpen size={18} />
                          ) : (
                            <MessageCircle size={18} />
                          )}
                        </span>
                        {s}
                        <ChevronRight size={17} />
                      </button>
                    ))}
                  </div>
                  <button
                    className="primary-button start-button"
                    disabled={busy || isLoading}
                    onClick={() => void start()}
                  >
                    <AudioLines size={20} /> Start a conversation{" "}
                    <ArrowRight size={18} />
                  </button>
                  <p className="session-note">
                    <LockKeyhole size={12} /> Free for now. No conversation
                    history saved.
                  </p>
                  <div className="sample-entry">
                    <span>Want to get a feel for Tigermom?</span>
                    <button
                      onClick={() => {
                        setPanel("example");
                        setError("");
                      }}
                    >
                      Read a sample conversation <ArrowRight size={14} />
                    </button>
                  </div>
                </div>
              )}
              {(panel === "phone" || panel === "code") && (
                <div className="auth-content">
                  <button
                    className="text-button"
                    onClick={() => {
                      setPanel("home");
                      setError("");
                    }}
                  >
                    Back
                  </button>
                  <div className="auth-symbol">
                    <LockKeyhole size={25} />
                  </div>
                  <h2>
                    {panel === "phone"
                      ? "Let’s start with you."
                      : "Check your phone."}
                  </h2>
                  <p>
                    {panel === "phone"
                      ? "Verify your mobile number before we talk. Your free conversation won’t become a saved history."
                      : `Enter the 6-digit code sent to ${fullPhone}.`}
                  </p>
                  <form onSubmit={panel === "phone" ? sendCode : verify}>
                    {panel === "phone" ? (
                      <>
                        <label htmlFor="phone">Mobile number</label>
                        <div className="phone-input">
                          <span>
                            +91 <ChevronDown size={13} />
                          </span>
                          <input
                            id="phone"
                            type="tel"
                            inputMode="numeric"
                            autoComplete="tel-national"
                            placeholder="Your 10-digit number"
                            value={phone}
                            onChange={(e) =>
                              setPhone(
                                e.target.value.replace(/\D/g, "").slice(0, 10),
                              )
                            }
                            required
                          />
                        </div>
                      </>
                    ) : (
                      <>
                        <label htmlFor="code">Verification code</label>
                        <input
                          className="code-input"
                          id="code"
                          inputMode="numeric"
                          autoComplete="one-time-code"
                          pattern="[0-9]{6}"
                          placeholder="6-digit code"
                          value={code}
                          onChange={(e) =>
                            setCode(
                              e.target.value.replace(/\D/g, "").slice(0, 6),
                            )
                          }
                          required
                        />
                      </>
                    )}
                    <button
                      className="primary-button"
                      disabled={
                        busy ||
                        (panel === "phone" && availability === undefined)
                      }
                    >
                      {busy ? (
                        <LoaderCircle className="spin" size={18} />
                      ) : null}
                      {panel === "phone"
                        ? "Send verification code"
                        : "Verify and start"}
                      <ArrowRight size={17} />
                    </button>
                  </form>
                  {panel === "code" && (
                    <button
                      className="text-button"
                      onClick={() => {
                        setPanel("phone");
                        setCode("");
                        setError("");
                      }}
                    >
                      Change number or request a new code
                    </button>
                  )}
                  <button
                    className="text-button sample-link"
                    onClick={() => {
                      setPanel("example");
                      setError("");
                    }}
                  >
                    Explore the sample conversation
                  </button>
                </div>
              )}
              {active && (
                <>
                  <div className="chat-messages" aria-live="polite">
                    {panel === "example" && (
                      <div className="sample-label">
                        <BookOpen size={14} /> Written sample · not a live AI
                        conversation
                      </div>
                    )}
                    {(panel === "example" ? example : messages).length ===
                      0 && (
                      <div className="chat-welcome">
                        <h3>I’m glad you’re here.</h3>
                        <p>
                          What would you like to make sense of today? You can
                          ask a question, or attach a written report.
                        </p>
                      </div>
                    )}
                    {(panel === "example" ? example : messages).map((m, i) => (
                      <article className={`message ${m.role}`} key={i}>
                        <span className="message-person">
                          {m.role === "user" ? "You" : "Tigermom"}
                        </span>
                        <div className="message-body">
                          <Paragraphs text={m.text} />
                        </div>
                        {m.sources && m.sources.length > 0 && (
                          <div className="answer-sources">
                            <span>
                              <BookOpen size={12} /> Sources you can check
                            </span>
                            {m.sources.map((s) => (
                              <a
                                key={s.url}
                                href={s.url}
                                target="_blank"
                                rel="noreferrer"
                              >
                                {s.title}
                                <ArrowRight size={12} />
                              </a>
                            ))}
                          </div>
                        )}
                        {m.role === "assistant" && (
                          <button
                            className="read-button"
                            onClick={() => {
                              try {
                                readAloud(m.text);
                              } catch (e) {
                                showError(
                                  e,
                                  e instanceof Error
                                    ? e.message
                                    : "Reading aloud is not available.",
                                );
                              }
                            }}
                          >
                            <Volume2 size={14} /> Read aloud
                          </button>
                        )}
                      </article>
                    ))}
                    {busy && panel === "chat" && (
                      <div className="thinking">
                        <LoaderCircle size={16} className="spin" /> Finding a
                        clear, grounded answer…
                      </div>
                    )}
                    <div ref={bottom} />
                  </div>
                  {panel === "example" ? (
                    <div className="sample-footer">
                      <p>More clarity. More room for your voice.</p>
                      <button
                        className="primary-button"
                        onClick={() => void start()}
                      >
                        Start your conversation <ArrowRight size={17} />
                      </button>
                      <button
                        className="text-button"
                        onClick={() => {
                          setPanel("home");
                          setError("");
                        }}
                      >
                        Back to home
                      </button>
                    </div>
                  ) : (
                    <div className="composer-area">
                      {reports.map((r) => (
                        <div className="report-chip" key={r.id}>
                          <FileText size={14} />
                          <span>{r.name}</span>
                          <button
                            aria-label={`Remove ${r.name}`}
                            disabled={busy}
                            onClick={async () => {
                              try {
                                await removeReport({ reportId: r.id });
                                setReports((prev) =>
                                  prev.filter((x) => x.id !== r.id),
                                );
                              } catch {
                                setError(
                                  "Could not remove your report. Please try again.",
                                );
                              }
                            }}
                          >
                            <X size={14} />
                          </button>
                        </div>
                      ))}
                      {voiceDialog && !listening && (
                        <div className="voice-consent">
                          <p>
                            Your browser may send audio to its speech service.
                            Use voice input, or keep typing.
                          </p>
                          <button
                            onClick={() => {
                              setVoiceConsent(true);
                              setVoiceDialog(false);
                              microphone(true);
                            }}
                          >
                            Use voice input
                          </button>
                          <button onClick={() => setVoiceDialog(false)}>
                            Keep typing
                          </button>
                        </div>
                      )}
                      <form className="composer" onSubmit={send}>
                        <textarea
                          aria-label="Your question"
                          placeholder="Ask anything on your mind…"
                          value={draft}
                          maxLength={3000}
                          onChange={(e) => setDraft(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && !e.shiftKey) {
                              e.preventDefault();
                              void send(e);
                            }
                          }}
                          rows={2}
                          disabled={busy}
                        />
                        <div className="composer-controls">
                          <input
                            ref={fileInput}
                            type="file"
                            accept="application/pdf,image/jpeg,image/png,image/webp"
                            hidden
                            onChange={(e) => void upload(e.target.files?.[0])}
                          />
                          <button
                            type="button"
                            className="icon-button"
                            aria-label="Attach medical report"
                            disabled={uploading || busy || reports.length >= 3}
                            onClick={() => fileInput.current?.click()}
                          >
                            {uploading ? (
                              <LoaderCircle size={19} className="spin" />
                            ) : (
                              <Paperclip size={19} />
                            )}
                          </button>
                          <span className="attachment-hint">
                            PDF or report photo
                          </span>
                          <button
                            type="button"
                            className={`icon-button mic-button ${listening ? "listening" : ""}`}
                            aria-label={
                              listening ? "Stop listening" : "Use microphone"
                            }
                            disabled={busy}
                            onClick={() => microphone()}
                          >
                            {listening ? (
                              <Square size={18} />
                            ) : (
                              <Mic size={19} />
                            )}
                          </button>
                          <button
                            className="send-button"
                            aria-label="Send question"
                            disabled={!draft.trim() || busy || uploading}
                          >
                            <Send size={17} />
                          </button>
                        </div>
                      </form>
                      <div className="end-row">
                        <span>Your free session is temporary.</span>
                        <button
                          disabled={busy || uploading}
                          onClick={() => void endConversation()}
                        >
                          End & delete conversation
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}
              {panel === "feedback" && (
                <div className="feedback-content">
                  <span className="done-mark">
                    <Check size={26} />
                  </span>
                  <h2>A little clearer?</h2>
                  <p>
                    Your conversation has ended and your temporary reports have
                    been deleted.
                  </p>
                  <h3>Was this conversation useful?</h3>
                  <p className="reflection-note">
                    A private check-in. Your answers stay on this page and are
                    not saved.
                  </p>
                  <div className="feedback-choice">
                    <button
                      className={useful === true ? "chosen" : ""}
                      onClick={() => setUseful(true)}
                    >
                      Yes, it helped
                    </button>
                    <button
                      className={useful === false ? "chosen" : ""}
                      onClick={() => setUseful(false)}
                    >
                      Not quite
                    </button>
                  </div>
                  {useful !== null && (
                    <>
                      <label htmlFor="reason">
                        What best describes how you feel?
                      </label>
                      <select
                        id="reason"
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                      >
                        <option value="">Choose one</option>
                        {feedbackReasons.map((r) => (
                          <option key={r}>{r}</option>
                        ))}
                      </select>
                      <button
                        className="primary-button"
                        disabled={!reason}
                        onClick={() => setPanel("thanks")}
                      >
                        Finish <ArrowRight size={17} />
                      </button>
                    </>
                  )}
                  <button
                    className="text-button"
                    onClick={() => setPanel("thanks")}
                  >
                    Skip feedback
                  </button>
                </div>
              )}
              {panel === "thanks" && (
                <div className="feedback-content">
                  <Heart size={32} className="thank-heart" />
                  <h2>Your voice matters.</h2>
                  <p>Thank you for making space for yourself.</p>
                  <div className="membership-inline">
                    <Leaf size={23} />
                    <h3>A little more support, coming soon.</h3>
                    <p>
                      Membership will let you keep your reports and return to
                      your conversations.
                    </p>
                    <span>No payments in this first version.</span>
                  </div>
                  <button
                    className="primary-button"
                    onClick={() => {
                      setPanel("home");
                      setUseful(null);
                      setReason("");
                    }}
                  >
                    Back to home <ArrowRight size={17} />
                  </button>
                </div>
              )}
              {error && (
                <div className="error-message" role="alert">
                  <div>
                    {error}
                    {expired && (
                      <button
                        className="text-button"
                        onClick={() => void start()}
                      >
                        Start a new conversation
                      </button>
                    )}
                  </div>
                  <button
                    aria-label="Dismiss message"
                    onClick={() => setError("")}
                  >
                    <X size={16} />
                  </button>
                </div>
              )}
              <div className="conversation-bottom">
                <span>
                  <ShieldCheck size={13} /> Informed, prepared, confident.
                </span>
                <button onClick={() => setInfo("sources")}>
                  About our sources <ArrowRight size={12} />
                </button>
              </div>
            </section>
          </div>
        )}
        <footer className="page-footer">
          <span>Care that begins with listening.</span>
          <span>For urgent concerns, contact your care provider.</span>
        </footer>
      </main>
    </div>
  );
}
