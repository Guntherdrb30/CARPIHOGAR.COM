import { redirect } from "next/navigation";

export default async function PrintAllySalePage() {
  redirect("/dashboard/aliado/presupuestos?message=Ventas%20deshabilitadas");
}
