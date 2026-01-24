import { redirect } from "next/navigation";

export default async function VentasAliadoPage() {
  redirect("/dashboard/aliado/presupuestos?message=Ventas%20deshabilitadas");
}
