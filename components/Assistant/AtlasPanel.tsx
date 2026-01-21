"use client";
import React, { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import ChatWindow from "./ChatWindow";
import { useAssistantCtx } from "./AssistantProvider";
import { ShoppingCart } from "lucide-react";
import { useCartStore } from "@/store/cart";
import VoiceMic from "./VoiceMic";
import VoiceSelector from "./VoiceSelector";

const CONTEXT_KEYS = {
  addressId: "assistant:addressId",
  currency: "assistant:currency",
  paymentMethod: "assistant:paymentMethod",
  orderId: "assistant:orderId",
  awaitingAddress: "assistant:awaitingAddress",
  awaitingCurrency: "assistant:awaitingCurrency",
  awaitingPayment: "assistant:awaitingPayment",
  deliveryRequested: "assistant:deliveryRequested",
  deliveryEligible: "assistant:deliveryEligible",
  awaitingDelivery: "assistant:awaitingDelivery",
};

function safeGet(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key: string, value?: string) {
  try {
    if (!value) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {}
}

export default function AtlasPanel() {
  const a = useAssistantCtx();
  const [text, setText] = useState("");
  const [uploading, setUploading] = useState(false);
  const close = () => a.setOpen(false);
  const fileInputId = "assistant-proof-file";

  const send = async () => {
    if (!text.trim()) return;
    const t = text;
    setText("");
    await a.sendMessage(t);
  };

  const showCart = async () => {
    try {
      const r = await fetch("/api/assistant/ui-event", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "view_cart" }),
      });
      const j = await r.json();
      const cartData =
        j?.data?.items ? j.data : j?.data?.data?.items ? j.data.data : j?.cart?.items ? j.cart : null;
      if (cartData) {
        a.append({
          id: crypto.randomUUID(),
          from: "agent",
          at: Date.now(),
          content: { type: "rich", message: "Tu carrito", cart: cartData },
        } as any);
      }
    } catch {}
  };

  const handleAction = async (key: string) => {
    if (!key) return;

    if (key === "view_cart") {
      await showCart();
      return;
    }

    if (key === "start_checkout") {
      try {
        window.location.href = "/checkout/revisar";
      } catch {}
      return;
    }

    if (key === "open_login") {
      try {
        window.location.href = "/auth/login";
      } catch {}
      return;
    }

    if (key === "open_register") {
      try {
        window.location.href = "/auth/register";
      } catch {}
      return;
    }

    if (key.startsWith("select_address:")) {
      const addressId = key.split(":")[1] || "";
      if (addressId) {
        safeSet(CONTEXT_KEYS.addressId, addressId);
        safeSet(CONTEXT_KEYS.orderId, "");
        safeSet(CONTEXT_KEYS.deliveryRequested, "");
        safeSet(CONTEXT_KEYS.deliveryEligible, "");
        safeSet(CONTEXT_KEYS.awaitingDelivery, "");
        safeSet(CONTEXT_KEYS.awaitingAddress, "");
        await a.sendMessage("Usar esta direccion.");
      }
      return;
    }

    if (key === "choose_currency_usd" || key === "choose_currency_ves") {
      const currency = key === "choose_currency_usd" ? "USD" : "VES";
      safeSet(CONTEXT_KEYS.currency, currency);
      safeSet(CONTEXT_KEYS.orderId, "");
      safeSet(CONTEXT_KEYS.awaitingCurrency, "");
      await a.sendMessage(`Pago en ${currency}.`);
      return;
    }

    if (
      key === "choose_method_zelle" ||
      key === "choose_method_pm" ||
      key === "choose_method_transfer"
    ) {
      const method =
        key === "choose_method_zelle"
          ? "ZELLE"
          : key === "choose_method_pm"
            ? "PAGO_MOVIL"
            : "TRANSFERENCIA";
      const label =
        method === "ZELLE"
          ? "Zelle"
          : method === "PAGO_MOVIL"
            ? "Pago movil"
            : "Transferencia";
      safeSet(CONTEXT_KEYS.paymentMethod, method);
      safeSet(CONTEXT_KEYS.orderId, "");
      safeSet(CONTEXT_KEYS.awaitingPayment, "");
      await a.sendMessage(`Metodo de pago: ${label}.`);
      return;
    }

    if (key === "choose_delivery_yes" || key === "choose_delivery_no") {
      const wantsDelivery = key === "choose_delivery_yes";
      safeSet(CONTEXT_KEYS.deliveryRequested, wantsDelivery ? "1" : "0");
      safeSet(CONTEXT_KEYS.awaitingDelivery, "");
      await a.sendMessage(wantsDelivery ? "Si, deseo delivery." : "No necesito delivery.");
      return;
    }

    try {
      await fetch("/api/assistant/ui-event", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key }),
      });
    } catch {}
  };

  return (
    <AnimatePresence>
      {a.open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-[60]"
        >
          <div className="absolute inset-0 bg-black/35" onClick={close} />
          <motion.div
            initial={{ x: 500 }}
            animate={{ x: 0 }}
            exit={{ x: 500 }}
            transition={{ type: "spring", stiffness: 280, damping: 30 }}
            className="absolute right-0 top-0 h-full atlas-panel atlas-shadow flex flex-col w-full sm:w-[420px]"
          >
            <div className="flex items-center justify-between p-3 border-b bg-white rounded-tl-[16px]">
              <div className="flex items-center gap-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/logo-default.svg"
                  className="h-6 w-auto"
                  alt="Carpihogar"
                />
                <span className="font-semibold">Asistente</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={showCart}
                  className="relative p-2 rounded border text-sm"
                  title="Ver carrito"
                  aria-label="Ver carrito"
                >
                  <ShoppingCart size={16} />
                  {(() => {
                    try {
                      const n = useCartStore.getState().getTotalItems();
                      return n > 0 ? (
                        <span className="absolute -top-1 -right-1 bg-[var(--color-brand)] text-white text-[10px] rounded-full px-1.5 py-[1px]">
                          {n}
                        </span>
                      ) : null;
                    } catch {
                      return null;
                    }
                  })()}
                </button>
                <button
                  onClick={() => a.reset()}
                  className="px-2 py-1 rounded border text-sm"
                  title="Vaciar conversacion"
                >
                  Vaciar
                </button>
                <button
                  onClick={close}
                  className="px-2 py-1 rounded border text-sm"
                >
                  Cerrar
                </button>
              </div>
            </div>

            <ChatWindow messages={a.messages} onAction={handleAction} />

            <div className="p-3 border-t bg-white">
              <input
                id={fileInputId}
                type="file"
                accept="image/*"
                hidden
                onChange={async (e) => {
                  const f = e.currentTarget.files?.[0];
                  if (!f) return;
                  setUploading(true);
                  try {
                    const fd = new FormData();
                    fd.append("file", f);
                    const orderId = safeGet(CONTEXT_KEYS.orderId);
                    if (orderId) fd.append("orderId", orderId);
                    const r = await fetch("/api/assistant/upload-proof", {
                      method: "POST",
                      body: fd,
                    });
                    const j = await r.json();
                    if (j?.orderId) safeSet(CONTEXT_KEYS.orderId, j.orderId);
                    if (j?.ok) {
                      const receipt = j?.receiptUrl
                        ? `Recibo: ${j.receiptUrl}`
                        : "";
                      const baseMsg = "Recibi tu comprobante.";
                      const follow =
                        "Tu pago esta en revision. Te avisaremos al confirmarlo y luego procederemos al envio.";
                      const message = [baseMsg, receipt, follow]
                        .filter(Boolean)
                        .join(" ");
                      a.append({
                        id: crypto.randomUUID(),
                        from: "agent",
                        at: Date.now(),
                        content: { type: "text", message },
                      });
                    } else {
                      a.append({
                        id: crypto.randomUUID(),
                        from: "agent",
                        at: Date.now(),
                        content: {
                          type: "text",
                          message:
                            "No pude leer el soporte de pago. Puedes intentar con una imagen mas clara o ingresar el monto y la referencia.",
                        },
                      });
                    }
                  } catch {
                    a.append({
                      id: crypto.randomUUID(),
                      from: "agent",
                      at: Date.now(),
                      content: {
                        type: "text",
                        message:
                          "Hubo un problema al subir tu soporte. Intenta nuevamente.",
                      },
                    });
                  } finally {
                    setUploading(false);
                    try {
                      (e.currentTarget as any).value = "";
                    } catch {}
                  }
                }}
              />
              <div className="flex items-center gap-2">
                <input
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="Escribe un mensaje..."
                  className="flex-1 min-w-0 border rounded-full px-4 py-2 text-sm"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      send();
                    }
                  }}
                />
                <button
                  className="px-3 py-2 rounded-full atlas-button text-sm sm:text-base"
                  onClick={send}
                  disabled={a.loading}
                >
                  Enviar
                </button>
              </div>
              <div className="mt-2 flex items-center gap-2 flex-wrap">
                <button
                  className={`px-3 py-2 rounded-full text-xs sm:text-sm ${
                    uploading ? "opacity-60" : "atlas-button-alt"
                  }`}
                  onClick={() => {
                    try {
                      (document.getElementById(fileInputId) as HTMLInputElement)?.click();
                    } catch {}
                  }}
                  disabled={uploading}
                  title="Adjuntar soporte"
                >
                  {uploading ? "Subiendo..." : "Adjuntar"}
                </button>
                <VoiceSelector />
                <VoiceMic />
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
