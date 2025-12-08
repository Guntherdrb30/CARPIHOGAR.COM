import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import {
  getDeleteSecret,
  setDeleteSecret,
  getSettings,
  setDefaultMargins,
  setPaymentInstructions,
  refreshTasaFromBCV,
  setTasaManual,
  setDeliverySettings,
} from "@/server/actions/settings";
import { setRootRecoverySettings } from "@/server/actions/root-recovery";
import ShowToastFromSearch from "@/components/show-toast-from-search";
import { PendingButton } from "@/components/pending-button";
import { redirect } from "next/navigation";

export default async function SystemSettingsPage() {
  const session = await getServerSession(authOptions);
  const user = (session?.user as any) || {};
  const email = String(user?.email || "").toLowerCase();
  const rootEmail = String(process.env.ROOT_EMAIL || "root@carpihogar.com").toLowerCase();
  const isAdmin = user?.role === "ADMIN";
  const isRoot = isAdmin && email === rootEmail;

  if (!isAdmin) {
    return (
      <div className="container mx-auto p-4">
        <h1 className="text-2xl font-bold mb-4">Ajustes del Sistema</h1>
        <div className="border border-red-200 bg-red-50 text-red-800 px-3 py-2 rounded">
          No autorizado
        </div>
      </div>
    );
  }

  const [current, siteSettings] = await Promise.all([getDeleteSecret(), getSettings()]);

  return (
    <div className="container mx-auto p-4 space-y-4">
      <ShowToastFromSearch successParam="message" errorParam="error" />
      <h1 className="text-2xl font-bold">Ajustes del Sistema</h1>

      {/* Tasa oficial BCV */}
      <div className="bg-white p-4 rounded-lg shadow space-y-3">
        <h2 className="text-lg font-semibold">Tasa oficial BCV (Bs/USD)</h2>
        <p className="text-sm text-gray-600">
          Esta tasa se usa para convertir ventas y compras en bolívares. Puedes refrescarla manualmente,
          cargar un valor de emergencia o dejar que Vercel Cron la actualice automáticamente.
        </p>
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between max-w-3xl">
          <div className="text-sm text-gray-700">
            Tasa actual:{" "}
            <span className="font-semibold">
              {Number((siteSettings as any).tasaVES || 0).toFixed(4)} Bs/USD
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            <form
              action={async () => {
                "use server";
                try {
                  await refreshTasaFromBCV();
                } catch (e: any) {
                  const msg = encodeURIComponent(String(e?.message || "No se pudo actualizar la tasa"));
                  redirect("/dashboard/admin/ajustes/sistema?error=" + msg);
                }
                redirect("/dashboard/admin/ajustes/sistema?message=Tasa%20BCV%20actualizada");
              }}
            >
              <PendingButton className="px-3 py-2 bg-blue-600 text-white rounded" pendingText="Actualizando...">
                Refrescar desde BCV
              </PendingButton>
            </form>
            <form
              action={async (formData) => {
                "use server";
                const tasa = Number(formData.get("tasaManual") || 0);
                try {
                  await setTasaManual(tasa);
                } catch (e: any) {
                  const msg = encodeURIComponent(String(e?.message || "No se pudo guardar la tasa"));
                  redirect("/dashboard/admin/ajustes/sistema?error=" + msg);
                }
                redirect("/dashboard/admin/ajustes/sistema?message=Tasa%20actualizada%20manual");
              }}
              className="flex items-center gap-2"
            >
              <input
                name="tasaManual"
                type="number"
                step={0.0001}
                min={0}
                defaultValue={Number((siteSettings as any).tasaVES || 0)}
                className="form-input w-32"
                placeholder="Bs/USD"
              />
              <PendingButton className="px-3 py-2 bg-emerald-600 text-white rounded" pendingText="Guardando...">
                Guardar manual
              </PendingButton>
            </form>
          </div>
        </div>
        <div className="text-xs text-gray-600 bg-gray-50 p-3 rounded border">
          <div className="font-semibold mb-1">Automático con Vercel Cron</div>
          <p>
            Configura un cron en Vercel que llame <code>/api/cron/update-bcv?token=&lt;CRON_SECRET_BCV&gt;</code> a diario.
            Define la variable <code>CRON_SECRET_BCV</code> en Vercel y usa el mismo valor en la URL o cabecera
            <code> x-cron-token</code>.
          </p>
          <p className="mt-1">
            Ejemplo (Dashboard Vercel): Add Cron Job → Schedule <code>@daily</code> → Target
            <code> https://tu-proyecto.vercel.app/api/cron/update-bcv?token=&lt;CRON_SECRET_BCV&gt;</code>.
          </p>
        </div>
      </div>

      {/* Delivery local (tarifas y porcentajes) */}
      <div className="bg-white p-4 rounded-lg shadow space-y-3">
        <h2 className="text-lg font-semibold">Delivery local (tarifas y porcentajes)</h2>
        <p className="text-sm text-gray-600">
          Configura las tarifas por kilómetro y los mínimos para moto, carro y camioneta,
          así como el porcentaje de reparto entre delivery y empresa.
        </p>
        <form
          action={async (formData) => {
            "use server";
            try {
              await setDeliverySettings(formData);
              redirect("/dashboard/admin/ajustes/sistema?message=Delivery%20actualizado");
            } catch (e: any) {
              const msg = encodeURIComponent(String(e?.message || "No se pudo guardar delivery"));
              redirect("/dashboard/admin/ajustes/sistema?error=" + msg);
            }
          }}
          className="grid grid-cols-1 md:grid-cols-3 gap-3 max-w-4xl"
        >
          <div className="md:col-span-3 font-semibold">Tarifas por kilómetro (USD/km)</div>
          <div>
            <label className="block text-sm text-gray-700">Moto</label>
            <input
              name="deliveryMotoRatePerKmUSD"
              type="number"
              step="0.01"
              min={0}
              defaultValue={(siteSettings as any).deliveryMotoRatePerKmUSD ?? 0.5}
              className="border rounded px-2 py-1 w-full"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-700">Carro</label>
            <input
              name="deliveryCarRatePerKmUSD"
              type="number"
              step="0.01"
              min={0}
              defaultValue={(siteSettings as any).deliveryCarRatePerKmUSD ?? 0.75}
              className="border rounded px-2 py-1 w-full"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-700">Camioneta</label>
            <input
              name="deliveryVanRatePerKmUSD"
              type="number"
              step="0.01"
              min={0}
              defaultValue={(siteSettings as any).deliveryVanRatePerKmUSD ?? 1}
              className="border rounded px-2 py-1 w-full"
            />
          </div>

          <div className="md:col-span-3 font-semibold mt-2">Mínimos por viaje (USD)</div>
          <div>
            <label className="block text-sm text-gray-700">Mínimo moto</label>
            <input
              name="deliveryMotoMinFeeUSD"
              type="number"
              step="0.01"
              min={0}
              defaultValue={(siteSettings as any).deliveryMotoMinFeeUSD ?? 4}
              className="border rounded px-2 py-1 w-full"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-700">Mínimo camioneta</label>
            <input
              name="deliveryVanMinFeeUSD"
              type="number"
              step="0.01"
              min={0}
              defaultValue={(siteSettings as any).deliveryVanMinFeeUSD ?? 10}
              className="border rounded px-2 py-1 w-full"
            />
          </div>

          <div className="md:col-span-3 font-semibold mt-2">Porcentajes de reparto (%)</div>
          <div>
            <label className="block text-sm text-gray-700">% para Delivery</label>
            <input
              name="deliveryDriverSharePct"
              type="number"
              step="0.1"
              min={0}
              max={100}
              defaultValue={(siteSettings as any).deliveryDriverSharePct ?? 70}
              className="border rounded px-2 py-1 w-full"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-700">% para Empresa</label>
            <input
              name="deliveryCompanySharePct"
              type="number"
              step="0.1"
              min={0}
              max={100}
              defaultValue={(siteSettings as any).deliveryCompanySharePct ?? 30}
              className="border rounded px-2 py-1 w-full"
            />
          </div>
          <div className="md:col-span-3 flex gap-2 mt-2">
            <PendingButton className="px-3 py-2 bg-blue-600 text-white rounded" pendingText="Guardando...">
              Guardar delivery
            </PendingButton>
          </div>
        </form>
      </div>

      {/* Clave de eliminación */}
      <div className="bg-white p-4 rounded-lg shadow">
        <h2 className="text-lg font-semibold mb-2">Clave de eliminación</h2>
        <p className="text-sm text-gray-600 mb-3">
          Esta clave se usa para autorizar eliminaciones sensibles (abonos, productos, categorías, etc.).
        </p>
        <div className="mb-3 text-sm text-gray-700">Estado: {current ? "Configurada" : "No configurada"}</div>
        <form
          action={async (formData) => {
            "use server";
            try {
              await (setDeleteSecret as any)(formData);
              redirect("/dashboard/admin/ajustes/sistema?message=Clave%20cambiada");
            } catch (e: any) {
              const m = encodeURIComponent(String(e?.message || "No se pudieron guardar los cambios"));
              redirect("/dashboard/admin/ajustes/sistema?error=" + m);
            }
          }}
          className="grid grid-cols-1 md:grid-cols-2 gap-3 max-w-xl"
        >
          <div>
            <label className="block text-sm text-gray-700">Nueva clave</label>
            <input name="newSecret" type="password" minLength={6} required className="border rounded px-2 py-1 w-full" placeholder="Mínimo 6 caracteres" />
          </div>
          <div>
            <label className="block text-sm text-gray-700">Confirmar clave</label>
            <input name="confirm" type="password" minLength={6} required className="border rounded px-2 py-1 w-full" placeholder="Repite la clave" />
          </div>
          <div className="md:col-span-2 flex gap-2">
            <PendingButton className="px-3 py-2 bg-blue-600 text-white rounded" pendingText="Guardando...">
              Guardar clave
            </PendingButton>
            <a className="px-3 py-2 border rounded" href="/dashboard/admin/ajustes">
              Volver a ajustes
            </a>
          </div>
        </form>
      </div>

      {/* Recuperación de root por WhatsApp */}
      <div className="bg-white p-4 rounded-lg shadow">
        <h2 className="text-lg font-semibold mb-2">Recuperación de Root por WhatsApp</h2>
        <p className="text-sm text-gray-600 mb-3">
          Configura cómo se valida que el usuario root reciba códigos de recuperación por WhatsApp.
        </p>
        <form
          action={async (formData) => {
            "use server";
            try {
              await setRootRecoverySettings(formData);
              redirect("/dashboard/admin/ajustes/sistema?message=Root%20actualizado");
            } catch {
              redirect("/dashboard/admin/ajustes/sistema?error=No%20se%20pudo%20guardar");
            }
          }}
          className="grid grid-cols-1 md:grid-cols-2 gap-3 max-w-2xl"
        >
          <div>
            <label className="block text-sm text-gray-700">Teléfono root (WhatsApp)</label>
            <input
              name="rootPhone"
              defaultValue={(siteSettings as any).whatsappPhone || ""}
              className="border rounded px-2 py-1 w-full"
              placeholder="Ej: 0412-XXXXXXX"
            />
          </div>
          <div className="md:col-span-2 flex gap-2">
            <PendingButton className="px-3 py-2 bg-blue-600 text-white rounded" pendingText="Guardando...">
              Guardar configuración
            </PendingButton>
          </div>
        </form>
      </div>

      {/* Instrucciones de pago */}
      <div className="bg-white p-4 rounded-lg shadow">
        <h2 className="text-lg font-semibold mb-2">Instrucciones de pago</h2>
        <p className="text-sm text-gray-600 mb-3">
          Estos datos se usan en el checkout y comprobantes para mostrar al cliente cómo pagar (Zelle, Pago Móvil, Banesco, Mercantil).
        </p>
        <form
          action={async (formData) => {
            "use server";
            try {
              await setPaymentInstructions(formData);
              redirect("/dashboard/admin/ajustes/sistema?message=Pagos%20actualizados");
            } catch {
              redirect("/dashboard/admin/ajustes/sistema?error=No%20se%20pudo%20guardar");
            }
          }}
          className="grid grid-cols-1 md:grid-cols-3 gap-3 max-w-3xl"
        >
          <div className="md:col-span-3 font-semibold">USD → Zelle</div>
          <div>
            <label className="block text-sm text-gray-700">Correo Zelle</label>
            <input
              name="paymentZelleEmail"
              defaultValue={(siteSettings as any).paymentZelleEmail || ""}
              className="border rounded px-2 py-1 w-full"
              placeholder="zelle@empresa.com"
            />
          </div>

          <div className="md:col-span-3 font-semibold mt-4">VES → Pago Móvil</div>
          <div>
            <label className="block text-sm text-gray-700">Teléfono</label>
            <input
              name="paymentPmPhone"
              defaultValue={(siteSettings as any).paymentPmPhone || ""}
              className="border rounded px-2 py-1 w-full"
              placeholder="0412-XXXXXXX"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-700">RIF</label>
            <input
              name="paymentPmRif"
              defaultValue={(siteSettings as any).paymentPmRif || ""}
              className="border rounded px-2 py-1 w-full"
              placeholder="J-XXXXXXXX-X"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-700">Banco</label>
            <input
              name="paymentPmBank"
              defaultValue={(siteSettings as any).paymentPmBank || ""}
              className="border rounded px-2 py-1 w-full"
              placeholder="Nombre del banco"
            />
          </div>

          <div className="md:col-span-3 font-semibold mt-4">Depósitos/Transferencias → Banesco</div>
          <div>
            <label className="block text-sm text-gray-700">Nombre del titular</label>
            <input
              name="paymentBanescoName"
              defaultValue={(siteSettings as any).paymentBanescoName || ""}
              className="border rounded px-2 py-1 w-full"
              placeholder="Nombre del titular"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-700">Número de cuenta</label>
            <input
              name="paymentBanescoAccount"
              defaultValue={(siteSettings as any).paymentBanescoAccount || ""}
              className="border rounded px-2 py-1 w-full"
              placeholder="0000-0000-00-0000000000"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-700">RIF</label>
            <input
              name="paymentBanescoRif"
              defaultValue={(siteSettings as any).paymentBanescoRif || ""}
              className="border rounded px-2 py-1 w-full"
              placeholder="J-XXXXXXXX-X"
            />
          </div>

          <div className="md:col-span-3 font-semibold mt-4">Depósitos/Transferencias → Mercantil</div>
          <div>
            <label className="block text-sm text-gray-700">Nombre del titular</label>
            <input
              name="paymentMercantilName"
              defaultValue={(siteSettings as any).paymentMercantilName || ""}
              className="border rounded px-2 py-1 w-full"
              placeholder="Nombre del titular"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-700">Número de cuenta</label>
            <input
              name="paymentMercantilAccount"
              defaultValue={(siteSettings as any).paymentMercantilAccount || ""}
              className="border rounded px-2 py-1 w-full"
              placeholder="0000-0000-00-0000000000"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-700">RIF</label>
            <input
              name="paymentMercantilRif"
              defaultValue={(siteSettings as any).paymentMercantilRif || ""}
              className="border rounded px-2 py-1 w-full"
              placeholder="J-XXXXXXXX-X"
            />
          </div>

          <div className="md:col-span-3 flex gap-2 mt-2">
            <PendingButton className="px-3 py-2 bg-blue-600 text-white rounded" pendingText="Guardando...">
              Guardar datos
            </PendingButton>
            <a className="px-3 py-2 border rounded" href="/dashboard/admin/ajustes">
              Volver a ajustes
            </a>
          </div>
        </form>
      </div>

      {/* Márgenes por defecto */}
      <div className="bg-white p-4 rounded-lg shadow">
        <h2 className="text-lg font-semibold mb-2">Ganancias de productos (márgenes %)</h2>
        <p className="text-sm text-gray-600 mb-3">
          Se usan para calcular precios a partir del costo al importar compras o productos por CSV.
        </p>
        <form
          action={async (formData) => {
            "use server";
            try {
              await setDefaultMargins(formData);
              redirect("/dashboard/admin/ajustes/sistema?sys=ok");
            } catch {
              redirect("/dashboard/admin/ajustes/sistema?sys=err");
            }
          }}
          className="grid grid-cols-1 md:grid-cols-3 gap-3 max-w-3xl"
        >
          <div>
            <label className="block text-sm text-gray-700">Cliente (%)</label>
            <input
              name="defaultMarginClientPct"
              type="number"
              step="0.01"
              min={0}
              defaultValue={Number((siteSettings as any).defaultMarginClientPct ?? 40)}
              className="border rounded px-2 py-1 w-full"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-700">Aliado (%)</label>
            <input
              name="defaultMarginAllyPct"
              type="number"
              step="0.01"
              min={0}
              defaultValue={Number((siteSettings as any).defaultMarginAllyPct ?? 30)}
              className="border rounded px-2 py-1 w-full"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-700">Mayorista (%)</label>
            <input
              name="defaultMarginWholesalePct"
              type="number"
              step="0.01"
              min={0}
              defaultValue={Number((siteSettings as any).defaultMarginWholesalePct ?? 20)}
              className="border rounded px-2 py-1 w-full"
            />
          </div>
          <div className="md:col-span-3 flex gap-2">
            <PendingButton className="px-3 py-2 bg-blue-600 text-white rounded" pendingText="Guardando...">
              Guardar márgenes
            </PendingButton>
            <a className="px-3 py-2 border rounded" href="/dashboard/admin/ajustes">
              Volver a ajustes
            </a>
          </div>
        </form>
      </div>

      {/* Datos legales y correlativos de facturación (root) */}
      {isRoot && (
        <div className="bg-white p-4 rounded-lg shadow space-y-3">
          <h2 className="text-lg font-semibold">Datos legales / Facturación (Trends172, C.A)</h2>
          <p className="text-sm text-gray-600">
            Estos datos se usan en las facturas legales y para llevar el correlativo de facturas y
            recibos. Solo el usuario root puede modificarlos.
          </p>
          <form
            action={async (formData) => {
              "use server";
              const { setLegalBillingSettings } = await import("@/server/actions/settings");
              try {
                await setLegalBillingSettings(formData);
              } catch (e: any) {
                const msg = encodeURIComponent(
                  String(e?.message || "No se pudo guardar los datos legales"),
                );
                redirect("/dashboard/admin/ajustes/sistema?error=" + msg);
              }
              redirect("/dashboard/admin/ajustes/sistema?message=Datos%20legales%20actualizados");
            }}
            className="grid grid-cols-1 md:grid-cols-2 gap-3 max-w-4xl"
          >
            <div className="md:col-span-2">
              <label className="block text-sm text-gray-700">Nombre legal de la empresa</label>
              <input
                name="legalCompanyName"
                defaultValue={(siteSettings as any).legalCompanyName || "Trends172, C.A"}
                className="border rounded px-2 py-1 w-full"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-700">RIF</label>
              <input
                name="legalCompanyRif"
                defaultValue={(siteSettings as any).legalCompanyRif || "J-31758009-5"}
                className="border rounded px-2 py-1 w-full"
                placeholder="J-XXXXXXXX-X"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-700">Teléfono</label>
              <input
                name="legalCompanyPhone"
                defaultValue={(siteSettings as any).legalCompanyPhone || "04245192679"}
                className="border rounded px-2 py-1 w-full"
                placeholder="0424-0000000"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm text-gray-700">Dirección fiscal</label>
              <textarea
                name="legalCompanyAddress"
                defaultValue={
                  (siteSettings as any).legalCompanyAddress ||
                  "Av. Industrial, Edificio Teka, Ciudad Barinas, Estado Barinas"
                }
                className="border rounded px-2 py-1 w-full"
                rows={2}
              />
            </div>
            <div>
              <label className="block text-sm text-gray-700">Próximo número de factura</label>
              <input
                name="invoiceNextNumber"
                type="number"
                min={1}
                defaultValue={Number((siteSettings as any).invoiceNextNumber || 1)}
                className="border rounded px-2 py-1 w-full"
              />
              <p className="text-xs text-gray-500">
                El sistema usará este valor como siguiente correlativo de factura.
              </p>
            </div>
            <div>
              <label className="block text-sm text-gray-700">Próximo número de recibo</label>
              <input
                name="receiptNextNumber"
                type="number"
                min={1}
                defaultValue={Number((siteSettings as any).receiptNextNumber || 1)}
                className="border rounded px-2 py-1 w-full"
              />
              <p className="text-xs text-gray-500">
                Los recibos comenzarán en 0000001 y el sistema irá incrementando.
              </p>
            </div>
            <div className="md:col-span-2 flex gap-2 mt-2">
              <PendingButton className="px-3 py-2 bg-blue-600 text-white rounded" pendingText="Guardando...">
                Guardar datos legales
              </PendingButton>
              <a className="px-3 py-2 border rounded" href="/dashboard/admin/ajustes">
                Volver a ajustes
              </a>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
