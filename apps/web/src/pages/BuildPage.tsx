import React, { useState, useRef, useEffect, useCallback } from "react";
import { api } from "../lib/api";
import { useAppState } from "../lib/state";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  actionTaken?: string | null;
  timestamp: Date;
};

type AgentQuota = {
  allowed: boolean;
  used: number;
  limit: number;
  reset_in_minutes: number;
};

const SUGGESTION_CHIPS = [
  "What should I work on today?",
  "Fill my day with tasks",
  "What's overdue?",
  "Wrap up my day",
  "Show me project status",
  "Move stale tasks to next week"
];

function formatResetTime(minutes: number): string {
  if (minutes <= 0) return "soon";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h > 0) return m > 0 ? `${h}h ${m}m` : `${h}h`;
  return `${m}m`;
}

function TypingDots() {
  return (
    <div
      style={{
        background: "#1a1a1f",
        border: "1px solid rgba(255,255,255,0.05)",
        padding: "12px 16px",
        borderRadius: "18px 18px 18px 4px",
        display: "inline-flex",
        gap: 5,
        alignItems: "center"
      }}
    >
      {[0, 0.2, 0.4].map((delay, i) => (
        <span
          key={i}
          style={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: "rgba(255,255,255,0.5)",
            display: "inline-block",
            animation: "agent-dot 1.2s ease-in-out infinite",
            animationDelay: `${delay}s`
          }}
        />
      ))}
    </div>
  );
}

function MessageBubble({ msg }: { msg: ChatMessage }) {
  const isUser = msg.role === "user";
  const timeStr = msg.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: isUser ? "flex-end" : "flex-start", gap: 4 }}>
      <div
        style={{
          maxWidth: "min(80%, 600px)",
          background: isUser ? "#7c5cfc" : "#1a1a1f",
          color: "white",
          padding: "10px 14px",
          borderRadius: isUser ? "18px 18px 4px 18px" : "18px 18px 18px 4px",
          border: isUser ? "none" : "1px solid rgba(255,255,255,0.05)",
          fontSize: 14,
          lineHeight: 1.6,
          whiteSpace: "pre-wrap",
          wordBreak: "break-word"
        }}
      >
        {msg.content}
      </div>
      {msg.actionTaken && (
        <span style={{ fontSize: 11, fontFamily: "monospace", color: "#22c55e", paddingLeft: 2 }}>
          ⚡ {msg.actionTaken}
        </span>
      )}
      <span style={{ fontSize: 11, color: "rgba(255,255,255,0.2)" }}>{timeStr}</span>
    </div>
  );
}

