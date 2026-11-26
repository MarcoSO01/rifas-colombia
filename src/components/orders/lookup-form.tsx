"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, Search, Ticket } from "lucide-react";
import type { PublicOrder } from "@/lib/types";
import { friendlyError, isValidCoPhone, normalizePhone } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { OrderCard } from "./order-card";

export function LookupForm() {
  const [nationalId, setNationalId] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [orders, setOrders] = useState<PublicOrder[] | null>(null);

  // Si ya compró desde este celular, prellenamos los datos
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("rifa:buyer") ?? "null");
      if (saved) {
        setNationalId(saved.nationalId ?? "");
        setPhone(saved.phone ?? "");
      }
    } catch {}
  }, []);

  const search = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (nationalId.replace(/\D/g, "").length < 5) { toast.error("Escribe tu número de identificación."); return; }
    if (!isValidCoPhone(phone)) { toast.error("Escribe tu celular de 10 dígitos."); return; }
    setLoading(true);
    try {
      const res = await fetch("/api/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nationalId: nationalId.replace(/[.\s-]/g, ""), phone: normalizePhone(phone) }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setOrders(json.orders);
    } catch (err) {
      toast.error(friendlyError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-5">
      <Card>
        <CardContent className="p-5">
          <form onSubmit={search} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <div className="space-y-1.5">
              <Label htmlFor="cc">Número de identificación</Label>
              <Input id="cc" inputMode="numeric" value={nationalId} onChange={(e) => setNationalId(e.target.value)} placeholder="Cédula" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cel">Celular</Label>
              <Input id="cel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="300 123 4567" />
            </div>
            <Button type="submit" disabled={loading} className="h-11">
              {loading ? <Loader2 className="animate-spin" /> : <Search />} Consultar
            </Button>
          </form>
        </CardContent>
      </Card>

      {orders && orders.length === 0 && (
        <div className="glass rounded-3xl p-10 text-center">
          <Ticket className="mx-auto h-12 w-12 text-brand-400/60" />
          <p className="mt-3 text-muted-foreground">No encontramos compras con esos datos. Revisa que sean los mismos que usaste al apartar.</p>
        </div>
      )}
      {orders && orders.length > 0 && <div className="space-y-3">{orders.map((o) => <OrderCard key={o.id} order={o} />)}</div>}
    </div>
  );
}
