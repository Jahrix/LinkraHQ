import React, { useState, useRef, useEffect, useCallback } from "react";
import { api, type AgentConversation, type AgentMessage } from "../lib/api";
import { useAppState } from "../lib/state";

// ── Types ──────────────────────────────────────────────────────────────────

type DisplayMessage = {
  role: "user" | "assistant";
  content: string;
  action_taken?: string | null;
  timestamp: Date;
};

type AgentQuota = {
  allowed: boolean;
  used: number;
  limit: number;
  reset_in_minutes: number;
};

// ── Constants ──────────────────────────────────────────────────────────────

const SUGGESTION_CHIPS = [
  "What should I work on today?",
  "What's overdue?",
  "Show me project status",
  "Move stale tasks to next week",
  "Wrap up my day",
  "Log a session"
];

// ── Helpers ────────────────────────────────────────────────────────────────

function formatResetTime(minutes: number): string {
  if (minutes <= 0) return "soon";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h > 0) return m > 0 ? `${h}h ${m}m` : `${h}h`;
  return `${m}m`;
}

function dateLabel(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86_400_000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return "This Week";
  return "Older";
}

function groupConversations(convs: AgentConversation[]) {
  const groups: Record<string, AgentConversation[]> = {};
  for (const c of convs) {
    const label = dateLabel(c.updated_at);
    if (!groups[label]) groups[label] = [];
    groups[label].push(c);
  }
  return groups;
}

function toDisplayMessages(msgs: AgentMessage[]): DisplayMessage[] {
  return msgs.map((m) => ({
    role: m.role,
    content: m.content,
    action_taken: m.action_taken,
    timestamp: new Date(m.created_at)
  }));
}

function useIsDesktop() {
  const [isDesktop, setIsDesktop] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth >= 1024 : true
  );
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const handler = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
  return isDesktop;
}

// ── Sub-components ─────────────────────────────────────────────────────────

function TypingDots() {
  return (
    <div style={{
      background: "#1a1a1f",
      border: "1px solid rgba(255,255,255,0.05)",
      padding: "12px 16px",
      borderRadius: "18px 18px 18px 4px",
      display: "inline-flex",
      gap: 5,
      alignItems: "center"
    }}>
      {[0, 0.2, 0.4].map((delay, i) => (
        <span key={i} style={{
          width: 6, height: 6, borderRadius: "50%",
          background: "rgba(255,255,255,0.5)",
          display: "inline-block",
          animation: "agent-dot 1.2s ease-in-out infinite",
          animationDelay: `${delay}s`
        }} />
      ))}
    </div>
  );
}

function MessageBubble({ msg }: { msg: DisplayMessage }) {
  const isUser = msg.role === "user";
  const timeStr = msg.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: isUser ? "flex-end" : "flex-start", gap: 4 }}>
      <div style={{
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
      }}>
        {msg.content}
      </div>
      {msg.action_taken && (
        <span style={{ fontSize: 11, fontFamily: "monospace", color: "#22c55e", paddingLeft: 2 }}>
          ⚡ {msg.action_taken}
        </span>
      )}
      <span style={{ fontSize: 11, color: "rgba(255,255,255,0.2)" }}>{timeStr}</span>
    </div>
  );
}

