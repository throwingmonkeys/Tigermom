import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { useAction, useConvexAuth, useMutation, useQuery } from "convex/react";
import { useAuthActions, useAuthToken } from "@convex-dev/auth/react";
import {
  ArrowRight,
  AudioLines,
  BookOpen,
  Check,
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
const SESSION_LENGTH = 10 * 60_000;
const referenceSources = [
  { title: "FOGSI", description: "Indian obstetric and gynaecological guidance", url: "https://www.fogsi.org/" },
  { title: "ACOG", description: "Pregnancy guidance from obstetric specialists", url: "https://www.acog.org/womens-health" },
  { title: "Lamaze", description: "Evidence-based childbirth education", url: "https://www.lamaze.org/" },
  { title: "Ina May Gaskin", description: "Clearly attributed childbirth perspectives", url: "https://inamay.com/" },
];
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
  const availability = useQuery(api.settings.availability);
  const { isAuthenticated, isLoading } = useConvexAuth();
  const { signIn, signOut } = useAuthActions();
  const ask = useAction(api.conversation.reply);
  const begin = useMutation(api.sessions.begin);
  const heartbeat = useMutation(api.sessions.heartbeat);
  const finish = useMutation(api.sessions.finish);
  const authToken = useAuthToken();
  const removeReport = useMutation(api.reports.remove);
  const [panel, setPanel] = useState<
    "home" | "chat" | "example" | "feedback" | "thanks"
  >("home");
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [sessionId, setSessionId] = useState<Id<"sessions"> | null>(null);
  const [sessionEndsAt, setSessionEndsAt] = useState<number | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(600);
  const [timeEnded, setTimeEnded] = useState(false);
  const [spokenReplies, setSpokenReplies] = useState(true);
  const ending = useRef(false);
  const closed = useRef(false);
  const lifecycle = useRef(0);
  const spokenRepliesRef = useRef(spokenReplies);
  spokenRepliesRef.current = spokenReplies;
  const [reports, setReports] = useState<Report[]>([]);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [menu, setMenu] = useState(false);
  const [expired, setExpired] = useState(false);
  const [pendingStart, setPendingStart] = useState(false);
  const opening = useRef(false);
  const [info, setInfo] = useState<"sources" | "privacy" | null>(
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
      lifecycle.current++;
      const id = sessionRef.current;
      closed.current = true;
      if (id) void finish({ sessionId: id }).catch(() => {});
      recognition.current?.abort();
      window.speechSynthesis?.cancel();
      sessionRef.current = null;
      setSessionId(null);
      setSessionEndsAt(null);
      setMessages([]);
      setReports([]);
      setDraft("");
      setPanel("home");
      setInfo(null);
      setVoiceConsent(false);
      setVoiceDialog(false);
      setListening(false);
      setPendingStart(false);
      setBusy(false);
      opening.current = false;
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
          if (sessionRef.current === sessionId) void endRef.current("expired");
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
      void endRef.current("expired");
      return;
    }
    setError(
      text.includes("not configured")
        ? "This service is not connected yet. You can explore the sample conversation while it is being set up."
        : fallback,
    );
  }
  const openConversation = useCallback(async () => {
    if (opening.current) return;
    opening.current = true;
    const generation = ++lifecycle.current;
    setBusy(true);
    try {
      const startedAt = Date.now();
      const id = await begin({});
      if (generation !== lifecycle.current) {
        void finish({ sessionId: id }).catch(() => {});
        return;
      }
      sessionRef.current = id;
      ending.current = false;
      closed.current = false;
      setSessionId(id);
      setSessionEndsAt(startedAt + SESSION_LENGTH);
      setSecondsLeft(600);
      setTimeEnded(false);
      setUseful(null);
      setReason("");
      setMessages([]);
      setReports([]);
      setPanel("chat");
    } catch (e) {
      if (generation !== lifecycle.current) return;
      setError("The conversation could not start. Please try again.");
    } finally {
      if (generation === lifecycle.current) {
        setBusy(false);
        opening.current = false;
      }
    }
  }, [begin, finish]);
  useEffect(() => {
    if (!pendingStart || !isAuthenticated) return;
    setPendingStart(false);
    void openConversation();
  }, [pendingStart, isAuthenticated, openConversation]);
  async function start(prompt?: string) {
    setError("");
    setExpired(false);
    if (prompt) setDraft(prompt);
    if (isAuthenticated) {
      await openConversation();
      return;
    }
    setBusy(true);
    setPendingStart(true);
    try {
      await signIn("anonymous");
    } catch {
      setPendingStart(false);
      setBusy(false);
      setError("Your private session could not start. Please try again.");
    }
  }
  async function send(e: FormEvent) {
    e.preventDefault();
    await submitQuestion(draft);
  }
  async function submitQuestion(question: string) {
    if (!question.trim() || busy || uploading || !sessionId || closed.current || expired || !availability?.ai) return;
    const text = question.trim();
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
      if (closed.current || sessionRef.current !== sessionId) return;
      setMessages((prev) => [
        ...prev,
        { role: "assistant", text: result.text, sources: result.sources },
      ]);
      if (spokenRepliesRef.current) {
        try { readAloud(result.text); }
        catch (e) { showError(e, e instanceof Error ? e.message : "You can read the answer here."); }
      }
    } catch (e) {
      if (closed.current || sessionRef.current !== sessionId) return;
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
    if (!file || !sessionId || ending.current || expired) return;
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
      if (closed.current || sessionRef.current !== sessionId) return;
      setReports((prev) => [...prev, { id, name: file.name }]);
    } catch (e) {
      if (closed.current || sessionRef.current !== sessionId) return;
      showError(e, "Your report could not be attached. Please try again.");
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }
  async function endConversation(cause: "manual" | "timeout" | "expired" = "manual") {
    if (ending.current) return;
    ending.current = true;
    closed.current = true;
    setBusy(true);
    setError("");
    recognition.current?.abort();
    window.speechSynthesis?.cancel();
    setListening(false);
    setVoiceDialog(false);
    setVoiceConsent(false);
    if (cause !== "manual") {
      setExpired(true);
      setTimeEnded(cause === "timeout");
      setReports([]);
      setMessages([]);
      setDraft("");
    }
    try {
      if (sessionId) await finish({ sessionId });
      sessionRef.current = null;
      setSessionId(null);
      setSessionEndsAt(null);
      setReports([]);
      setMessages([]);
      setDraft("");
      setPanel("feedback");
      setInfo(null);
      await signOut().catch(() =>
        setError(
          "Your conversation was cleared, but sign-out could not finish. Please close this tab if you are on a shared device.",
        ),
      );
    } catch {
      if (cause === "manual" && !expired) closed.current = false;
      setError(
        "We could not confirm deletion. Please try ending the conversation again.",
      );
    } finally {
      ending.current = false;
      setBusy(false);
    }
  }
  const endRef = useRef(endConversation);
  endRef.current = endConversation;
  useEffect(() => {
    if (!sessionEndsAt) return;
    const tick = () => {
      const remaining = Math.max(0, Math.ceil((sessionEndsAt - Date.now()) / 1000));
      setSecondsLeft(remaining);
      if (!remaining) {
        window.clearInterval(timer);
        void endRef.current("timeout");
      }
    };
    const timer = window.setInterval(tick, 1000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [sessionEndsAt]);
  function microphone(consented = false) {
    if (ending.current || expired) return;
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
      if (closed.current || sessionRef.current !== sessionId) return;
      const question = `${draft}${draft ? " " : ""}${event.results[0][0].transcript}`;
      setDraft(question);
      if (availability?.ai) void submitQuestion(question);
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
                  {referenceSources.map(({ title: name, description: desc, url }) => (
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
                    No phone number or verification code is needed. Convex keeps
                    a guest sign-in record to protect access to your temporary
                    conversation.
                  </p>
                  <h3>What we delete</h3>
                  <p>
                    Ending your conversation deletes its temporary reports and
                    clears the chat from this page. Conversation messages are
                    not stored in our database. Each free session ends after
                    10 minutes. If a tab closes unexpectedly,
                    temporary uploads expire within five minutes after the page
                    stops checking in, for example when it is closed or left in
                    the background.
                  </p>
                  <h3>Who processes your information</h3>
                  <p>
                    Convex runs the app. Once connected, the configured AI
                    service will process your questions and any reports you
                    choose to attach. No SMS service is used in this first
                    version. Provider setup and its data handling must be
                    confirmed before real use.
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
                  Just back from your doctor?
                  <br />
                  Make room for your own questions.
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
              {panel === "home" && (
                <section className="community-note" aria-label="Community stories">
                  <h2>Other voices, shared with care.</h2>
                  <p>Anonymous stories will appear here once women choose to share their feedback. No testimonials have been published yet.</p>
                </section>
              )}
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
                    Talk for free for 10 minutes. No sign-up needed.
                  </p>
                  <div className="starter-list">
                    {starters.map((s, i) => (
                      <button key={s} disabled={busy || isLoading} onClick={() => void start(s)}>
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
                    <AudioLines size={20} /> Talk to Tigermom{" "}
                    <ArrowRight size={18} />
                  </button>
                  <p className="session-note">
                    <LockKeyhole size={12} /> Reports and chat disappear when your session ends.
                  </p>
                  {availability?.ai === false && <p className="service-note" role="status">Live AI replies are paused. You can read a sample conversation or explore a private session.</p>}
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
                      {availability?.ai === false && <p className="service-note" role="status">Live AI replies are paused. Your questions won’t be sent to AI.</p>}
                      <div className="session-controls">
                        <span className="session-timer" role="timer" aria-label="Time remaining">
                          {Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, "0")} left
                        </span>
                        <label className="spoken-replies">
                          <input type="checkbox" checked={spokenReplies} onChange={(e) => {
                            setSpokenReplies(e.target.checked);
                            if (!e.target.checked) window.speechSynthesis?.cancel();
                          }} /> Spoken replies
                        </label>
                      </div>
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
                            When AI is available, your question is sent when you finish speaking. Use voice input, or keep typing.
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
                          disabled={busy || expired}
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
                            disabled={uploading || busy || expired || reports.length >= 3}
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
                            disabled={busy || expired}
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
                            disabled={!draft.trim() || busy || uploading || expired || !availability?.ai}
                          >
                            <Send size={17} />
                          </button>
                        </div>
                      </form>
                      <div className="end-row">
                        <span>10 minutes. Free and temporary.</span>
                        <button
                          disabled={busy || uploading}
                          onClick={() => void endConversation()}
                        >
                          End conversation
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
                  {timeEnded && <p>Your free 10 minutes are up.</p>}
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
                        Continue to sources <ArrowRight size={17} />
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
                  <h2>Sources you can explore.</h2>
                  <p>Your conversation is cleared. These reference sources are here whenever you want to learn more.</p>
                  <div className="source-list">
                    {referenceSources.map((source) => (
                      <a key={source.url} href={source.url} target="_blank" rel="noreferrer">
                        <div><h3>{source.title}</h3><p>{source.description}</p></div>
                        <ArrowRight size={19} />
                      </a>
                    ))}
                  </div>
                  <p className="fine-print">Reference sources, not endorsements. Each live answer must link to the specific evidence used.</p>
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
