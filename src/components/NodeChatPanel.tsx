"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAppStore } from "@/lib/store";
import type { IndustryBlock, IndustryMap, ChatMessage } from "@/types";

/* ── helpers ── */

function findBlock(nodes: IndustryBlock[], id: string): IndustryBlock | undefined {
  for (const n of nodes) {
    if (n.id === id) return n;
    if (n.subNodes) {
      const found = findBlock(n.subNodes, id);
      if (found) return found;
    }
  }
  return undefined;
}

/** Serialize all enrichment data on a node into a compact text block for the AI context window. */
function serializeNodeContext(block: IndustryBlock, mapData: IndustryMap): string {
  const lines: string[] = [
    `NODE: "${block.label}"`,
    `CATEGORY: ${block.category}`,
    `INDUSTRY: ${mapData.industry}`,
  ];
  if (mapData.jurisdiction) lines.push(`JURISDICTION: ${mapData.jurisdiction}`);
  if (mapData.archetype) lines.push(`ARCHETYPE: ${mapData.archetype}`);
  if (block.description) lines.push(`DESCRIPTION: ${block.description}`);
  if (block.objective) lines.push(`OBJECTIVE: ${block.objective}`);
  if (block.revenueModel) lines.push(`REVENUE MODEL: ${block.revenueModel}`);
  if (block.keyActors?.length) lines.push(`KEY ACTORS: ${block.keyActors.join(", ")}`);
  if (block.keyTools?.length) lines.push(`KEY TOOLS: ${block.keyTools.join(", ")}`);
  if (block.typicalClients?.length) lines.push(`TYPICAL CLIENTS: ${block.typicalClients.join(", ")}`);
  if (block.costDrivers?.length) lines.push(`COST DRIVERS: ${block.costDrivers.join(", ")}`);
  if (block.regulatoryNotes) lines.push(`REGULATORY: ${block.regulatoryNotes}`);
  if (block.painPoints?.length) lines.push(`PAIN POINTS: ${block.painPoints.join("; ")}`);
  if (block.unmetNeeds?.length) lines.push(`UNMET NEEDS: ${block.unmetNeeds.join("; ")}`);
  if (block.entryBarriers?.length) lines.push(`ENTRY BARRIERS: ${block.entryBarriers.join("; ")}`);
  if (block.demandTrend) lines.push(`DEMAND TREND: ${block.demandTrend.direction} — ${block.demandTrend.rationale}`);
  if (block.competitiveSaturation) lines.push(`COMPETITIVE SATURATION: ${block.competitiveSaturation.level} — ${block.competitiveSaturation.playerEstimate}`);
  if (block.marginProfile) lines.push(`MARGIN PROFILE: gross=${block.marginProfile.gross}, net=${block.marginProfile.net} — ${block.marginProfile.verdict}`);
  if (block.disruptionRisk) lines.push(`DISRUPTION RISK: ${block.disruptionRisk.level} — ${block.disruptionRisk.threats.join("; ")}`);
  if (block.clientSwitchingCosts) lines.push(`CLIENT SWITCHING COSTS: ${block.clientSwitchingCosts}`);
  if (block.valueChainPosition) lines.push(`VALUE CHAIN POSITION: ${block.valueChainPosition}`);
  if (block.opportunityScore) lines.push(`OPPORTUNITY SCORE: ${block.opportunityScore.score}/10 — ${block.opportunityScore.reasoning}`);
  if (block.nodeRelevance) lines.push(`NODE RELEVANCE: ${block.nodeRelevance}`);
  if (block.expenseRange) lines.push(`EXPENSE RANGE: monthly=${block.expenseRange.monthly}, annual=${block.expenseRange.annual}`);
  if (block.incomeRange) lines.push(`INCOME RANGE: low=${block.incomeRange.low}, high=${block.incomeRange.high}`);
  if (block.opportunities?.length) {
    lines.push(`OPPORTUNITIES:`);
    block.opportunities.forEach((o, i) => {
      lines.push(`  ${i + 1}. ${o.title}: ${o.description}${o.sourceUrl ? ` [${o.sourceUrl}]` : ""}`);
    });
  }
  if (block.connectionInsights?.length) {
    lines.push(`CONNECTION INSIGHTS:`);
    block.connectionInsights.forEach((ci) => {
      lines.push(`  → ${ci.connectionLabel}: ${ci.insight}`);
    });
  }
  if (block.subNodes?.length) {
    lines.push(`SUB-NODES: ${block.subNodes.map((s) => s.label).join(", ")}`);
  }
  return lines.join("\n");
}

