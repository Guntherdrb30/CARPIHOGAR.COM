"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, CardBody, Chip, Button, Tabs, Tab } from "@heroui/react";
import { Bell, CheckCheck } from "lucide-react";
import { toast } from "sonner";
import { DriverLocationClient } from "./DriverLocationClient";

type DeliveryOrder = {
  id: string;
  shortId: string;
  customer: string;
  phone?: string | null;
  address: string;
  city: string;
  createdAt: string;
};

type DeliveryNotification = {
  id: string;
  type: string;
  title: string;
  body: string;
  createdAt: string;
  readAt: string | null;
};

interface Props {
  available: DeliveryOrder[];
  mine: DeliveryOrder[];
}

export default function DeliveryDashboardClient({ available, mine }: Props) {
  const [tab, setTab] = useState<"available" | "mine">("available");
  const [availableState, setAvailableState] =
    useState<DeliveryOrder[]>(available);
  const [mineState, setMineState] = useState<DeliveryOrder[]>(mine);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<DeliveryNotification[]>(
    [],
  );
  const [showNotifications, setShowNotifications] = useState(false);
  const [loadingNotifications, setLoadingNotifications] = useState(false);
  const [pushStatus, setPushStatus] = useState<
    "idle" | "enabled" | "blocked" | "loading"
  >("idle");

  const unreadCount = useMemo(
    () => notifications.filter((n) => !n.readAt).length,
    [notifications],
  );

  const fetchNotifications = async () => {
    try {
      setLoadingNotifications(true);
      const res = await fetch(
        "/api/delivery/notifications?limit=20&unreadOnly=false",
      );
      const data = await res.json().catch(() => ({} as any));
      if (!res.ok || !data?.ok) return;
      const rows = (data.rows || []) as any[];
      setNotifications(
        rows.map((n) => ({
          id: String(n.id),
          type: String(n.type),
          title: String(n.title),
          body: String(n.body),
          createdAt: new Date(n.createdAt).toISOString(),
          readAt: n.readAt ? new Date(n.readAt as any).toISOString() : null,
        })),
      );
    } finally {
      setLoadingNotifications(false);
    }
  };

  useEffect(() => {
    fetchNotifications();
    const id = window.setInterval(fetchNotifications, 30000);
    return () => window.clearInterval(id);
  }, []);

  const markAllRead = async () => {
    try {
      await fetch("/api/delivery/notifications/read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ all: true }),
      });
      setNotifications((prev) =>
        prev.map((n) =>
          n.readAt
            ? n
            : {
                ...n,
                readAt: new Date().toISOString(),
              },
        ),
      );
    } catch {
      // ignore
    }
  };

  const urlBase64ToUint8Array = (base64String: string) => {
    const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  };

  const enablePushNotifications = async () => {
    try {
      setPushStatus("loading");
      if (typeof window === "undefined") return;
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
        toast.error(
          "Este navegador no soporta notificaciones push. Prueba con Chrome/Edge en Android.",
        );
        setPushStatus("blocked");
        return;
      }

      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        setPushStatus("blocked");
        toast.error(
          "Debes permitir las notificaciones en el navegador para activarlas.",
        );
        return;
      }

      const reg = await navigator.serviceWorker.register("/driver-sw.js");
      let sub = await reg.pushManager.getSubscription();

      const publicKey = process.env.NEXT_PUBLIC_WEB_PUSH_PUBLIC_KEY;
      if (!sub) {
        if (!publicKey) {
          toast.error(
            "Falta configurar la clave pública de Web Push en el servidor.",
          );
          setPushStatus("idle");
          return;
        }
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey),
        });
      }

      const res = await fetch("/api/delivery/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sub.toJSON()),
      });
      const data = await res.json().catch(() => ({} as any));
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || "No se pudo registrar la suscripción");
      }

      setPushStatus("enabled");
      toast.success("Notificaciones push activadas en este dispositivo");
    } catch (e: any) {
      setPushStatus("idle");
      toast.error(e?.message || "Error al activar notificaciones push");
    }
  };

  const handleClaim = async (orderId: string) => {
    setBusyId(orderId);
    try {
      const res = await fetch("/api/delivery/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId }),
      });
      const data = await res.json().catch(() => ({} as any));
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || "No se pudo tomar la entrega");
      }
      setAvailableState((prev) => prev.filter((o) => o.id !== orderId));
      const claimed = availableState.find((o) => o.id === orderId);
      if (claimed) {
        setMineState((prev) => [...prev, claimed]);
      }
      toast.success("Entrega asignada a ti");
      setTab("mine");
    } catch (e: any) {
      toast.error(e?.message || "Error al tomar entrega");
    } finally {
      setBusyId(null);
    }
  };

  const handleComplete = async (orderId: string) => {
    let rating: number | null = null;
    try {
      const input = window.prompt(
        "Califica al cliente (1 a 5). Deja en blanco para omitir.",
        "5",
      );
      if (input != null && input.trim() !== "") {
        const n = Number(input.trim());
        if (Number.isFinite(n) && n >= 1 && n <= 5) {
          rating = Math.round(n);
        }
      }
    } catch {
      rating = null;
    }

    setBusyId(orderId);
    try {
      const res = await fetch("/api/delivery/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId, rating }),
      });
      const data = await res.json().catch(() => ({} as any));
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || "No se pudo marcar entregado");
      }
      setMineState((prev) => prev.filter((o) => o.id !== orderId));
      toast.success("Entrega marcada como entregada");
    } catch (e: any) {
      toast.error(e?.message || "Error al marcar entregado");
    } finally {
      setBusyId(null);
    }
  };

  const totalAvailable = availableState.length;
  const totalMine = mineState.length;

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <Card className="border-0 bg-gradient-to-r from-white/80 via-white to-amber-50/60 shadow-md">
        <CardBody className="flex flex-col gap-4 px-4 py-4 md:flex-row md:items-center md:justify-between md:px-6">
          <div className="space-y-2">
            <Chip
              variant="flat"
              color="warning"
              size="sm"
              className="bg-amber-50 text-amber-700"
            >
              Logística Carpihogar · Barinas
            </Chip>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-gray-900 md:text-3xl">
                Panel de Delivery
              </h1>
              <p className="mt-1 max-w-xl text-sm text-gray-600 md:text-[15px]">
                Toma entregas disponibles en Barinas, mantén tu GPS activo y
                marca tus pedidos como entregados para que el equipo pueda
                liquidar tus servicios.
              </p>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-gray-500">
              <Chip size="sm" variant="bordered" className="border-gray-200">
                Entregas disponibles: {totalAvailable}
              </Chip>
              <Chip size="sm" variant="bordered" className="border-gray-200">
                Mis entregas activas: {totalMine}
              </Chip>
              <Chip
                size="sm"
                variant="flat"
                color={unreadCount > 0 ? "danger" : "default"}
                className="ml-auto cursor-pointer"
                onClick={() => setShowNotifications((v) => !v)}
              >
                <Bell className="mr-1 h-3 w-3" />
                Notificaciones {unreadCount > 0 ? `(${unreadCount})` : ""}
              </Chip>
            </div>
            <div className="mt-1">
              <Button
                as="a"
                href="/api/delivery/contrato/pdf"
                target="_blank"
                size="sm"
                variant="bordered"
              >
                Ver contrato en PDF
              </Button>
            </div>
          </div>
          <div className="mt-4 w-full md:mt-0 md:w-80">
            <DriverLocationClient />
          </div>
        </CardBody>
      </Card>

      {showNotifications && (
        <Card className="border-0 bg-white shadow-md">
          <CardBody className="px-4 py-4 md:px-6">
            <div className="mb-3 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Bell className="h-4 w-4 text-amber-600" />
                <span className="text-sm font-semibold text-gray-800">
                  Notificaciones recientes
                </span>
                {loadingNotifications && (
                  <span className="text-[11px] text-gray-500">
                    Actualizando…
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="light"
                  onPress={fetchNotifications}
                >
                  Actualizar
                </Button>
                <Button
                  size="sm"
                  variant="light"
                  startContent={<CheckCheck className="h-3 w-3" />}
                  onPress={markAllRead}
                  isDisabled={unreadCount === 0}
                >
                  Marcar como leídas
                </Button>
                <Button
                  size="sm"
                  color="warning"
                  className="bg-amber-600 text-white hover:bg-amber-700"
                  isDisabled={pushStatus === "loading" || pushStatus === "enabled"}
                  onPress={enablePushNotifications}
                >
                  {pushStatus === "enabled"
                    ? "Push activado"
                    : pushStatus === "loading"
                      ? "Activando..."
                      : "Activar push en este dispositivo"}
                </Button>
              </div>
            </div>
            {notifications.length === 0 && (
              <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 px-4 py-4 text-center text-xs text-gray-500">
                No tienes notificaciones por ahora. Cuando se libere un nuevo
                delivery en Barinas aparecerá aquí.
              </div>
            )}
            <div className="space-y-2">
              {notifications.map((n) => (
                <div
                  key={n.id}
                  className={`rounded-lg border px-3 py-2 text-xs ${
                    n.readAt
                      ? "border-gray-100 bg-gray-50"
                      : "border-amber-200 bg-amber-50"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-gray-800">
                      {n.title}
                    </span>
                    <span className="text-[10px] text-gray-500">
                      {new Date(n.createdAt).toLocaleString()}
                    </span>
                  </div>
                  <div className="mt-1 text-gray-700">{n.body}</div>
                  {!n.readAt && (
                    <span className="mt-1 inline-block rounded-full bg-amber-500 px-2 py-0.5 text-[10px] font-medium text-white">
                      Nuevo
                    </span>
                  )}
                </div>
              ))}
            </div>
          </CardBody>
        </Card>
      )}

      <Card className="border-0 bg-white shadow-md">
        <CardBody className="px-4 py-4 md:px-6">
          <Tabs
            selectedKey={tab}
            onSelectionChange={(key) => setTab(key as "available" | "mine")}
            aria-label="Secciones de entregas"
            className="mb-4"
          >
            <Tab key="available" title={`Disponibles (${totalAvailable})`} />
            <Tab key="mine" title={`Mis entregas (${totalMine})`} />
          </Tabs>

          {tab === "available" && (
            <div className="space-y-3">
              {availableState.length === 0 && (
                <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 px-4 py-6 text-center text-sm text-gray-500">
                  No hay entregas disponibles en este momento.
                </div>
              )}
              {availableState.map((o) => (
                <div
                  key={o.id}
                  className="flex flex-col gap-3 rounded-lg border border-gray-100 bg-white px-4 py-3 shadow-sm md:flex-row md:items-center md:justify-between"
                >
                  <div className="space-y-0.5 text-sm">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-gray-900">
                        Pedido #{o.shortId}
                      </span>
                      <Chip size="sm" variant="flat" color="warning">
                        Disponible
                      </Chip>
                    </div>
                    <div className="text-gray-700">
                      Cliente: {o.customer || "Sin nombre"}
                    </div>
                    <div className="text-gray-700">
                      Dirección: {o.address}, {o.city}
                    </div>
                    <div className="text-xs text-gray-500">
                      Creado: {new Date(o.createdAt).toLocaleString()}
                    </div>
                  </div>
                  <div className="flex items-center justify-end gap-2">
                    <Button
                      size="sm"
                      color="warning"
                      className="bg-amber-600 text-white hover:bg-amber-700"
                      isDisabled={busyId === o.id}
                      onPress={() => handleClaim(o.id)}
                    >
                      {busyId === o.id ? "Tomando..." : "Tomar entrega"}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {tab === "mine" && (
            <div className="space-y-3">
              {mineState.length === 0 && (
                <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 px-4 py-6 text-center text-sm text-gray-500">
                  No tienes entregas activas en este momento.
                </div>
              )}
              {mineState.map((o) => (
                <div
                  key={o.id}
                  className="flex flex-col gap-3 rounded-lg border border-gray-100 bg-white px-4 py-3 shadow-sm md:flex-row md:items-center md:justify-between"
                >
                  <div className="space-y-0.5 text-sm">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-gray-900">
                        Pedido #{o.shortId}
                      </span>
                      <Chip size="sm" variant="flat" color="success">
                        Asignado a ti
                      </Chip>
                    </div>
                    <div className="text-gray-700">
                      Cliente: {o.customer || "Sin nombre"}{" "}
                      {o.phone ? `· Tel: ${o.phone}` : ""}
                    </div>
                    <div className="text-gray-700">
                      Dirección: {o.address}, {o.city}
                    </div>
                    <div className="text-xs text-gray-500">
                      Creado: {new Date(o.createdAt).toLocaleString()}
                    </div>
                  </div>
                  <div className="flex items-center justify-end gap-2">
                    <Button
                      size="sm"
                      variant="bordered"
                      as="a"
                      href={`/api/shipments/${o.id}/pdf`}
                      target="_blank"
                    >
                      Ver guía PDF
                    </Button>
                    <Button
                      size="sm"
                      color="success"
                      className="bg-green-600 text-white hover:bg-green-700"
                      isDisabled={busyId === o.id}
                      onPress={() => handleComplete(o.id)}
                    >
                      {busyId === o.id ? "Guardando..." : "Marcar entregado"}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