function EmptyState({ onChip }: { onChip: (text: string) => void }) {
  return (
    <div style={{
      flex: 1, display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center", padding: "40px 24px"
    }}>
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
              color: "#a78bfa", fontSize: 13, padding: "6px 14px",
              borderRadius: 20, cursor: "pointer", transition: "background 0.15s"
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

// ── Conversation sidebar ───────────────────────────────────────────────────

const GROUP_ORDER = ["Today", "Yesterday", "This Week", "Older"];

function ConversationSidebar({
  conversations,
  activeId,
  onSelect,
  onNew,
  onDelete,
  fullWidth = false
}: {
  conversations: AgentConversation[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  fullWidth?: boolean;
}) {
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const groups = groupConversations(conversations);

  return (
    <div style={{
      width: fullWidth ? "100%" : 260,
      flexShrink: 0,
      borderRight: fullWidth ? "none" : "1px solid rgba(255,255,255,0.05)",
      display: "flex",
      flexDirection: "column",
      background: "rgba(10,11,15,0.6)",
      height: "100%"
    }}>
      <div style={{ padding: "14px 12px 10px" }}>
        <button
          onClick={onNew}
          style={{
            width: "100%",
            background: "rgba(124,92,252,0.12)",
            border: "1px solid rgba(124,92,252,0.25)",
            color: "#a78bfa",
            borderRadius: 10,
            padding: "8px 12px",
            fontSize: 13,
            fontWeight: 600,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: 6,
            transition: "background 0.15s"
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(124,92,252,0.22)"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(124,92,252,0.12)"; }}
        >
          <span style={{ fontSize: 16 }}>+</span> New conversation
        </button>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "0 8px 12px" }}>
        {conversations.length === 0 && (
          <p style={{ color: "rgba(255,255,255,0.25)", fontSize: 12, textAlign: "center", marginTop: 24 }}>
            No conversations yet
          </p>
        )}
        {GROUP_ORDER.map((label) => {
          const items = groups[label];
          if (!items?.length) return null;
          return (
            <div key={label}>
              <p style={{
                fontSize: 10, fontWeight: 600, letterSpacing: "0.08em",
                color: "rgba(255,255,255,0.25)", margin: "10px 6px 4px",
                textTransform: "uppercase"
              }}>
                {label}
              </p>
              {items.map((conv) => (
                <div key={conv.id} style={{ marginBottom: 2 }}>
                  {deletingId === conv.id ? (
                    <div style={{
                      background: "rgba(239,68,68,0.08)",
                      border: "1px solid rgba(239,68,68,0.2)",
                      borderRadius: 8, padding: "6px 10px",
                      display: "flex", alignItems: "center", gap: 6
                    }}>
                      <span style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", flex: 1 }}>Delete?</span>
                      <button
                        onClick={() => { onDelete(conv.id); setDeletingId(null); }}
                        style={{ background: "rgba(239,68,68,0.3)", border: "none", color: "#fca5a5", fontSize: 11, padding: "3px 8px", borderRadius: 6, cursor: "pointer" }}
                      >Yes</button>
                      <button
                        onClick={() => setDeletingId(null)}
                        style={{ background: "rgba(255,255,255,0.06)", border: "none", color: "rgba(255,255,255,0.5)", fontSize: 11, padding: "3px 8px", borderRadius: 6, cursor: "pointer" }}
                      >No</button>
                    </div>
                  ) : (
                    <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
                      <button
                        onClick={() => onSelect(conv.id)}
                        style={{
                          flex: 1,
                          background: activeId === conv.id ? "rgba(124,92,252,0.15)" : "transparent",
                          border: activeId === conv.id ? "1px solid rgba(124,92,252,0.2)" : "1px solid transparent",
                          borderRadius: 8, padding: "7px 28px 7px 10px",
                          textAlign: "left", cursor: "pointer",
                          color: activeId === conv.id ? "#c4b5fd" : "rgba(255,255,255,0.7)",
                          fontSize: 13,
                          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                          transition: "background 0.12s"
                        }}
                        onMouseEnter={(e) => {
                          if (activeId !== conv.id) (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.04)";
                        }}
                        onMouseLeave={(e) => {
                          if (activeId !== conv.id) (e.currentTarget as HTMLButtonElement).style.background = "transparent";
                        }}
                      >
                        {conv.title}
                      </button>
                      <button
                        onClick={() => setDeletingId(conv.id)}
                        title="Delete"
                        style={{
                          position: "absolute", right: 6,
                          background: "none", border: "none",
                          color: "rgba(255,255,255,0.2)", cursor: "pointer",
                          fontSize: 16, lineHeight: 1, padding: "0 2px",
                          transition: "color 0.12s"
                        }}
                        onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "rgba(239,68,68,0.7)"; }}
                        onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "rgba(255,255,255,0.2)"; }}
                      >
                        ×
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────

export default function BuildPage() {
  const { refresh } = useAppState();
  const isDesktop = useIsDesktop();

  // Conversation state
  const [conversations, setConversations] = useState<AgentConversation[]>([]);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [convLoading, setConvLoading] = useState(true);

  // Chat state
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [quota, setQuota] = useState<AgentQuota | null>(null);

  // Mobile: "list" | "chat"
  const [mobileView, setMobileView] = useState<"list" | "chat">("chat");

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setConvLoading(true);
    Promise.all([
      api.getConversations().catch(() => ({ conversations: [] as AgentConversation[] })),
      api.getAgentQuota().catch(() => null)
    ]).then(([{ conversations: convs }, q]) => {
      setConversations(convs);
      if (q) setQuota(q);
      setConvLoading(false);
    });
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

  const loadConversation = useCallback(async (id: string) => {
    setActiveConvId(id);
    setMessages([]);
    setMobileView("chat");
    try {
      const { messages: msgs } = await api.getConversationMessages(id);
      setMessages(toDisplayMessages(msgs));
    } catch {
      setMessages([]);
    }
  }, []);

  const startNewConversation = useCallback(() => {
    setActiveConvId(null);
    setMessages([]);
    setInput("");
    setMobileView("chat");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
  }, []);

  const handleDeleteConversation = useCallback(async (id: string) => {
    try {
      await api.deleteConversation(id);
      setConversations((prev) => prev.filter((c) => c.id !== id));
      if (activeConvId === id) {
        setActiveConvId(null);
        setMessages([]);
      }
    } catch { /* ignore */ }
  }, [activeConvId]);

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || loading || isBlocked) return;

      const userMsg: DisplayMessage = { role: "user", content: trimmed, timestamp: new Date() };
      const nextMessages = [...messages, userMsg];
      setMessages(nextMessages);
      setInput("");
      if (textareaRef.current) textareaRef.current.style.height = "auto";
      setLoading(true);

      try {
        const apiMessages = nextMessages.map((m) => ({ role: m.role, content: m.content }));
        const result = await api.agent(apiMessages, activeConvId);

        setMessages((prev) => [...prev, {
          role: "assistant",
          content: result.reply,
          action_taken: result.actionTaken,
          timestamp: new Date()
        }]);

        if (result.quota) {
          setQuota((prev) => prev ? { ...prev, ...result.quota! } : result.quota);
        }
        if (result.updatedState) await refresh();

        if (result.conversationId) {
          const convId = result.conversationId;
          if (!activeConvId) {
            setActiveConvId(convId);
            api.getConversations()
              .then(({ conversations: convs }) => setConversations(convs))
              .catch(() => {});
          } else {
            setConversations((prev) => {
              const updated = prev.map((c) =>
                c.id === convId
                  ? { ...c, updated_at: new Date().toISOString(), message_count: (c.message_count ?? 0) + 2 }
                  : c
              );
              return updated.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
            });
          }
        }
      } catch (err) {
        const raw = err instanceof Error ? err.message : "Something went wrong";
        const isQuotaErr = raw === "agent_quota_exceeded";
        const resetMins = (err as any)?.resetInMinutes as number | undefined;

        if (isQuotaErr) {
          const resetText = resetMins != null ? formatResetTime(resetMins) : "soon";
          setMessages((prev) => [...prev, {
            role: "assistant",
            content: `Agent limit reached. Resets in ${resetText} ✦`,
            action_taken: null,
            timestamp: new Date()
          }]);
          setQuota((prev) =>
            prev ? { ...prev, allowed: false, used: prev.limit, reset_in_minutes: resetMins ?? prev.reset_in_minutes } : null
          );
        } else {
          setMessages((prev) => [...prev, {
            role: "assistant",
            content: `Error: ${raw}`,
            action_taken: null,
            timestamp: new Date()
          }]);
        }
      } finally {
        setLoading(false);
      }
    },
    [messages, loading, isBlocked, refresh, activeConvId]
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  const isEmpty = messages.length === 0;

  const sidebar = !convLoading ? (
    <ConversationSidebar
      conversations={conversations}
      activeId={activeConvId}
      onSelect={loadConversation}
      onNew={startNewConversation}
      onDelete={handleDeleteConversation}
    />
  ) : null;

  const chatPanel = (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, height: "100%" }}>
      {/* Header */}
      <div style={{ padding: "14px 20px 10px", flexShrink: 0, borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
            {!isDesktop && (
              <button
                onClick={() => setMobileView("list")}
                style={{ background: "none", border: "none", color: "rgba(255,255,255,0.4)", fontSize: 20, cursor: "pointer", padding: "0 4px 0 0", lineHeight: 1, flexShrink: 0 }}
              >
                ‹
              </button>
            )}
            <h1 style={{ fontSize: 17, fontWeight: 700, color: "white", margin: 0, whiteSpace: "nowrap" }}>Build</h1>
            <span style={{
              background: "rgba(124,92,252,0.18)", border: "1px solid rgba(124,92,252,0.3)",
              color: "#a78bfa", fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 20, flexShrink: 0
            }}>✦ Agent</span>
          </div>
          {quota && (
            isAdmin ? (
              <span style={{ background: "rgba(124,92,252,0.18)", border: "1px solid rgba(124,92,252,0.3)", color: "#a78bfa", fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 20, flexShrink: 0 }}>
                ∞ Admin
              </span>
            ) : (
              <span style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", flexShrink: 0, whiteSpace: "nowrap" }}>
                {quota.used}/{quota.limit}
                {quota.reset_in_minutes > 0 && <> · {formatResetTime(quota.reset_in_minutes)}</>}
              </span>
            )
          )}
        </div>
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px", display: "flex", flexDirection: "column", gap: 14 }}>
        {isEmpty ? (
          <EmptyState onChip={sendMessage} />
        ) : (
          <>
            {messages.map((msg, i) => <MessageBubble key={i} msg={msg} />)}
            {loading && (
              <div style={{ display: "flex", alignItems: "flex-start" }}>
                <TypingDots />
              </div>
            )}
          </>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div style={{ flexShrink: 0, background: "#111114", borderTop: "1px solid rgba(255,255,255,0.06)", padding: "12px 16px" }}>
        {isBlocked ? (
          <div style={{
            background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)",
            borderRadius: 12, padding: "14px 18px", textAlign: "center",
            fontSize: 13, color: "rgba(255,255,255,0.6)", lineHeight: 1.6
          }}>
            All {quota?.limit} agent messages used.
            {quota && quota.reset_in_minutes > 0 && (
              <> Resets in <strong style={{ color: "rgba(255,255,255,0.8)" }}>{formatResetTime(quota.reset_in_minutes)}</strong>.</>
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
                flex: 1, background: "#1a1a1f", border: "1px solid rgba(255,255,255,0.10)",
                borderRadius: 12, color: "white", fontSize: 14, padding: "10px 14px",
                resize: "none", outline: "none", lineHeight: "22px",
                maxHeight: 96, overflowY: "auto", fontFamily: "inherit"
              }}
            />
            <button
              onClick={() => sendMessage(input)}
              disabled={!input.trim() || loading}
              style={{
                width: 40, height: 40, borderRadius: "50%",
                background: !input.trim() || loading ? "rgba(124,92,252,0.25)" : "#7c5cfc",
                border: "none", cursor: !input.trim() || loading ? "not-allowed" : "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
                flexShrink: 0, transition: "background 0.15s"
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

  // ── Layout ─────────────────────────────────────────────────────────────

  if (isDesktop) {
    return (
      <div style={{
        display: "flex", flexDirection: "row",
        background: "#0d0d0f", borderRadius: 16, overflow: "hidden",
        height: "calc(100dvh - 140px)", minHeight: 480
      }}>
        {sidebar}
        {chatPanel}
      </div>
    );
  }

  // Mobile: toggle between sidebar list and chat
  return (
    <div style={{
      display: "flex", flexDirection: "column",
      background: "#0d0d0f", borderRadius: 16, overflow: "hidden",
      height: "calc(100dvh - 140px)", minHeight: 480
    }}>
      {mobileView === "list" ? (
        <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
          <div style={{ padding: "14px 16px 10px", borderBottom: "1px solid rgba(255,255,255,0.05)", display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
            <h1 style={{ fontSize: 17, fontWeight: 700, color: "white", margin: 0, flex: 1 }}>Build</h1>
            <span style={{ background: "rgba(124,92,252,0.18)", border: "1px solid rgba(124,92,252,0.3)", color: "#a78bfa", fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 20 }}>✦ Agent</span>
          </div>
          <div style={{ flex: 1, overflow: "hidden", display: "flex" }}>
            {!convLoading && (
              <ConversationSidebar
                conversations={conversations}
                activeId={activeConvId}
                onSelect={loadConversation}
                onNew={startNewConversation}
                onDelete={handleDeleteConversation}
                fullWidth
              />
            )}
          </div>
        </div>
      ) : (
        chatPanel
      )}
    </div>
  );
}
