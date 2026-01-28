"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import ProofUploader from "@/components/admin/proof-uploader";
import {
  createCarpentryProjectExpense,
  createCarpentryProjectMaterialList,
  createCarpentryProjectPurchaseOrder,
  createProductionOrder,
} from "@/server/actions/carpentry";
import type {
  CarpentryProject,
  CarpentryProjectExpense,
  CarpentryProjectMaterialList,
  CarpentryProjectPurchaseOrder,
  Order,
  PayrollEmployee,
  ProductionOrder,
} from "@prisma/client";

type ProjectWithExtras = CarpentryProject & {
  files: { id: string; url: string; fileType: string; filename?: string }[];
  clientPayments: { amountUSD: number }[];
  materialLists: (CarpentryProjectMaterialList & { items: { name: string; unitPriceUSD: number; quantity: number }[] })[];
  purchaseOrders: (CarpentryProjectPurchaseOrder & { sale?: Order | null })[];
  expenses: CarpentryProjectExpense[];
  productionOrders: (ProductionOrder & { tasks?: { id: string; description: string; status: string }[] })[];
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
  { key: "finance", label: "Finanzas" },
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
  const saleFormHref = (() => {
    const params = new URLSearchParams();
    const customerName = project.clientName?.trim() || "trends172,ca";
    params.set("customerName", customerName);
    params.set("customerEmail", project.clientEmail?.trim() || "root@carpihogar.com");
    params.set("customerPhone", project.clientPhone?.trim() || "04245262306");
    params.set("customerTaxId", "J-31758009-5");
    params.set("customerFiscalAddress", "Av Industrial, Edificio Teca, Barinas, Estado Barinas, Venezuela");
    params.set("docType", "recibo");
    params.set("lockDocType", "1");
    params.set("carpentryProjectId", project.id);
    params.set("backTo", `/dashboard/admin/carpinteria/${project.id}`);
    return `/dashboard/admin/ventas/nueva?${params.toString()}`;
  })();

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
            {project.materialLists.map((list) => (
              <div key={list.id} className="rounded-xl border border-dashed border-gray-300 p-3 text-sm">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold">{list.name}</div>
                  <div className="text-xs text-gray-500">{new Date(list.uploadedAt).toLocaleDateString()}</div>
                </div>
                <p className="text-xs text-gray-500">{list.description}</p>
                {list.items?.length ? (
                  <div className="mt-2 text-xs text-gray-600">
                    {list.items.map((item, idx) => (
                      <div key={idx} className="flex items-center justify-between text-[11px] px-1 py-0.5">
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
            ))}
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
      case "finance":
        return financeContent;
      default:
        return summaryContent;
    }
  }, [activeTab, summaryContent, documentContent, purchaseContent, expensesContent, productionContent, financeContent]);

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
