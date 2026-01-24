import { redirect } from "next/navigation";

export default async function NuevaVentaAliadoPage() {
  redirect("/dashboard/aliado/presupuestos?message=Ventas%20deshabilitadas");
}
