import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { useAction, useConvexAuth, useMutation, useQuery } from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";
import {
  ArrowRight,
  BookOpen,
  Check,
  ChevronRight,
  Heart,
  LoaderCircle,
  Menu,
  MessageCircle,
  Mic,
  Send,
  Sparkles,
  Square,
  Shield,
  ThumbsUp,
  ThumbsDown,
  Volume2,
  X,
} from "lucide-react";
import { referenceSources } from "../shared/sources";
import { api } from "../convex/_generated/api";
import { recognitionConstructor, readAloud } from "./speech";
import { VoiceConversation } from "./voice";
import type { Id } from "../convex/_generated/dataModel";
import { mentionsUrgentSign, urgentMessage } from "../convex/urgent";

type Source = { title: string; url: string };
type Message = { role: "user" | "assistant"; text: string; sources?: Source[]; vote?: "like" | "dislike" };
const SESSION_LENGTH = 10 * 60_000;
const starters = [
  "How long does childbirth take?",
  "Why is skin to skin with the newborn baby important?",
];
const curationMessage = "These are Tigermom's approved sources. They have different roles: medical guidance, research, childbirth education, population data and context. Answers cite the specific pages used.";
const feedbackReasons = [
  "I feel clearer",
  "I feel more confident",
  "I still have questions",
  "Something felt wrong",
] as const;

