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
  LoaderCircle,
  Menu,
  MessageCircle,
  Mic,
  Paperclip,
  Send,
  Sparkles,
  Square,
  Volume2,
  X,
} from "lucide-react";
import { api } from "../convex/_generated/api";
import { recognitionConstructor, readAloud } from "./speech";
import { VoiceConversation } from "./voice";
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
  "How long does childbirth take?",
  "Why is skin to skin with the newborn baby important?",
  "Can you help me understand my report?",
];
const curationMessage = "Tigermom curates its responses from the following resources. This list while not exhaustive, is a robust source of evidence when it comes to pregnancy and childbirth related questions.";
const testimonials = [
  { label: "Tigermom, 6m pregnant", quote: "It feels good to get an answer without taking an appointment" },
  { label: "Tigermom, 3m pregnant", quote: "I now know what to ask my doctor" },
  { label: "Tigermom, 9m pregnant", quote: "Tigermom beats having to read up 10 websites to answer a question" },
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
    "home" | "chat" | "feedback" | "thanks"
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
  const [info, setInfo] = useState<"sources" | null>(
    null,
  );
  const [useful, setUseful] = useState<boolean | null>(null);
  const [reason, setReason] = useState("");
  const [listening, setListening] = useState(false);
  const [voiceConsent, setVoiceConsent] = useState(false);
  const [voiceDialog, setVoiceDialog] = useState(false);
  const voice = useRef<VoiceConversation | null>(null);
  const voiceHandlers = useRef<{
    getDraft: () => string;
    canSend: () => boolean;
    onQuestion: (text: string) => Promise<void>;
  }>({
    getDraft: () => "",
    canSend: () => false,
    onQuestion: async (_text: string) => {},
  });
  voiceHandlers.current = {
    getDraft: () => draft,
    canSend: () => !busy && !uploading && Boolean(sessionId) && !closed.current && !expired && Boolean(availability?.ai),
    onQuestion: submitQuestion,
  };
  const fileInput = useRef<HTMLInputElement>(null);
  const pendingReport = useRef<File | null>(null);
  useEffect(() => {
    if (!sessionId || !pendingReport.current) return;
    const file = pendingReport.current;
    pendingReport.current = null;
    void upload(file);
  }, [sessionId]);
  const bottom = useRef<HTMLDivElement>(null);
  const sessionRef = useRef<Id<"sessions"> | null>(null);
  const active = panel === "chat";
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
      voice.current?.stop();
      voice.current = null;
      window.speechSynthesis?.cancel();
      sessionRef.current = null;
      setSessionId(null);
      setSessionEndsAt(null);
      setMessages([]);
      setReports([]);
      setDraft("");
      pendingReport.current = null;
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
      voice.current?.stop();
      voice.current = null;
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
  useEffect(() => { voice.current?.ready(); }, [busy, uploading, availability?.ai]);

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
    const voiceAtSend = voice.current;
    const voiceRevision = voiceAtSend?.revision;
    voiceAtSend?.consumeDraft();
    window.speechSynthesis?.cancel();
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
      const interrupted = voice.current === voiceAtSend && voiceAtSend?.revision !== voiceRevision;
      if (spokenRepliesRef.current && !interrupted && !voice.current?.hasPendingSpeech) {
        try { speakReply(result.text); }
        catch (e) { showError(e, e instanceof Error ? e.message : "You can read the answer here."); }
      }
    } catch (e) {
      if (closed.current || sessionRef.current !== sessionId) return;
      setMessages(history);
      if (!voice.current?.hasPendingSpeech) setDraft(text);
      setError("Busy right now. Try again in a few minutes.");
    } finally {
      setBusy(false);
    }
  }
  function speakReply(text: string) {
    const finishSpeaking = voice.current?.replyStarted(text);
    try { readAloud(text, finishSpeaking); }
    catch (error) { finishSpeaking?.(); throw error; }
  }
  async function upload(file?: File) {
    if (!file || !sessionId || ending.current || expired) return;
    setError("");
    if (
      !["application/pdf", "image/jpeg"].includes(
        file.type,
      )
    ) {
      setError("Error uploading your report. Please upload jpeg or pdf only");
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
      showError(e, "Error uploading your report. Please upload jpeg or pdf only");
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
    voice.current?.stop();
    voice.current = null;
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
      voice.current?.stop();
      voice.current = null;
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
    voice.current?.stop();
    voice.current = new VoiceConversation({
      createRecognition: () => new Constructor(),
      getDraft: () => voiceHandlers.current.getDraft(),
      canSend: () => voiceHandlers.current.canSend(),
      onQuestion: text => voiceHandlers.current.onQuestion(text),
      onDraft: setDraft,
      onListening: setListening,
      onError: setError,
      cancelSpeech: () => window.speechSynthesis?.cancel(),
    });
    voice.current.start();
  }
  return (
    <div className={`app-shell panel-${panel}`}>
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
        </nav>
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
        </header>
        {info ? (
          <section className="info-page">
            <button className="text-button" onClick={() => setInfo(null)}>
              Back to your conversation <ArrowRight size={15} />
            </button>
            {info === "sources" && (
              <>
                <BookOpen className="page-icon" />
                <h1>Sources</h1>
                <p className="intro">{curationMessage}</p>
                <div className="source-list">
                  {referenceSources.map(({ title: name, url }) => (
                    <a key={name} href={url} target="_blank" rel="noreferrer">
                      <div>
                        <h3>{name}</h3>

                      </div>
                      <ArrowRight size={19} />
                    </a>
                  ))}
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
                <img className="home-logo" src="/tigermom-logo.jpeg" alt="TigerMom. Be prepared. Be informed. Be in your child's corner." />
                <h1>Making the right choices for your baby begins by getting evidence backed answers to all your questions</h1>
                <p className="intro">Ask Tigermom a question. No sign-up needed. Upload a report for context.</p>
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
                </div>
                <span className="conversation-flower">
                  <Sparkles size={20} />
                </span>
              </div>
              {panel === "home" && (
                <div className="start-content">
                  <div className="conversation-actions">
                  <button
                    className="primary-button start-button"
                    disabled={busy || isLoading}
                    onClick={() => void start(draft)}
                  >
                    <AudioLines size={20} /> Talk to Tigermom{" "}
                    <ArrowRight size={18} />
                  </button>
                    <button className="stop-button" disabled>Stop conversation</button>
                  </div>
                  <div className="home-question-row">
                    <textarea aria-label="Your question" placeholder="What do you have in mind?" value={draft} onChange={e => setDraft(e.target.value)} maxLength={3000} rows={3} disabled={busy} />
                    <label className={`home-upload ${busy ? "disabled" : ""}`}>
                      <Paperclip size={19} /> Upload report
                      <input type="file" accept="application/pdf,image/jpeg" disabled={busy} className="upload-file-control" aria-label="Upload report" onChange={e => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        if (!["application/pdf", "image/jpeg"].includes(file.type)) {
                          setError("Error uploading your report. Please upload jpeg or pdf only");
                          return;
                        }
                        pendingReport.current = file;
                        void start(draft);
                      }} />
                    </label>
                  </div>
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
                  {availability?.ai === false && <p className="service-note" role="status">Live AI replies are paused.</p>}
                </div>
              )}
              {active && (
                <>
                  <div className="chat-messages" aria-live="polite">
                    {messages.length ===
                      0 && (
                      <div className="chat-welcome"><p>What do you have in mind?</p></div>
                    )}
                    {messages.map((m, i) => (
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
                              <BookOpen size={12} /> Sources
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
                                speakReply(m.text);
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
                        <LoaderCircle size={16} className="spin" /> That's a good question. Let me think about that.
                      </div>
                    )}
                    <div ref={bottom} />
                  </div>
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
                            Your browser may send audio to its speech service. Voice stays on until you stop it.
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
                      <div className="conversation-actions">
                        <button className="primary-button" onClick={() => microphone()} disabled={expired || listening}><Mic size={18} /> Talk to Tigermom</button>
                        <button className="stop-button" disabled={uploading || ending.current} onClick={() => void endConversation()}>Stop conversation</button>
                      </div>
                      <form className="composer" onSubmit={send}>
                        <textarea
                          aria-label="Your question"
                          placeholder="What do you have in mind?"
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
                            accept="application/pdf,image/jpeg"
                            hidden
                            onChange={(e) => void upload(e.target.files?.[0])}
                          />
                          <button
                            type="button"
                            className="icon-button"
                            aria-label="Upload report"
                            disabled={uploading || busy || expired || reports.length >= 3}
                            onClick={() => fileInput.current?.click()}
                          >
                            {uploading ? (
                              <LoaderCircle size={19} className="spin" />
                            ) : (
                              <Paperclip size={19} />
                            )}
                            <span>Upload report</span>
                          </button>
                          <button
                            type="button"
                            className={`icon-button mic-button ${listening ? "listening" : ""}`}
                            aria-label={
                              listening ? "Stop listening" : "Use microphone"
                            }
                            disabled={expired}
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
                      {listening && <p className="service-note" role="status">Voice is on. Take your time; pause for 4 seconds when you’re done. Speak to interrupt, or tap the mic to stop.</p>}
                    </div>
                </>
              )}
              {panel === "feedback" && (
                <div className="feedback-content">
                  <span className="done-mark">
                    <Check size={26} />
                  </span>
                  {timeEnded && <p>Your free 10 minutes are up.</p>}
                  <h3>Was this conversation useful?</h3>
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
                  <h2>Sources</h2>
                  <p>{curationMessage}</p>
                  <div className="source-list">
                    {referenceSources.map((source) => (
                      <a key={source.url} href={source.url} target="_blank" rel="noreferrer">
                        <div><h3>{source.title}</h3></div>
                        <ArrowRight size={19} />
                      </a>
                    ))}
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
                        Talk to Tigermom
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
            </section>
            {panel === "home" && (
              <section className="testimonials" aria-labelledby="testimonials-title">
                <h2 id="testimonials-title">Testimonials</h2>
                <div className="testimonial-tiles">
                  {testimonials.map(({ label, quote }) => (
                    <article className="testimonial-tile" key={label} aria-label={label}>
                      <blockquote>{quote}</blockquote>
                      <p>{label}</p>
                    </article>
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
