"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import ProofUploader from "@/components/admin/proof-uploader";
import {
  createCarpentryProjectExpense,
  createCarpentryProjectInventoryDelivery,
  createCarpentryProjectMaterialList,
  createCarpentryProjectPurchaseOrder,
  createCarpentryTask,
  createProductionOrder,
  updateCarpentryTaskStatus,
} from "@/server/actions/carpentry";
import type {
  CarpentryProject,
  CarpentryProjectExpense,
  CarpentryProjectInventoryDelivery,
  CarpentryProjectInventoryDeliveryItem,
  CarpentryProjectInventoryEntry,
  CarpentryProjectMaterialList,
  CarpentryProjectPhase,
  CarpentryProjectPurchaseOrder,
  CarpentryTask,
  Order,
  PayrollEmployee,
  ProductionOrder,
} from "@prisma/client";

type ProjectWithExtras = CarpentryProject & {
  files: { id: string; url: string; fileType: string; filename?: string }[];
  clientPayments: { amountUSD: number }[];
  subprojects?: { id: string; name: string }[];
  materialLists: (CarpentryProjectMaterialList & {
    items: { name: string; unitPriceUSD: number; quantity: number; sku?: string | null; productId?: string | null }[];
    deliveredBy?: PayrollEmployee | null;
    subproject?: { id: string; name: string } | null;
  })[];
  purchaseOrders: (CarpentryProjectPurchaseOrder & {
    sale?: Order | null;
    subproject?: { id: string; name: string } | null;
  })[];
  inventoryEntries: (CarpentryProjectInventoryEntry & {
    purchaseOrder?: CarpentryProjectPurchaseOrder | null;
  })[];
  inventoryDeliveries: (CarpentryProjectInventoryDelivery & {
    deliveredBy?: PayrollEmployee | null;
    items: (CarpentryProjectInventoryDeliveryItem & {
      entry?: CarpentryProjectInventoryEntry | null;
    })[];
  })[];
  expenses: CarpentryProjectExpense[];
  productionOrders: (ProductionOrder & { tasks?: { id: string; description: string; status: string }[] })[];
  tasks: (CarpentryTask & { employee: PayrollEmployee })[];
};

type Props = {
  project: ProjectWithExtras;
  employees: PayrollEmployee[];
};

const tabOrder = [
  { key: "summary", label: "Resumen" },
  { key: "documents", label: "Documentos" },
  { key: "purchases", label: "Compras" },
  { key: "expenses", label: "Gastos" },
  { key: "production", label: "Producción" },
  { key: "progress", label: "Avances" },
  { key: "finance", label: "Finanzas" },
];

const stageDefinitions: { key: CarpentryProjectPhase; label: string; description: string }[] = [
  { key: "CORTE_CANTEADO", label: "Corte y canteado", description: "Preparación y protección de chapas y cantos." },
  { key: "ARMADO_ESTRUCTURA", label: "Armado de estructura", description: "Montaje de bastidores y soportes principales." },
  { key: "ARMADO_PUERTAS", label: "Armado de puertas y frente", description: "Fabricación y ajuste de puertas y paneles." },
  { key: "INSTALACION_HERRAJES", label: "Instalación de herrajes", description: "Colocación de bisagras, correderas y tiradores." },
  { key: "EMBALAJE", label: "Embalaje", description: "Empaque final y etiquetado para transporte." },
  { key: "ALMACEN", label: "Almacén", description: "Almacenamiento y control previo al despacho." },
];