function EmptyState({ onChip }: { onChip: (text: string) => void }) {
  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "40px 24px"
      }}
    >
      <span style={{ fontSize: 48, marginBottom: 12, lineHeight: 1 }}>🏗️</span>
      <p style={{ color: "rgba(255,255,255,0.6)", fontWeight: 600, fontSize: 15, margin: "0 0 6px", textAlign: "center" }}>
        Build is your agent.
      </p>
      <p style={{ color: "rgba(255,255,255,0.3)", fontSize: 13, textAlign: "center", maxWidth: 300, lineHeight: 1.6, margin: 0 }}>
        It can create tasks, complete goals, move roadmap cards, and more.
      </p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center", marginTop: 28, maxWidth: 440 }}>
        {SUGGESTION_CHIPS.map((chip) => (
          <button
            key={chip}
            onClick={() => onChip(chip)}
            style={{
              background: "rgba(124,92,252,0.12)",
              border: "1px solid rgba(124,92,252,0.2)",
              color: "#a78bfa",
              fontSize: 13,
              padding: "6px 14px",
              borderRadius: 20,
              cursor: "pointer",
              transition: "background 0.15s"
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(124,92,252,0.22)"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(124,92,252,0.12)"; }}
          >
            {chip}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function BuildPage() {
  const { refresh } = useAppState();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [quota, setQuota] = useState<AgentQuota | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    api.getAgentQuota().then(setQuota).catch(() => {});
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const adjustHeight = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 96) + "px";
  };

  const isBlocked = quota !== null && !quota.allowed && quota.limit !== 999;
  const isAdmin = quota?.limit === 999;

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || loading || isBlocked) return;

      const userMsg: ChatMessage = { role: "user", content: trimmed, timestamp: new Date() };
      const nextMessages = [...messages, userMsg];
      setMessages(nextMessages);
      setInput("");
      if (textareaRef.current) textareaRef.current.style.height = "auto";
      setLoading(true);

      try {
        const result = await api.agent(
          nextMessages.map((m) => ({ role: m.role, content: m.content }))
        );
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: result.reply, actionTaken: result.actionTaken, timestamp: new Date() }
        ]);
        if (result.quota) {
          setQuota((prev) => prev ? { ...prev, ...result.quota! } : result.quota);
        }
        if (result.updatedState) {
          await refresh();
        }
      } catch (err) {
        const raw = err instanceof Error ? err.message : "Something went wrong";
        const isQuotaErr = raw === "agent_quota_exceeded";
        const resetMins = (err as any)?.resetInMinutes as number | undefined;

        if (isQuotaErr) {
          const resetText = resetMins != null ? formatResetTime(resetMins) : "soon";
          setMessages((prev) => [
            ...prev,
            {
              role: "assistant",
              content: `Agent limit reached. Resets in ${resetText} ✦`,
              actionTaken: null,
              timestamp: new Date()
            }
          ]);
          setQuota((prev) =>
            prev
              ? { ...prev, allowed: false, used: prev.limit, reset_in_minutes: resetMins ?? prev.reset_in_minutes }
              : null
          );
        } else {
          setMessages((prev) => [
            ...prev,
            { role: "assistant", content: `Error: ${raw}`, actionTaken: null, timestamp: new Date() }
          ]);
        }
      } finally {
        setLoading(false);
      }
    },
    [messages, loading, isBlocked, refresh]
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  const isEmpty = messages.length === 0;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        background: "#0d0d0f",
        borderRadius: 16,
        overflow: "hidden",
        height: "calc(100dvh - 140px)",
        minHeight: 480
      }}
    >
      {/* Header */}
      <div style={{ padding: "18px 20px 12px", flexShrink: 0, borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: "white", margin: 0 }}>Build</h1>
            <span
              style={{
                background: "rgba(124,92,252,0.18)",
                border: "1px solid rgba(124,92,252,0.3)",
                color: "#a78bfa",
                fontSize: 11,
                fontWeight: 600,
                padding: "2px 9px",
                borderRadius: 20
              }}
            >
              ✦ Agent
            </span>
          </div>
          {/* Quota indicator */}
          {quota && (
            isAdmin ? (
              <span
                style={{
                  background: "rgba(124,92,252,0.18)",
                  border: "1px solid rgba(124,92,252,0.3)",
                  color: "#a78bfa",
                  fontSize: 11,
                  fontWeight: 600,
                  padding: "2px 9px",
                  borderRadius: 20
                }}
              >
                ∞ Admin
              </span>
            ) : (
              <span style={{ fontSize: 11, color: "rgba(255,255,255,0.3)" }}>
                ✦ {quota.used} / {quota.limit} messages
                {quota.reset_in_minutes > 0 && (
                  <>  •  Resets in {formatResetTime(quota.reset_in_minutes)}</>
                )}
              </span>
            )
          )}
        </div>
        <p style={{ margin: "3px 0 0", fontSize: 13, color: "rgba(255,255,255,0.35)" }}>
          Your AI agent. Tell it what to do.
        </p>
      </div>

      {/* Messages */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "16px 20px",
          display: "flex",
          flexDirection: "column",
          gap: 14,
          scrollBehavior: "smooth"
        }}
      >
        {isEmpty ? (
          <EmptyState onChip={sendMessage} />
        ) : (
          <>
            {messages.map((msg, i) => (
              <MessageBubble key={i} msg={msg} />
            ))}
            {loading && (
              <div style={{ display: "flex", alignItems: "flex-start" }}>
                <TypingDots />
              </div>
            )}
          </>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input or blocked banner */}
      <div
        style={{
          flexShrink: 0,
          background: "#111114",
          borderTop: "1px solid rgba(255,255,255,0.06)",
          padding: "12px 16px"
        }}
      >
        {isBlocked ? (
          <div
            style={{
              background: "rgba(239,68,68,0.08)",
              border: "1px solid rgba(239,68,68,0.2)",
              borderRadius: 12,
              padding: "16px 20px",
              textAlign: "center",
              fontSize: 14,
              color: "rgba(255,255,255,0.6)",
              lineHeight: 1.6
            }}
          >
            You've used all {quota?.limit} agent messages for this window.
            {quota && quota.reset_in_minutes > 0 && (
              <> Resets in <strong style={{ color: "rgba(255,255,255,0.8)" }}>{formatResetTime(quota.reset_in_minutes)}</strong> — or upgrade to Pro for more.</>
            )}
          </div>
        ) : (
          <div style={{ display: "flex", alignItems: "flex-end", gap: 10 }}>
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => { setInput(e.target.value); adjustHeight(); }}
              onKeyDown={handleKeyDown}
              placeholder="Tell your agent what to do..."
              rows={1}
              disabled={loading}
              style={{
                flex: 1,
                background: "#1a1a1f",
                border: "1px solid rgba(255,255,255,0.10)",
                borderRadius: 12,
                color: "white",
                fontSize: 14,
                padding: "10px 14px",
                resize: "none",
                outline: "none",
                lineHeight: "22px",
                maxHeight: 96,
                overflowY: "auto",
                fontFamily: "inherit"
              }}
            />
            <button
              onClick={() => sendMessage(input)}
              disabled={!input.trim() || loading}
              style={{
                width: 40,
                height: 40,
                borderRadius: "50%",
                background: !input.trim() || loading ? "rgba(124,92,252,0.25)" : "#7c5cfc",
                border: "none",
                cursor: !input.trim() || loading ? "not-allowed" : "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
                transition: "background 0.15s"
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="19" x2="12" y2="5" />
                <polyline points="5 12 12 5 19 12" />
              </svg>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
