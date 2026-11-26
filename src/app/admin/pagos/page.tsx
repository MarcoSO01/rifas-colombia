import { createClient } from "@/lib/supabase/server";
import type { PaymentMethod } from "@/lib/types";
import { PaymentMethodsManager } from "@/components/admin/payment-methods-manager";

export const metadata = { title: "Admin · Medios de pago" };

export default async function PaymentsAdminPage() {
  const supabase = await createClient();
  const { data } = await supabase.from("payment_methods").select("*").order("sort_order");
  return <PaymentMethodsManager initial={(data ?? []) as PaymentMethod[]} />;
}