export default function CarpentryProjectTabs({ project, employees }: Props) {
  const [activeTab, setActiveTab] = useState<string>("summary");
  const total = Number(project.totalAmountUSD || 0);
  const clientPaid = Number(
    project.clientPayments?.reduce((acc, payment) => acc + Number(payment.amountUSD || 0), 0) || 0,
  );
  const balance = total - clientPaid;
  const fabricationGoal = (total * (Number(project.fabricationPct || 70) || 0)) / 100;
  const installationGoal = (total * (Number(project.installationPct || 30) || 0)) / 100;
  const fabricationPaid = Number(project.fabricationPaidUSD || 0);
  const installationPaid = Number(project.installationPaidUSD || 0);
  const expenseTotal = project.expenses?.reduce((acc, exp) => acc + Number(exp.totalCostUSD || 0), 0) || 0;
  const purchaseTotal = project.purchaseOrders?.reduce((acc, po) => acc + Number(po.totalUSD || 0), 0) || 0;
  const coverImage = project.files?.find((f) => f.fileType === "IMAGEN")?.url || project.files?.[0]?.url || "";
  const progressFabrication = fabricationGoal ? Math.min(100, (fabricationPaid / fabricationGoal) * 100) : 0;
  const progressInstallation = installationGoal
    ? Math.min(100, (installationPaid / installationGoal) * 100)
    : 0;
  const baseSaleParams = {
    customerName: project.clientName?.trim() || "trends172,ca",
    customerEmail: project.clientEmail?.trim() || "root@carpihogar.com",
    customerPhone: project.clientPhone?.trim() || "04245262306",
    customerTaxId: "J-31758009-5",
    customerFiscalAddress: "Av Industrial, Edificio Teca, Barinas, Estado Barinas, Venezuela",
    docType: "recibo",
    lockDocType: "1",
    carpentryProjectId: project.id,
    backTo: `/dashboard/admin/carpinteria/${project.id}`,
  };
  const buildSaleHref = (extra: Record<string, string | undefined> = {}) => {
    const params = new URLSearchParams();
    Object.entries(baseSaleParams).forEach(([key, value]) => {
      if (value) params.set(key, value);
    });
    Object.entries(extra).forEach(([key, value]) => {
      if (value) params.set(key, value);
      else params.delete(key);
    });
    return `/dashboard/admin/ventas/nueva?${params.toString()}`;
  };
  const saleFormHref = buildSaleHref();

  const formatDateShort = (value?: string | Date) => {
    const date = value ? new Date(value) : null;
    if (!date || Number.isNaN(date.getTime())) return "—";
    return `${date.toLocaleDateString()} ${date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
  };

  const stageProgress = stageDefinitions.map((stage) => {
    const stageTasks = (project.tasks || []).filter((task) => task.phase === stage.key);
    const completed = stageTasks.filter((task) => task.status === "COMPLETADA").length;
    const inProgress = stageTasks.filter((task) => task.status === "EN_PROGRESO").length;
    const pending = stageTasks.filter((task) => task.status === "PENDIENTE").length;
    const progress = stageTasks.length ? Math.round((completed / stageTasks.length) * 100) : 0;
    const latestTask = [...stageTasks].sort(
      (a, b) => Number(new Date(String(b.workDate))) - Number(new Date(String(a.workDate))),
    )[0];
    const responsible =
      latestTask?.employee?.name || stageTasks[0]?.employee?.name || "Sin responsable";
    return { stage, tasks: stageTasks, completed, inProgress, pending, progress, latestTask, responsible };
  });

  const stageLabelMap = stageDefinitions.reduce<Record<string, string>>((acc, stage) => {
    acc[stage.key] = stage.label;
    return acc;
  }, {});
  stageLabelMap["FABRICACION"] = stageLabelMap["FABRICACION"] || "Fabricación";
  stageLabelMap["INSTALACION"] = stageLabelMap["INSTALACION"] || "Instalación";

  const inventoryEntries = project.inventoryEntries || [];
  const inventoryDeliveries = [...(project.inventoryDeliveries || [])].sort((a, b) => {
    const aTime = new Date(a.deliveredAt || a.createdAt).getTime();
    const bTime = new Date(b.deliveredAt || b.createdAt).getTime();
    return bTime - aTime;
  });
  const purchaseOrders = project.purchaseOrders || [];
  const totalInventoryAcquired = inventoryEntries.reduce(
    (acc, entry) => acc + Number(entry.unitPriceUSD || 0) * Number(entry.quantity || 0),
    0,
  );
  const remainingInventoryValue = inventoryEntries.reduce(
    (acc, entry) => acc + Number(entry.unitPriceUSD || 0) * Number(entry.remainingQuantity || 0),
    0,
  );
  const summaryContent = (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-[300px,1fr] gap-4">
        <div className="relative rounded-3xl border border-white/20 bg-white/10 p-4 text-white">
          {coverImage && (
            <img src={coverImage} className="h-40 w-full rounded-2xl object-cover" alt="Portada del proyecto" />
          )}
          <div className="mt-3 space-y-1">
            <div className="text-xs uppercase tracking-[0.3em] text-white/60">Proyecto</div>
            <h3 className="text-lg font-semibold">{project.name}</h3>
            <p className="text-sm text-white/70">{project.description || "Sin descripción"}</p>
            <div className="text-xs text-white/60">Cliente: {project.clientName || "—"}</div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-white">
            <div className="text-xs uppercase tracking-[0.3em] text-white/60">Monto total</div>
            <div className="mt-2 text-2xl font-semibold">${total.toFixed(2)}</div>
            <div className="text-xs text-white/60">Saldo: ${balance.toFixed(2)}</div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-white">
            <div className="text-xs uppercase tracking-[0.3em] text-white/60">Pagos</div>
            <div className="mt-2 text-2xl font-semibold">${clientPaid.toFixed(2)}</div>
            <div className="text-xs text-white/60">Abonos registrados</div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-white">
            <div className="text-xs uppercase tracking-[0.3em] text-white/60">Compras</div>
            <div className="mt-2 text-2xl font-semibold">${purchaseTotal.toFixed(2)}</div>
            <div className="text-xs text-white/60">Materiales adquiridos</div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-white">
            <div className="text-xs uppercase tracking-[0.3em] text-white/60">Gastos</div>
            <div className="mt-2 text-2xl font-semibold">${expenseTotal.toFixed(2)}</div>
            <div className="text-xs text-white/60">Externos registrados</div>
          </div>
        </div>
      </div>
      <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-white">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs uppercase tracking-[0.3em] text-white/60">Fabricación</div>
            <div className="text-base font-semibold">
              ${fabricationPaid.toFixed(2)} / ${fabricationGoal.toFixed(2)}
            </div>
          </div>
          <div className="text-xs text-white/60">{progressFabrication.toFixed(1)}% completado</div>
        </div>
        <div className="mt-3 h-2 rounded-full bg-white/20">
          <div className="h-2 rounded-full bg-emerald-400" style={{ width: `${progressFabrication}%` }} />
        </div>
        <div className="mt-4 flex items-center justify-between">
          <div>
            <div className="text-xs uppercase tracking-[0.3em] text-white/60">Instalación</div>
            <div className="text-base font-semibold">
              ${installationPaid.toFixed(2)} / ${installationGoal.toFixed(2)}
            </div>
          </div>
          <div className="text-xs text-white/60">{progressInstallation.toFixed(1)}% completado</div>
        </div>
        <div className="mt-3 h-2 rounded-full bg-white/20">
          <div className="h-2 rounded-full bg-blue-500" style={{ width: `${progressInstallation}%` }} />
        </div>
      </div>
    </div>
  );

  const documentContent = (
    <div className="space-y-4">
      <div className="rounded-2xl border border-gray-200 bg-white p-4">
        <div className="text-xs font-semibold uppercase text-gray-500">Archivos cargados</div>
        {project.files?.length ? (
          <ul className="mt-2 space-y-2 text-sm text-gray-600">
            {project.files.map((file) => (
              <li key={file.id}>
                <a href={file.url} target="_blank" rel="noreferrer" className="text-blue-600 underline">
                  {file.filename || file.url}
                </a>{" "}
                <span className="text-xs text-gray-400">({file.fileType})</span>
                {file.description && (
                  <div className="text-[11px] text-gray-500 mt-0.5">{file.description}</div>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-xs text-gray-400">Sin documentos aún.</p>
        )}
      </div>
      <div className="rounded-2xl border border-gray-200 bg-white p-4 space-y-3">
        <div className="text-sm font-semibold text-gray-900">Lista de materiales</div>
        <form action={createCarpentryProjectMaterialList} className="space-y-3 text-sm">
          <input type="hidden" name="projectId" value={project.id} />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <input
              name="name"
              required
              placeholder="Nombre de la lista"
              className="border rounded px-3 py-2 w-full"
            />
            <input name="description" placeholder="Descripción (opcional)" className="border rounded px-3 py-2 w-full" />
          </div>
          <div>
            <label className="text-xs text-gray-500">Subproyecto (opcional)</label>
            <select name="subprojectId" className="w-full border rounded px-3 py-2">
              <option value="">Proyecto completo</option>
              {project.subprojects?.map((subproject) => (
                <option key={subproject.id} value={subproject.id}>{subproject.name}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1 text-xs text-gray-600">
            <label>Archivo PDF/Excel</label>
            <ProofUploader inputName="fileUrl" />
          </div>
          <label className="text-xs text-gray-500 block">Ítems (JSON)</label>
          <textarea
            name="items"
            rows={4}
            defaultValue='[{"name":"Melamina","quantity":1,"unitPriceUSD":0}]'
            className="w-full rounded border px-3 py-2 text-sm"
          />
          <button className="w-full rounded bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700">
            Guardar lista de materiales
          </button>
        </form>
        {project.materialLists?.length ? (
          <div className="space-y-3 pt-3">
            {project.materialLists.map((list) => {
              const listTotal =
                (list.items?.reduce(
                  (sum, item) => sum + Number(item.unitPriceUSD || 0) * Number(item.quantity || 0),
                  0,
                ) || 0);
              const listHref = buildSaleHref({
                carpentryMaterialListId: list.id,
                carpentrySubprojectId: list.subprojectId || undefined,
              });
              return (
                <div key={list.id} className="space-y-3 rounded-xl border border-dashed border-gray-300 p-3 text-sm shadow-sm">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <div className="text-sm font-semibold text-gray-900">{list.name}</div>
                      <div className="text-[11px] text-gray-500">
                        {list.subproject ? `Subproyecto: ${list.subproject.name}` : "Proyecto general"}
                      </div>
                      <div className="text-[11px] text-gray-400">
                        {new Date(list.uploadedAt).toLocaleDateString()}
                      </div>
                    </div>
                    <Link
                      href={listHref}
                      className="rounded-full border border-blue-600 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.3em] text-blue-600 transition hover:bg-blue-50"
                    >
                      Comprar lista
                    </Link>
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-gray-600">
                    <span>Total estimado</span>
                    <span className="font-semibold text-gray-900">${listTotal.toFixed(2)}</span>
                  </div>
                  <p className="text-xs text-gray-500">{list.description || "Sin descripción"}</p>
                  {list.items?.length ? (
                    <div className="space-y-1 text-xs text-gray-600">
                      {list.items.map((item, idx) => (
                        <div key={idx} className="flex items-center justify-between px-1 py-0.5">
                          <span>{item.name}</span>
                          <span>
                            {item.quantity} × ${Number(item.unitPriceUSD).toFixed(2)}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-gray-400">Sin ítems registrados.</p>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-xs text-gray-500">No hay listas de materiales aún.</p>
        )}
      </div>
    </div>
  );

  const purchaseContent = (
    <div className="space-y-4">
      <div className="rounded-2xl border border-dashed border-gray-300 bg-gray-50 p-4 space-y-3 text-sm text-gray-600">
        <div className="flex flex-col gap-2">
          <p className="text-xs uppercase tracking-[0.4em] text-gray-500">Compras oficiales</p>
          <h3 className="text-base font-semibold text-gray-900">Registrar materiales como venta</h3>
          <p>
            Cada compra se registra como una venta oficial para trends172,ca, se puede repetir tantas veces como lo necesites
            y se mostrará en este historial junto a su recibo.
          </p>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-500">Recibos de compra vinculados a este proyecto</span>
          <Link
            href={saleFormHref}
            className="rounded-full bg-blue-600 px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-white transition hover:bg-blue-700"
          >
            Hacer compra
          </Link>
        </div>
      </div>
      <div className="rounded-2xl border border-gray-200 bg-white p-4">
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold text-gray-900">Órdenes de compra Carpihogar</div>
          <span className="text-xs text-gray-500">{project.purchaseOrders?.length ?? 0} compras</span>
        </div>
        {project.purchaseOrders?.length ? (
          <div className="mt-3 space-y-2 text-sm text-gray-600">
            {project.purchaseOrders.map((order) => {
              const sale = order.sale;
              const docLabel = sale?.documentType === "FACTURA" ? "Factura" : "Recibo";
              return (
                <div key={order.id} className="rounded-xl border border-slate-100 px-3 py-2 space-y-1">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="font-semibold text-gray-800">Compra #{order.id.slice(0, 6)}</div>
                      <div className="text-xs text-gray-500">
                        {order.status} · ${Number(order.totalUSD).toFixed(2)} · {docLabel}
                      </div>
                    </div>
                    {sale?.id && (
                      <Link
                        href={`/dashboard/admin/ventas/${sale.id}`}
                        className="text-xs uppercase tracking-[0.3em] text-blue-600 hover:underline"
                      >
                        Ver venta
                      </Link>
                    )}
                  </div>
                  {sale?.payment && (
                    <div className="text-xs text-gray-500">
                      Pago: {sale.payment.method} · Ref. {sale.payment.reference || "N/A"}
                    </div>
                  )}
                  <div className="text-xs text-gray-400">
                    {new Date(order.createdAt).toLocaleDateString()}
                    {sale?.payment?.status ? ` · Estado del pago: ${sale.payment.status}` : ""}
                  </div>
                  <div className="text-[11px] text-blue-600">
                    {order.subproject ? `Subproyecto: ${order.subproject.name}` : "Proyecto general"}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="mt-2 text-xs text-gray-400">Sin órdenes registradas.</p>
        )}
      </div>
      <form action={createCarpentryProjectPurchaseOrder} className="rounded-2xl border border-gray-200 bg-white p-4 space-y-3 text-sm">
        <input type="hidden" name="projectId" value={project.id} />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <input name="totalUSD" type="number" step="0.01" placeholder="Total de la compra" className="border rounded px-3 py-2" required />
          <input name="saleId" placeholder="ID de venta (si aplica)" className="border rounded px-3 py-2" />
        </div>
        <select name="subprojectId" className="w-full border rounded px-3 py-2">
          <option value="">Subproyecto (opcional)</option>
          {project.subprojects?.map((subproject) => (
            <option key={subproject.id} value={subproject.id}>
              {subproject.name}
            </option>
          ))}
        </select>
        <select name="status" className="w-full border rounded px-3 py-2">
          <option value="PENDING">Pendiente</option>
          <option value="APPROVED">Aprobada</option>
          <option value="DELIVERED">Entregada</option>
          <option value="CANCELLED">Cancelada</option>
        </select>
        <div className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="requiresSecret" id="requires-secret" className="h-4 w-4" />
          <label htmlFor="requires-secret" className="text-gray-600">
            Exigir clave secreta del admin/root
          </label>
        </div>
        <input name="secretToken" placeholder="Clave secreta (si aplica)" className="border rounded px-3 py-2" />
        <textarea name="notes" rows={2} placeholder="Notas (opcional)" className="w-full rounded border px-3 py-2 text-sm" />
        <button className="w-full rounded bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700">
          Crear orden de compra
        </button>
      </form>
    </div>
  );

  const expensesContent = (
    <div className="space-y-4">
      <div className="rounded-2xl border border-gray-200 bg-white p-4">
        <div className="text-sm font-semibold text-gray-900">Gastos registrados</div>
        {project.expenses?.length ? (
          <ul className="mt-3 space-y-2 text-sm text-gray-600">
            {project.expenses.map((expense) => (
              <li key={expense.id} className="flex items-center justify-between border-b pb-2 last:border-0">
                <div>
                  <div className="font-semibold text-gray-800">{expense.provider}</div>
                  <div className="text-xs text-gray-500">
                    {expense.expenseType} · ${Number(expense.totalCostUSD).toFixed(2)}
                  </div>
                </div>
                <div className="text-xs text-gray-400">{new Date(expense.date).toLocaleDateString()}</div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-xs text-gray-400">Sin gastos adicionales.</p>
        )}
      </div>
      <form action={createCarpentryProjectExpense} className="rounded-2xl border border-gray-200 bg-white p-4 space-y-3 text-sm">
        <input type="hidden" name="projectId" value={project.id} />
        <input name="provider" placeholder="Proveedor" className="w-full border rounded px-3 py-2" required />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <input name="invoiceNumber" placeholder="Factura / Recibo" className="w-full border rounded px-3 py-2" />
          <select name="expenseType" className="w-full border rounded px-3 py-2">
            <option value="MATERIAL">Material</option>
            <option value="FLETE">Flete</option>
            <option value="EXTRA">Extra</option>
            <option value="OTRO">Otro</option>
          </select>
        </div>
        <textarea name="description" rows={2} placeholder="Descripción" className="w-full border rounded px-3 py-2 text-sm" required />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <input name="date" type="date" className="w-full border rounded px-3 py-2" required />
          <input name="quantity" type="number" min="1" className="w-full border rounded px-3 py-2" defaultValue={1} />
          <input name="unitCostUSD" type="number" step="0.01" className="w-full border rounded px-3 py-2" required />
        </div>
        <input name="totalCostUSD" type="number" step="0.01" className="w-full border rounded px-3 py-2" placeholder="Total USD" required />
        <div className="space-y-1 text-xs text-gray-600">
          <label>Recibo / comprobante</label>
          <ProofUploader inputName="receiptUrl" />
        </div>
        <button className="w-full rounded bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-500">
          Registrar gasto
        </button>
      </form>
    </div>
  );

  const productionContent = (
    <div className="space-y-4">
      <div className="rounded-2xl border border-gray-200 bg-white p-4">
        <div className="text-sm font-semibold text-gray-900">Ordenes de producción</div>
        {project.productionOrders?.length ? (
          <ul className="mt-3 space-y-3 text-sm text-gray-600">
            {project.productionOrders.map((order) => (
              <li key={order.id} className="rounded-2xl border border-dashed border-gray-300 p-3">
                <div className="flex items-center justify-between">
                  <div className="text-xs uppercase tracking-[0.3em] text-gray-500">Orden #{order.number}</div>
                  <span className="text-[11px] font-semibold uppercase text-blue-600">{order.status}</span>
                </div>
                <div className="mt-1 text-sm text-gray-700">
                  Carpintero: {employees.find((e) => e.id === order.carpentryLeadId)?.name || "—"}, Supervisor:
                  {employees.find((e) => e.id === order.supervisorId)?.name || "—"}
                </div>
                <div className="mt-2 text-xs text-gray-500">
                  Inicio: {order.scheduledStart ? new Date(order.scheduledStart).toLocaleDateString() : "—"} ·
                  Fin: {order.scheduledEnd ? new Date(order.scheduledEnd).toLocaleDateString() : "—"} · Instalación:{" "}
                  {order.installDate ? new Date(order.installDate).toLocaleDateString() : "—"}
                </div>
                <div className="mt-2 h-2 w-full rounded-full bg-gray-200">
                  <div className="h-2 rounded-full bg-indigo-600" style={{ width: `${Number(order.progressPct)}%` }} />
                </div>
                {order.tasks?.length ? (
                  <ul className="mt-2 space-y-1 text-[11px] text-gray-500">
                    {order.tasks.map((task) => (
                      <li key={task.id}>
                        {task.description} · {task.status}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-xs text-gray-400">Sin órdenes de producción aún.</p>
      )}
    </div>
    <form action={createProductionOrder} className="rounded-2xl border border-gray-200 bg-white p-4 space-y-3 text-sm">
        <input type="hidden" name="projectId" value={project.id} />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <input name="number" placeholder="Número de orden" className="w-full border rounded px-3 py-2" required />
          <select name="carpentryLeadId" className="w-full border rounded px-3 py-2">
            <option value="">Carpintero</option>
            {employees.map((employee) => (
              <option key={employee.id} value={employee.id}>
                {employee.name}
              </option>
            ))}
          </select>
        </div>
        <select name="supervisorId" className="w-full border rounded px-3 py-2">
          <option value="">Supervisor</option>
          {employees.map((employee) => (
            <option key={employee.id} value={employee.id}>
              {employee.name}
            </option>
          ))}
        </select>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <input name="scheduledStart" type="date" className="w-full border rounded px-3 py-2" />
          <input name="scheduledEnd" type="date" className="w-full border rounded px-3 py-2" />
          <input name="installDate" type="date" className="w-full border rounded px-3 py-2" />
        </div>
        <select name="status" className="w-full border rounded px-3 py-2">
          <option value="PLANNED">Planificada</option>
          <option value="IN_PROGRESS">En progreso</option>
          <option value="COMPLETED">Completada</option>
          <option value="ON_HOLD">En pausa</option>
        </select>
        <input name="progressPct" type="number" min="0" max="100" placeholder="Progreso (%)" className="w-full border rounded px-3 py-2" />
        <select name="phase" className="w-full border rounded px-3 py-2">
          <option value="">Fase</option>
          <option value="FABRICACION">Fabricación</option>
          <option value="INSTALACION">Instalación</option>
        </select>
        <textarea name="notes" rows={2} placeholder="Notas" className="w-full border rounded px-3 py-2 text-sm" />
        <button className="w-full rounded bg-amber-600 px-3 py-2 text-sm font-semibold text-white hover:bg-amber-500">
          Crear orden de producción
        </button>
      </form>
    </div>
  );

  const advancesContent = (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
        {stageProgress.map((info) => (
          <div key={info.stage.key} className="rounded-2xl border border-gray-200 bg-white p-4 space-y-2 text-sm">
            <div className="text-xs font-semibold uppercase tracking-[0.3em] text-gray-500">
              {info.stage.label}
            </div>
            <div className="h-1.5 rounded-full bg-gray-200">
              <div
                className="h-1.5 rounded-full bg-emerald-500"
                style={{ width: `${Math.min(100, info.progress)}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-[11px] text-gray-500">
              <span>{info.tasks.length} tareas</span>
              <span>{info.progress}% completado</span>
            </div>
            <div className="text-[11px] text-gray-600">
              Responsable: {info.responsible}
            </div>
            <div className="text-[11px] text-gray-500">
              Última actualización: {formatDateShort(info.latestTask?.workDate || info.latestTask?.createdAt)}
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[2fr,1fr] gap-4">
        <div className="rounded-2xl border border-gray-200 bg-white p-4 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold">Tareas y responsables</div>
              <div className="text-xs text-gray-500">
                Asigna tareas por fase y controla su estado.
              </div>
            </div>
          </div>
          <form action={createCarpentryTask} className="grid grid-cols-1 md:grid-cols-6 gap-3">
            <input type="hidden" name="projectId" value={project.id} />
            <input type="hidden" name="backTo" value={`/dashboard/admin/carpinteria/${project.id}`} />
            <div>
              <label className="text-xs text-gray-500">Descripción</label>
              <input name="description" className="form-input" required />
            </div>
            <div>
              <label className="text-xs text-gray-500">Prespuesto USD</label>
              <input name="amountUSD" type="number" step="0.01" className="form-input" />
            </div>
            <div>
              <label className="text-xs text-gray-500">Fecha</label>
              <input name="workDate" type="date" className="form-input" />
            </div>
            <div>
              <label className="text-xs text-gray-500">Fase</label>
              <select name="phase" className="form-input">
                <option value="">Fase</option>
                {[
                  { key: "FABRICACION", label: "Fabricación" },
                  { key: "INSTALACION", label: "Instalación" },
                  ...stageDefinitions,
                ].map((phase) => (
                  <option key={phase.key} value={phase.key}>
                    {phase.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500">Responsable</label>
              <select name="employeeId" className="form-input">
                <option value="">Selecciona</option>
                {employees.map((employee) => (
                  <option key={employee.id} value={employee.id}>
                    {employee.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-end">
              <button className="w-full bg-blue-600 text-white px-3 py-1 rounded" type="submit">
                Agregar tarea
              </button>
            </div>
          </form>
          <div className="overflow-x-auto rounded border border-gray-200">
            <table className="w-full table-auto text-sm">
              <thead>
                <tr className="bg-gray-100 text-gray-600">
                  <th className="px-2 py-1 text-left">Fecha</th>
                  <th className="px-2 py-1 text-left">Responsable</th>
                  <th className="px-2 py-1 text-left">Fase</th>
                  <th className="px-2 py-1 text-left">Descripción</th>
                  <th className="px-2 py-1 text-left">Estado</th>
                  <th className="px-2 py-1 text-left">Acción</th>
                </tr>
              </thead>
              <tbody>
                {[...(project.tasks || [])]
                  .sort((a, b) => Number(new Date(String(b.workDate))) - Number(new Date(String(a.workDate))))
                  .map((task) => (
                    <tr key={task.id} className="border-t">
                      <td className="px-2 py-1">
                        {formatDateShort(task.workDate)}
                      </td>
                      <td className="px-2 py-1">
                        {task.employee?.name || "Sin asignar"}
                      </td>
                      <td className="px-2 py-1">
                        {stageLabelMap[task.phase || "FABRICACION"] || "General"}
                      </td>
                      <td className="px-2 py-1">{task.description}</td>
                      <td className="px-2 py-1">
                        <form action={updateCarpentryTaskStatus} className="inline-flex items-center gap-2">
                          <input type="hidden" name="id" value={task.id} />
                          <select
                            name="status"
                            defaultValue={task.status}
                            className="border rounded px-2 py-0.5 text-xs"
                          >
                            <option value="PENDIENTE">Pendiente</option>
                            <option value="EN_PROGRESO">En progreso</option>
                            <option value="COMPLETADA">Completada</option>
                          </select>
                          <button className="text-xs text-blue-600" type="submit">
                            Guardar
                          </button>
                        </form>
                      </td>
                      <td className="px-2 py-1 text-xs text-gray-500">
                        {task.amountUSD ? `$${Number(task.amountUSD).toFixed(2)}` : "Sin monto"}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="space-y-4">
          <div className="rounded-2xl border border-gray-200 bg-white p-4 space-y-3 text-sm">
            <div className="text-sm font-semibold">Entregas por fase</div>
            {inventoryDeliveries.length ? (
              <div className="space-y-3 text-sm text-gray-600">
                {inventoryDeliveries.map((delivery) => (
                  <div key={delivery.id} className="rounded border border-gray-100 p-3 space-y-1">
                    <div className="flex items-center justify-between">
                      <div className="font-semibold">Entrega #{delivery.id.slice(0, 6)}</div>
                      <span className="text-[11px] text-gray-500 uppercase tracking-[0.2em]">
                        {stageLabelMap[delivery.phase || "FABRICACION"] || "Inventario"}
                      </span>
                    </div>
                    {delivery.notes && (
                      <div className="text-xs text-gray-500">{delivery.notes}</div>
                    )}
                    <div className="text-[11px] text-gray-500">
                      {formatDateShort(delivery.deliveredAt)}
                      {delivery.deliveredBy?.name ? ` · ${delivery.deliveredBy.name}` : ""}
                    </div>
                    <div className="text-xs text-gray-600">
                      {delivery.items?.map(
                        (item) => `${item.entry?.itemName || "Material"} (${item.quantity})`,
                      ).join(", ")}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-xs text-gray-500">Aún no hay entregas registradas.</div>
            )}
          </div>
          <div className="rounded-2xl border border-gray-200 bg-white p-3 space-y-3 text-xs">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold">Inventario de compras</div>
                <div className="text-xs text-gray-500">Total comprado: ${totalInventoryAcquired.toFixed(2)}</div>
                <div className="text-xs text-gray-500">Valor restante: ${remainingInventoryValue.toFixed(2)}</div>
              </div>
              <a
                href="/dashboard/admin/compras"
                className="text-xs text-blue-600 hover:underline"
              >
                Ver compras
              </a>
            </div>
            {inventoryEntries.length ? (
              <div className="space-y-2">
                {inventoryEntries.map((entry) => (
                  <div key={entry.id} className="flex items-center justify-between border-b pb-2 last:border-0">
                    <div>
                      <div className="font-semibold text-gray-800">{entry.itemName}</div>
                      <div className="text-[11px] text-gray-500">
                        OC {entry.purchaseOrder?.id ? entry.purchaseOrder.id.slice(-6) : "------"} · {Number(entry.remainingQuantity || 0)}/
                        {Number(entry.quantity || 0)} disponibles
                      </div>
                    </div>
                    <div className="text-right text-xs text-gray-500">
                      ${Number(entry.unitPriceUSD || 0).toFixed(2)}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-xs text-gray-500">No hay inventario sincronizado.</div>
            )}
          </div>
          <div className="rounded-2xl border border-gray-200 bg-white p-3 space-y-3 text-sm">
            <div className="text-sm font-semibold">Registrar entrega</div>
            <form action={createCarpentryProjectInventoryDelivery} className="space-y-3 text-sm">
              <input type="hidden" name="projectId" value={project.id} />
              <div className="space-y-2">
                <label className="text-xs text-gray-500">Orden vinculada</label>
                <select name="purchaseOrderId" className="w-full border rounded px-3 py-2 text-sm" required>
                  <option value="">Selecciona una orden con inventario</option>
                  {purchaseOrders
                    .filter((order) => inventoryEntries.some((entry) => entry.purchaseOrderId === order.id))
                    .map((order) => (
                      <option key={order.id} value={order.id}>
                        OC {order.id.slice(-6)} · ${Number(order.totalUSD || 0).toFixed(2)}
                      </option>
                    ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-500">Fase</label>
                  <select name="phase" className="w-full border rounded px-3 py-2 text-sm">
                    <option value="">Fase (opcional)</option>
                    {stageDefinitions.map((stage) => (
                      <option key={stage.key} value={stage.key}>
                        {stage.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-500">Responsable</label>
                  <select name="deliveredById" className="w-full border rounded px-3 py-2 text-sm">
                    <option value="">Responsable (opcional)</option>
                    {employees.map((employee) => (
                      <option key={employee.id} value={employee.id}>
                        {employee.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="space-y-2 text-xs text-gray-600">
                <div className="font-semibold text-gray-800">Materiales disponibles</div>
                {inventoryEntries.length ? (
                  inventoryEntries.map((entry) => (
                    <div
                      key={entry.id}
                      className="flex flex-wrap items-center justify-between gap-2 border-b pb-2 last:border-0"
                    >
                      <div className="flex-1 min-w-0 text-xs">
                        <div className="font-semibold text-gray-800">{entry.itemName}</div>
                        <div className="text-[11px] text-gray-500">
                          OC {entry.purchaseOrder?.id ? entry.purchaseOrder.id.slice(-6) : "------"} · {Number(entry.remainingQuantity || 0)}/
                          {Number(entry.quantity || 0)} disponibles
                        </div>
                      </div>
                      <input
                        type="number"
                        name={`entry_${entry.id}`}
                        min="0"
                        max={Number(entry.remainingQuantity || 0)}
                        placeholder="Cant."
                        className="w-20 border rounded px-2 py-1 text-xs"
                        disabled={!Number(entry.remainingQuantity || 0)}
                      />
                    </div>
                  ))
                ) : (
                  <div className="text-xs text-gray-500">Sin inventario sincronizado.</div>
                )}
              </div>
              <textarea
                name="notes"
                rows={3}
                className="w-full rounded border px-3 py-2 text-sm"
                placeholder="Notas adicionales (fase, comprobante, etc.)"
              />
              <button
                type="submit"
                className="w-full rounded bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700"
              >
                Registrar entrega
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );

  const financeContent = (
    <div className="space-y-4">
      <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.4em] text-gray-500">Finanzas del proyecto</p>
            <h3 className="text-2xl font-semibold text-gray-900">{project.name}</h3>
          </div>
          {coverImage && (
            <img src={coverImage} alt="Portada" className="h-20 w-20 rounded-2xl object-cover" />
          )}
        </div>
        <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4 text-sm text-gray-600">
          <div className="rounded-2xl border border-dashed border-gray-300 p-4">
            <div className="text-xs uppercase text-gray-500">Ingresos</div>
            <div className="text-xl font-semibold text-gray-900">${total.toFixed(2)}</div>
          </div>
          <div className="rounded-2xl border border-dashed border-gray-300 p-4">
            <div className="text-xs uppercase text-gray-500">Gastos</div>
            <div className="text-xl font-semibold text-gray-900">${expenseTotal.toFixed(2)}</div>
          </div>
          <div className="rounded-2xl border border-dashed border-gray-300 p-4">
            <div className="text-xs uppercase text-gray-500">Utilidad</div>
            <div className="text-xl font-semibold text-green-600">${(total - expenseTotal).toFixed(2)}</div>
          </div>
        </div>
      </div>
    </div>
  );

  const activeContent = useMemo(() => {
    switch (activeTab) {
      case "documents":
        return documentContent;
      case "purchases":
        return purchaseContent;
      case "expenses":
        return expensesContent;
      case "production":
        return productionContent;
      case "progress":
        return advancesContent;
      case "finance":
        return financeContent;
      default:
        return summaryContent;
    }
  }, [
    activeTab,
    summaryContent,
    documentContent,
    purchaseContent,
    expensesContent,
    productionContent,
    advancesContent,
    financeContent,
  ]);

  return (
    <div className="mt-6 space-y-4">
      <div className="flex flex-wrap gap-2 text-xs font-semibold uppercase tracking-[0.3em] text-gray-500">
        {tabOrder.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className={`rounded-full px-4 py-2 transition ${activeTab === tab.key ? "bg-gray-900 text-white" : "bg-white text-gray-900 border border-gray-200"}`}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div className="rounded-3xl border border-gray-200 bg-gradient-to-br from-gray-950/60 via-slate-950 to-black p-5 shadow-2xl">
        {activeContent}
      </div>
    </div>
  );
}
