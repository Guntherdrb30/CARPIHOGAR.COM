"use client";
import React, { useEffect, useMemo, useRef, useState } from "react";
import MessageBubble from "./MessageBubble";
import ProductCard from "./ProductCard";
import CartView from "./CartView";
import { AssistantMessage, AssistantContent } from "./hooks/useAssistant";

export default function ChatWindow({ messages, onAction }: { messages: AssistantMessage[]; onAction?: (key: string) => void }) {
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = listRef.current; if (!el) return; el.scrollTop = el.scrollHeight;
  }, [messages]);

  const renderRich = (content: AssistantContent) => {
    return (
      <div className="space-y-3">
        {Array.isArray(content.products) && content.products.length > 0 && (
          <div className="space-y-2">
            {content.products.map((p: any) => <ProductCard key={p.id || p.slug || Math.random()} p={p} />)}
          </div>
        )}
        {content.cart && (
          <CartView cart={content.cart as any} onRelated={() => onAction?.('view_related')} />
        )}
      </div>
    );
  };

  return (
    <div ref={listRef} className="flex-1 overflow-auto p-3 space-y-2 atlas-scrollbar bg-[#F7F7F7]">
      {messages.map((m) => {
        const c = m.content;
        if (c.type === 'rich') {
          return (
            <div key={m.id} className={`${m.from === 'user' ? 'text-right' : ''}`}>
              {renderRich(c)}
            </div>
          );
        }
        return (
          <div key={m.id} className={`${m.from === 'user' ? 'text-right' : ''}`}>
            <MessageBubble from={m.from} content={c} onAction={onAction} />
          </div>
        );
      })}
    </div>
  );
}