/* ── main component ── */

export default function NodeChatPanel() {
  const selectedNodeId = useAppStore((s) => s.selectedNodeId);
  const mapData = useAppStore((s) => s.mapData);
  const darkMode = useAppStore((s) => s.darkMode);
  const nodeChatHistories = useAppStore((s) => s.nodeChatHistories);
  const appendChatMessage = useAppStore((s) => s.appendChatMessage);
  const updateLastAssistantMessage = useAppStore((s) => s.updateLastAssistantMessage);
  const pendingQuote = useAppStore((s) => s.pendingQuote);
  const setPendingQuote = useAppStore((s) => s.setPendingQuote);

  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [webSearch, setWebSearch] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const messages: ChatMessage[] =
    selectedNodeId ? nodeChatHistories[selectedNodeId] || [] : [];

  // Find the current block
  const block =
    mapData && selectedNodeId
      ? findBlock(mapData.rootNodes, selectedNodeId)
      : undefined;

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, messages[messages.length - 1]?.content]);

  // Auto-resize textarea
  const adjustTextarea = useCallback(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 80) + "px";
  }, []);

  const handleSend = useCallback(async () => {
    const trimmed = input.trim();
    if (!trimmed || isStreaming || !selectedNodeId || !block || !mapData) return;

    setInput("");
    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }

    // Add user message
    appendChatMessage(selectedNodeId, { role: "user", content: trimmed });

    // Prepare messages for API (include full history)
    const currentHistory = [...(nodeChatHistories[selectedNodeId] || []), { role: "user" as const, content: trimmed }];
    const nodeContext = serializeNodeContext(block, mapData);

    // Add placeholder assistant message
    appendChatMessage(selectedNodeId, { role: "assistant", content: "" });
    setIsStreaming(true);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: currentHistory.map((m) => ({ role: m.role, content: m.content })),
          nodeContext,
          webSearch,
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Request failed" }));
        updateLastAssistantMessage(selectedNodeId, `⚠ ${err.error || "Request failed"}`);
        setIsStreaming(false);
        return;
      }

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let accumulated = "";
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const payload = JSON.parse(line.slice(6));
            if (payload.delta) {
              accumulated += payload.delta;
              updateLastAssistantMessage(selectedNodeId, accumulated);
            }
            if (payload.error) {
              accumulated += `\n⚠ ${payload.error}`;
              updateLastAssistantMessage(selectedNodeId, accumulated);
            }
          } catch {
            // malformed JSON line, skip
          }
        }
      }

      // Ensure final content is set
      if (accumulated) {
        updateLastAssistantMessage(selectedNodeId, accumulated);
      }
    } catch (err: any) {
      if (err.name !== "AbortError") {
        updateLastAssistantMessage(
          selectedNodeId,
          `⚠ ${err.message || "Connection failed"}`
        );
      }
    } finally {
      setIsStreaming(false);
      abortRef.current = null;
    }
  }, [input, isStreaming, selectedNodeId, block, mapData, nodeChatHistories, webSearch, appendChatMessage, updateLastAssistantMessage]);

  // Abort stream on unmount / node switch
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, [selectedNodeId]);

  // Consume pending quote from Details tab selection
  useEffect(() => {
    if (!pendingQuote) return;
    setInput((prev) => {
      const prefix = prev.trim() ? prev.trim() + "\n\n" : "";
      return `${prefix}> ${pendingQuote}\n\n`;
    });
    setPendingQuote(null);
    // Focus the textarea after inserting the quote
    setTimeout(() => {
      textareaRef.current?.focus();
      adjustTextarea();
    }, 50);
  }, [pendingQuote, setPendingQuote, adjustTextarea]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  if (!block) return null;

  const muted = "var(--muted)";

  return (
    <div className="flex flex-col h-full">
      {/* Messages area */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 detail-scrollbar">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center px-4 opacity-60">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" style={{ color: muted }}>
              <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
            </svg>
            <p className="text-sm mt-3" style={{ color: muted }}>
              Ask anything about <strong style={{ color: "var(--foreground)" }}>{block.label}</strong>
            </p>
            <p className="text-xs mt-1" style={{ color: muted }}>
              Opportunities, market dynamics, entry strategies…
            </p>
          </div>
        )}

        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[85%] px-3 py-2 rounded-xl text-sm leading-relaxed ${
                msg.role === "user" ? "chat-bubble-user" : "chat-bubble-assistant"
              }`}
              style={
                msg.role === "user"
                  ? {
                      background: "var(--accent)",
                      color: "#ffffff",
                      borderBottomRightRadius: 4,
                    }
                  : {
                      background: darkMode ? "var(--surface)" : "#f3f4f6",
                      color: "var(--foreground)",
                      borderBottomLeftRadius: 4,
                      border: `1px solid var(--border)`,
                    }
              }
            >
              {msg.content || (
                <span className="chat-typing">
                  <span className="chat-typing-dot" />
                  <span className="chat-typing-dot" />
                  <span className="chat-typing-dot" />
                </span>
              )}
              {/* Show streaming cursor for the last assistant message while streaming */}
              {isStreaming &&
                msg.role === "assistant" &&
                i === messages.length - 1 &&
                msg.content && (
                  <span className="chat-cursor" />
                )}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input bar */}
      <div
        className="flex-shrink-0 px-4 py-4"
        style={{ borderTop: "1px solid var(--border)" }}
      >
        {/* Web search toggle */}
        <div className="flex items-center gap-2 mb-2">
          <button
            onClick={() => setWebSearch(!webSearch)}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium transition-all"
            style={{
              background: webSearch
                ? darkMode ? "rgba(245,158,11,0.15)" : "rgba(245,158,11,0.1)"
                : darkMode ? "rgba(255,255,255,0.06)" : "#f3f4f6",
              color: webSearch ? "#f59e0b" : darkMode ? "#9ca3af" : "#6b7280",
              border: `1px solid ${webSearch ? "rgba(245,158,11,0.3)" : "var(--border)"}`,
            }}
          >
            {/* Globe icon */}
            <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 0a8 8 0 100 16A8 8 0 008 0zM1.5 8a6.5 6.5 0 0112.58-2.3H11.4c-.2-1.14-.56-2.13-1.04-2.87A6.52 6.52 0 001.5 8zm5.34-6.36c-.7.85-1.24 2.04-1.5 3.46H2.82a6.52 6.52 0 014.02-3.46zM5.2 6.1h5.6c.12.6.2 1.24.2 1.9s-.08 1.3-.2 1.9H5.2c-.12-.6-.2-1.24-.2-1.9s.08-1.3.2-1.9zm.14 5.2h5.32c-.26 1.42-.8 2.61-1.5 3.46a6.52 6.52 0 01-2.32 0c-.7-.85-1.24-2.04-1.5-3.46zm7.84-1.4h-2.52c.08-.6.14-1.23.14-1.9s-.06-1.3-.14-1.9h2.52a6.46 6.46 0 010 3.8zM13.18 5.1h-2.52c-.2-1.14-.56-2.13-1.04-2.87A6.52 6.52 0 0113.18 5.1zM2.82 10.9h2.52c.2 1.14.56 2.13 1.04 2.87A6.52 6.52 0 012.82 10.9zm7.56 2.87c.48-.74.84-1.73 1.04-2.87h2.52a6.52 6.52 0 01-3.56 2.87z" />
            </svg>
            Web
          </button>
          {webSearch && (
            <span className="text-[10px]" style={{ color: muted }}>
              AI will search the web for live data
            </span>
          )}
        </div>

        {/* Input row */}
        <div className="flex items-end gap-2">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              adjustTextarea();
            }}
            onKeyDown={handleKeyDown}
            placeholder={`Ask about ${block.label}…`}
            disabled={isStreaming}
            rows={2}
            className="flex-1 resize-none rounded-xl px-4 py-3 text-sm outline-none transition-all focus:ring-2 focus:ring-[var(--accent)] focus:ring-opacity-40"
            style={{
              background: darkMode ? "var(--surface)" : "#f9fafb",
              color: "var(--foreground)",
              border: "1.5px solid var(--border)",
              maxHeight: 120,
              opacity: isStreaming ? 0.5 : 1,
              fontSize: 14,
            }}
          />
          <button
            onClick={handleSend}
            disabled={isStreaming || !input.trim()}
            className="flex-shrink-0 w-10 h-10 flex items-center justify-center rounded-xl transition-all"
            style={{
              background:
                isStreaming || !input.trim()
                  ? darkMode ? "rgba(255,255,255,0.06)" : "#f3f4f6"
                  : "var(--accent)",
              color:
                isStreaming || !input.trim()
                  ? darkMode ? "#4b5563" : "#9ca3af"
                  : "#ffffff",
              cursor: isStreaming || !input.trim() ? "not-allowed" : "pointer",
            }}
            title="Send message"
          >
            <svg width="18" height="18" viewBox="0 0 16 16" fill="currentColor">
              <path d="M1.5 1.5l13 6.5-13 6.5V9l8-1-8-1V1.5z" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