function Brand({ small = false }: { small?: boolean }) {
  return (
    <span className={`brand ${small ? "small" : ""}`}>
      <span className="brand-mark">
        <Heart size={small ? 17 : 21} strokeWidth={1.7} />
      </span>
      {small ? (
        <span>tigermom<span className="brand-dot">.</span></span>
      ) : (
        <span className="sidebar-wordmark" role="img" aria-label="TigerMom">
          <img src="/tigermom-logo.png" alt="" aria-hidden="true" />
        </span>
      )}
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
  const submitFeedback = useAction(api.feedback.submit);
  const begin = useMutation(api.sessions.begin);
  const heartbeat = useMutation(api.sessions.heartbeat);
  const finish = useMutation(api.sessions.finish);
  const submitSurvey = useMutation(api.survey.submit);
  const surveyToken = useRef<string | null>(null);
  const surveySaving = useRef(false);
  const [panel, setPanel] = useState<
    "home" | "chat" | "feedback"
  >("home");
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [ratingPending, setRatingPending] = useState<number | null>(null);
  const [queuedRating, setQueuedRating] = useState<{ index: number; vote: "like" | "dislike" } | null>(null);
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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [menu, setMenu] = useState(false);
  const [expired, setExpired] = useState(false);
  const pendingQuestion = useRef<string | null>(null);
  const pendingVoice = useRef(false);
  const [pendingStart, setPendingStart] = useState(false);
  const opening = useRef(false);
  const [info, setInfo] = useState<"sources" | "privacy" | null>(
    null,
  );
  const [useful, setUseful] = useState<boolean | null>(null);
  const [reason, setReason] = useState("");
  const [listening, setListening] = useState(false);
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
    canSend: () => !busy && Boolean(sessionId) && !closed.current && !expired && Boolean(availability?.ai),
    onQuestion: submitQuestion,
  };
  useEffect(() => {
    if (!sessionId) return;
    const question = pendingQuestion.current;
    pendingQuestion.current = null;
    if (question) void submitQuestion(question);
    if (pendingVoice.current) {
      pendingVoice.current = false;
      microphone();
    }
  }, [sessionId]);
  const bottom = useRef<HTMLDivElement>(null);
  const sessionRef = useRef<Id<"sessions"> | null>(null);
  async function saveRating(index: number, vote: "like" | "dislike", id: Id<"sessions">) {
    const previous = messages[index]?.vote;
    const generation = lifecycle.current;
    setRatingPending(index);
    setMessages(prev => prev.map((message, i) => i === index ? { ...message, vote } : message));
    try {
      const question = messages.slice(0, index).reverse().find(message => message.role === "user")?.text ?? "";
      await submitFeedback({ sessionId: id, responseKey: `response-${index}`, vote, question, answer: messages[index].text });
    } catch {
      if (generation === lifecycle.current) {
        setMessages(prev => prev.map((message, i) => i === index ? { ...message, vote: previous } : message));
        setError("Your feedback wasn’t saved. Please try again.");
      }
    } finally { setRatingPending(null); }
  }
  async function rateResponse(index: number, vote: "like" | "dislike") {
    if (ratingPending !== null || messages[index]?.vote === vote) return;
    if (sessionRef.current) return saveRating(index, vote, sessionRef.current);
    // Urgent replies work without a session. Only a feedback tap starts a guest
    // identity, and the existing question and urgent guidance stay visible.
    setRatingPending(index);
    setQueuedRating({ index, vote });
    if (!isAuthenticated) {
      try { await signIn("anonymous"); }
      catch { setQueuedRating(null); setRatingPending(null); setError("Your feedback wasn’t saved. Please try again."); }
    }
  }
  useEffect(() => {
    if (!queuedRating || !isAuthenticated) return;
    const queued = queuedRating;
    setQueuedRating(null);
    const generation = lifecycle.current;
    void (async () => {
      try {
        const id = sessionRef.current ?? await begin({});
        if (generation !== lifecycle.current) { await finish({ sessionId: id }); return; }
        sessionRef.current = id;
        setSessionId(id);
        setSessionEndsAt(Date.now() + SESSION_LENGTH);
        await saveRating(queued.index, queued.vote, id);
      } catch { setRatingPending(null); setError("Your feedback wasn’t saved. Please try again."); }
    })();
  }, [queuedRating, isAuthenticated]);
  const active = panel === "chat";
  useEffect(() => {
    sessionRef.current = sessionId;
  }, [sessionId]);
  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, busy]);
  useEffect(() => {
    // Do not store conversation in browser storage. Explicit end deletes
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
      setQueuedRating(null);
      setRatingPending(null);
      setDraft("");
      pendingQuestion.current = null;
      pendingVoice.current = false;
      setPanel("home");
      setInfo(null);


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
  useEffect(() => { voice.current?.ready(); }, [busy, availability?.ai]);

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
      setQueuedRating(null);
      setRatingPending(null);
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
    if (prompt && mentionsUrgentSign(prompt)) {
      await submitQuestion(prompt);
      return;
    }
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
    if (mentionsUrgentSign(question)) {
      window.speechSynthesis?.cancel();
      voice.current?.consumeDraft();
      setPanel("chat");
      setDraft("");
      setError("");
      const generation = lifecycle.current;
      try {
        const result = await ask({ ...(sessionId ? { sessionId } : {}), text: question, history: [] });
        if (generation !== lifecycle.current) return;
        setMessages(prev => [...prev, { role: "user", text: question }, { role: "assistant", text: result.text, sources: result.sources }]);
      } catch { setError("Busy right now. Try again in a few minutes."); }
      return;
    }
    if (question.trim() && !sessionId && !busy) {
      pendingQuestion.current = question.trim();
      await start();
      return;
    }
    if (!question.trim() || busy || !sessionId || closed.current || expired || !availability?.ai) return;
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
      if (result.text === urgentMessage) return;
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
  async function endConversation(cause: "manual" | "timeout" | "expired" = "manual") {
    if (ending.current) return;
    ending.current = true;
    lifecycle.current++;
    pendingQuestion.current = null;
    pendingVoice.current = false;
    closed.current = true;
    setBusy(true);
    setError("");
    voice.current?.stop();
    voice.current = null;
    window.speechSynthesis?.cancel();
    setListening(false);


    if (cause !== "manual") {
      setExpired(true);
      setTimeEnded(cause === "timeout");
      setMessages([]);
      setQueuedRating(null);
      setRatingPending(null);
      setDraft("");
    }
    try {
      if (sessionId) {
        const token = surveyToken.current ?? Array.from(crypto.getRandomValues(new Uint8Array(32)), byte => byte.toString(16).padStart(2, "0")).join("");
        await finish({ sessionId, surveyToken: token });
        surveyToken.current = token;
      }
      sessionRef.current = null;
      setSessionId(null);
      setSessionEndsAt(null);
      setMessages([]);
      setQueuedRating(null);
      setRatingPending(null);
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
  function microphone() {
    if (ending.current || expired) return;
    setError("");
    if (listening) {
      voice.current?.stop();
      voice.current = null;
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
  async function toggleMicrophone() {
    if (!sessionId) {
      pendingVoice.current = true;
      await start();
    } else await endConversation();
  }
  async function sendSurvey() {
    if (useful === null || !reason || !surveyToken.current || surveySaving.current) return;
    surveySaving.current = true;
    setBusy(true);
    setError("");
    try {
      await submitSurvey({ token: surveyToken.current, useful, reason: reason as typeof feedbackReasons[number] });
      returnHome();
    } catch {
      setError("Your rating did not save. Please tap Submit to try again, or skip feedback.");
    } finally {
      surveySaving.current = false;
      setBusy(false);
    }
  }
  function returnHome() {
    surveyToken.current = null;
    setError("");
    setPanel("home");
    setExpired(false);
    setTimeEnded(false);
    setUseful(null);
    setReason("");
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
          <button className={`nav-item ${info === "privacy" ? "selected" : ""}`} onClick={() => { setInfo("privacy"); setMenu(false); }}>
            <Shield size={19} /> Privacy notice
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
            {info === "privacy" && (
              <>
                <Shield className="page-icon" />
                <h1>Privacy notice</h1>
                <p className="intro">How Tigermom uses your questions and conversation.</p>
                <h3>Preparing an answer</h3>
                <p>Tigermom sends your question and relevant conversation to OpenAI to prepare an answer. Please leave out names, contact details and other identifying information where possible.</p>
                <h3>Finding sources</h3>
                <p>A private step uses your question and relevant conversation to prepare a general search question. It is instructed to remove identifying details and individual results while preserving what you want to understand. Only the prepared question goes to web search; the original conversation is kept out of the search step.</p>
                <p>This preparation can make mistakes. Avoid including identifying details in your questions. If a private search question cannot be prepared, Tigermom asks you to ask the general question without private details.</p>
                <h3>Your session and feedback</h3>
                <p>Your conversation is cleared when your session ends or an inactive session expires. Survey answers and response ratings contribute to anonymous totals without your conversation.</p>
                <h3>OpenAI and voice services</h3>
                <p>OpenAI may retain information under its own data policy. Tigermom requests that responses are not stored by OpenAI, but this does not mean zero provider retention.</p>
                <p><a href="https://developers.openai.com/api/docs/guides/your-data" target="_blank" rel="noreferrer">Read OpenAI's data policy</a></p>
                <p>If you use voice, your browser's speech service receives what you say and may send audio off your device. Spoken replies use a local device voice when available.</p>
              </>
            )}
            {info === "sources" && (
              <>
                <BookOpen className="page-icon" />
                <h1>Sources</h1>
                <p className="intro">{curationMessage}</p>
                <div className="source-list">
                  {referenceSources.map(({ title: name, url, description }) => (
                    <a key={name} href={url} target="_blank" rel="noreferrer">
                      <div>
                        <h3>{name}</h3>
                          <p>{description}</p>

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
                <img className="home-logo" src="/tigermom-logo.png" alt="TigerMom. Be prepared. Be informed. Be in your child's corner." />
                <h1>Making the right choices for your baby begins by getting evidence backed answers to all your questions</h1>
                <p className="intro">Ask Tigermom a question. No sign-up needed.</p>
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
              {(panel === "home" || active) && (
                <>
                  <div className={"chat-messages " + (messages.length ? "has-messages" : "empty")} aria-live="polite">
                    {messages.map((m, i) => (
                      <article className={"message " + m.role + (m.text === urgentMessage ? " urgent-message" : "")} key={i}>
                        <span className="message-person">
                          {m.role === "user" ? "You" : "Tigermom"}
                        </span>
                        <div className="message-body">
                          <Paragraphs text={m.text} />
                        </div>
                        {m.role === "assistant" && (
                          <div className="response-feedback" role="group" aria-label="Rate this response">
                            <button type="button" aria-label="Like this response" aria-pressed={m.vote === "like"}
                              disabled={ratingPending !== null} onClick={() => void rateResponse(i, "like")}><ThumbsUp size={21} /> Like</button>
                            <button type="button" aria-label="Dislike this response" aria-pressed={m.vote === "dislike"}
                              disabled={ratingPending !== null} onClick={() => void rateResponse(i, "dislike")}><ThumbsDown size={21} /> Dislike</button>
                            <span role="status">{ratingPending === i ? "Saving feedback…" : m.vote ? "Thanks for your feedback" : ""}</span>
                          </div>
                        )}
                        {m.sources && m.sources.length > 0 && (
                          <div className="answer-sources">
                            <span>
                              <BookOpen size={12} /> Sources
                            </span>
                            {m.sources.map((s, sourceIndex) => (
                              <a
                                key={s.url}
                                href={s.url}
                                target="_blank"
                                rel="noreferrer"
                              >
                                [{sourceIndex + 1}] {s.title}
                                <ArrowRight size={12} />
                              </a>
                            ))}
                          </div>
                        )}
                        {m.role === "assistant" && m.text !== urgentMessage && (
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
                      {sessionId && <div className="session-controls">
                        <span className="session-timer" role="timer" aria-label="Time remaining">
                          {Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, "0")} left
                        </span>
                        <label className="spoken-replies">
                          <input type="checkbox" checked={spokenReplies} onChange={(e) => {
                            setSpokenReplies(e.target.checked);
                            if (!e.target.checked) window.speechSynthesis?.cancel();
                          }} /> Spoken replies
                        </label>
                      </div>}
                          <button
                            type="button"
                            className="primary-button start-button talk-button"
                            aria-label={
                              sessionId ? "Stop conversation" : "Talk to Tigermom"
                            }
                            disabled={opening.current || pendingStart || ending.current || (Boolean(sessionId) && expired)}
                            onClick={() => void toggleMicrophone()}
                          >
                            <span>{sessionId ? "Stop conversation" : "Talk to Tigermom"}</span>
                            {sessionId ? (
                              <Square size={18} />
                            ) : (
                              <Mic size={19} />
                            )}
                          </button>
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
                          disabled={busy}
                        />
                        <div className="composer-controls">
                          <button
                            className="send-button"
                            aria-label="Send question"
                            disabled={!draft.trim() || (!mentionsUrgentSign(draft) && (busy || (Boolean(sessionId) && expired) || !availability?.ai))}
                          >
                            <Send size={17} />
                          </button>
                        </div>
                      </form>
                      {panel === "home" && <div className="starter-list">
                        {starters.map(s => <button key={s} disabled={busy || isLoading} onClick={() => void submitQuestion(s)}>{s}<ChevronRight size={17} /></button>)}
                      </div>}
                      {listening && <p className="service-note" role="status">Voice is on. Take your time; pause for 4 seconds when you’re done. Speak to interrupt, or tap Stop conversation to finish the session.</p>}
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
                          <option key={r} value={r}>{r === "Something felt wrong" ? "That didn't help at all" : r}</option>
                        ))}
                      </select>
                      <button
                        className="primary-button"
                        disabled={!reason || busy || pendingStart}
                        onClick={() => void sendSurvey()}
                      >
                        {busy ? "Submitting..." : "Submit"} <ArrowRight size={17} />
                      </button>
                    </>
                  )}
                  <button
                    className="text-button"
                    disabled={busy}
                    onClick={returnHome}
                  >
                    Skip feedback
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
          </div>
        )}
      </main>
    </div>
  );
}
