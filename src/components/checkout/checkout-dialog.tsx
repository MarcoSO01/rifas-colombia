"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  Banknote, CalendarCheck, Camera, Check, CheckCircle2, ChevronLeft, ChevronRight, Clock, Copy, FileText, Loader2,
  MessageCircle, QrCode, Upload, UserRound, Wallet,
} from "lucide-react";
import type { PayMethod, PayPlan, PaymentMethod, Raffle, TxStatus } from "@/lib/types";
import { METHOD_COLOR, METHOD_LABEL } from "@/lib/types";
import {
  cn, compressImage, formatCOP, formatDate, friendlyError, isValidCoPhone, normalizePhone, padNumber, whatsappLink,
} from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Countdown } from "@/components/raffle/countdown";

const CASH_FALLBACK: PaymentMethod = {
  id: "cash-default",
  method: "cash",
  label: "Efectivo / Presencial",
  account_holder: null,
  account_number: null,
  account_type: null,
  instructions: "Coordina la entrega del dinero con el organizador por WhatsApp antes de que venza tu reserva.",
  qr_url: null,
  is_active: true,
  sort_order: 999,
};

const MAX_FILE = 4 * 1024 * 1024;
const BUYER_KEY = "rifa:buyer";

export interface CreatedOrder {
  id: string;
  created_at: string;
  code: string;
  raffle_id: string;
  numbers: number[];
  method: PayMethod;
  plan: PayPlan;
  amount_total: number;
  amount_declared: number;
  amount_paid: number;
  status: TxStatus;
  expires_at: string | null;
  buyer_name: string | null;
}

interface WaInfo {
  mode: "api" | "bot" | "manual";
  buyerSent: boolean;
  ownerSent: boolean;
  buyerText: string | null;
  ownerText: string | null;
  ownerPhone: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  raffle: Raffle;
  numbers: number[];
  paymentMethods: PaymentMethod[];
  ownerWhatsapp: string | null;
  onSuccess: (tx: CreatedOrder) => void;
  onConflict: () => void;
}

export function CheckoutDialog({ open, onOpenChange, raffle, numbers, paymentMethods, onSuccess, onConflict }: Props) {
  const options = useMemo(
    () => (paymentMethods.some((p) => p.method === "cash") ? paymentMethods : [...paymentMethods, CASH_FALLBACK]),
    [paymentMethods],
  );

  const [buyer, setBuyer] = useState({ name: "", nationalId: "", phone: "" });
  const [consent, setConsent] = useState(false);
  const [plan, setPlan] = useState<PayPlan>("full");
  const [accountId, setAccountId] = useState(options[0]?.id);
  const [partialAmount, setPartialAmount] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ tx: CreatedOrder; whatsapp: WaInfo; phone: string } | null>(null);
  const [step, setStep] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const account = options.find((o) => o.id === accountId) ?? options[0];
  const method: PayMethod = account?.method ?? "cash";
  const needsReceipt = method !== "cash";
  const total = numbers.length * raffle.ticket_price;
  const minPartial = Math.ceil((total * raffle.min_partial_percent) / 100);
  const partialValue = Number(partialAmount.replace(/\D/g, "")) || 0;
  const amountToPay = plan === "full" ? total : partialValue;

  // Reinicia al abrir y recuerda los datos del comprador en este celular
  useEffect(() => {
    if (!open) return;
    setResult(null);
    setStep(0);
    setPlan("full");
    setPartialAmount(String(minPartial));
    setFile(null);
    setPreview(null);
    try {
      const saved = JSON.parse(localStorage.getItem(BUYER_KEY) ?? "null");
      if (saved) {
        setBuyer({ name: saved.name ?? "", nationalId: saved.nationalId ?? "", phone: saved.phone ?? "" });
        setConsent(true);
      }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  const onFile = (f: File | undefined | null) => {
    if (!f) return;
    if (!/^image\/|application\/pdf/.test(f.type)) { toast.error("Sube una imagen (JPG, PNG) o un PDF."); return; }
    setFile(f);
    setPreview(f.type.startsWith("image/") ? URL.createObjectURL(f) : null);
  };

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Copiado al portapapeles");
    } catch {
      toast.error("No se pudo copiar");
    }
  };

  const nameOk = buyer.name.trim().split(/\s+/).length >= 2 && buyer.name.trim().length >= 5;
  const idOk = /^[0-9A-Za-z]{5,15}$/.test(buyer.nationalId.replace(/[.\s-]/g, ""));
  const phoneOk = isValidCoPhone(buyer.phone);

  const validationError = (() => {
    if (!numbers.length) return "No hay números seleccionados.";
    if (!nameOk) return "Escribe tu nombre completo (nombre y apellido).";
    if (!idOk) return "Escribe tu número de identificación.";
    if (!phoneOk) return "Escribe tu celular de 10 dígitos.";
    if (plan === "partial" && (partialValue < minPartial || partialValue >= total))
      return `El abono debe estar entre ${formatCOP(minPartial)} y ${formatCOP(total - 1)}.`;
    if (needsReceipt && !file) return "Adjunta la foto o PDF del comprobante.";
    if (!consent) return "Acepta el tratamiento de datos para continuar.";
    return null;
  })();

  const errorStep0 = !nameOk
    ? "Escribe tu nombre completo (nombre y apellido)."
    : !idOk
      ? "Escribe tu número de identificación."
      : !phoneOk
        ? "Escribe tu celular de 10 dígitos."
        : !consent
          ? "Acepta el tratamiento de datos para continuar."
          : null;
  const errorStep1 =
    plan === "partial" && (partialValue < minPartial || partialValue >= total)
      ? `El abono debe estar entre ${formatCOP(minPartial)} y ${formatCOP(total - 1)}.`
      : null;
  const stepError = step === 0 ? errorStep0 : step === 1 ? errorStep1 : validationError;
  const stepLabels = ["Tus datos", "Forma de pago", needsReceipt ? "Comprobante" : "Confirmar"];

  const next = () => {
    if (stepError) { toast.error(stepError); return; }
    setStep((x) => Math.min(2, x + 1));
  };

  const submit = async () => {
    if (validationError) { toast.error(validationError); return; }
    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.set("raffleId", raffle.id);
      fd.set("numbers", JSON.stringify(numbers));
      fd.set("method", method);
      fd.set("plan", plan);
      if (plan === "partial") fd.set("amountDeclared", String(partialValue));
      fd.set("name", buyer.name.trim());
      fd.set("nationalId", buyer.nationalId.replace(/[.\s-]/g, ""));
      fd.set("phone", normalizePhone(buyer.phone));
      fd.set("consent", String(consent));
      if (needsReceipt && file) {
        const upload = await compressImage(file);
        if (upload.size > MAX_FILE) throw new Error("FILE_TOO_LARGE");
        fd.set("receipt", upload, upload.name);
      }

      const res = await fetch("/api/orders", { method: "POST", body: fd });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "UNKNOWN_ERROR");

      try {
        localStorage.setItem(BUYER_KEY, JSON.stringify(buyer));
      } catch {}
      setResult({ tx: json.tx, whatsapp: json.whatsapp, phone: normalizePhone(buyer.phone) });
      onSuccess(json.tx);
      celebrate();
    } catch (e) {
      const msg = friendlyError(e);
      toast.error(msg);
      if (msg.includes("apartados por otra persona")) {
        onConflict();
        onOpenChange(false);
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !submitting && onOpenChange(v)}>
      <DialogContent className="sm:max-w-xl">
        {result ? (
          <SuccessView {...result} raffle={raffle} onClose={() => onOpenChange(false)} />
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Aparta tus números</DialogTitle>
              <DialogDescription>{raffle.title} · no necesitas crear cuenta</DialogDescription>
            </DialogHeader>

            <div className="space-y-5">
              <Stepper step={step} labels={stepLabels} />
              {/* Resumen siempre visible */}
              <section className="flex items-center gap-3 rounded-2xl border border-brand-500/30 bg-brand-500/[0.07] p-3">
                <div className="flex min-w-0 flex-1 flex-wrap gap-1">
                  {numbers.map((n) => (
                    <span key={n} className="rounded-md bg-brand-600 px-1.5 py-0.5 font-display text-sm font-black text-white">
                      {padNumber(n, raffle.total_numbers)}
                    </span>
                  ))}
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-[11px] text-muted-foreground">{numbers.length} × {formatCOP(raffle.ticket_price)}</p>
                  <p className="font-display text-xl font-black">{formatCOP(total)}</p>
                </div>
              </section>

              {step === 0 && (
                <div key="s0" className="animate-float-up space-y-5">
              {/* 2. Datos del comprador */}
              <section className="space-y-3">
                <Label className="flex items-center gap-1.5"><UserRound className="h-4 w-4 text-brand-300" /> Tus datos</Label>
                <Field label="Nombre completo" ok={nameOk} value={buyer.name}>
                  <Input value={buyer.name} onChange={(e) => setBuyer({ ...buyer, name: e.target.value })} autoComplete="name" placeholder="Ej. Ana María Pérez" />
                </Field>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Número de identificación" ok={idOk} value={buyer.nationalId}>
                    <Input value={buyer.nationalId} onChange={(e) => setBuyer({ ...buyer, nationalId: e.target.value })} inputMode="numeric" placeholder="Cédula" />
                  </Field>
                  <Field label="Celular (WhatsApp)" ok={phoneOk} value={buyer.phone}>
                    <Input value={buyer.phone} onChange={(e) => setBuyer({ ...buyer, phone: e.target.value })} inputMode="tel" autoComplete="tel" placeholder="300 123 4567" />
                  </Field>
                </div>
                <p className="text-xs text-muted-foreground">A este celular te llega la confirmación con tus números.</p>
              </section>

              <label className="flex items-start gap-3 rounded-xl border border-white/10 bg-black/20 p-3 text-xs text-muted-foreground">
                <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 h-4 w-4 accent-amber-400" />
                <span>
                  Soy mayor de 18 años y autorizo el tratamiento de mis datos para gestionar mi compra, enviarme mensajes por
                  WhatsApp sobre esta rifa y la entrega del premio (Ley 1581 de 2012).
                </span>
              </label>

                </div>
              )}

              {step === 1 && (
                <div key="s1" className="animate-float-up space-y-5">
              {/* 3. Plan */}
              <section className="space-y-2">
                <Label>¿Cómo quieres pagar?</Label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { id: "full" as const, title: "Pago completo", sub: formatCOP(total), icon: Wallet },
                    { id: "partial" as const, title: "Abono parcial", sub: `Desde ${formatCOP(minPartial)}`, icon: Banknote },
                  ].map((o) => (
                    <button
                      key={o.id}
                      type="button"
                      onClick={() => setPlan(o.id)}
                      className={cn(
                        "rounded-2xl border p-3 text-left transition",
                        plan === o.id ? "border-brand-400 bg-brand-400/10 shadow-brand" : "border-white/10 bg-white/[0.03] hover:bg-white/[0.06]",
                      )}
                    >
                      <o.icon className={cn("mb-1 h-5 w-5", plan === o.id ? "text-brand-300" : "text-muted-foreground")} />
                      <p className="text-sm font-bold">{o.title}</p>
                      <p className="text-xs text-muted-foreground">{o.sub}</p>
                    </button>
                  ))}
                </div>
                {plan === "partial" && (
                  <div className="animate-float-up space-y-1.5 pt-1">
                    <Label htmlFor="abono">Valor del abono</Label>
                    <Input
                      id="abono"
                      inputMode="numeric"
                      value={partialValue ? partialValue.toLocaleString("es-CO") : ""}
                      onChange={(e) => setPartialAmount(e.target.value)}
                      placeholder={minPartial.toLocaleString("es-CO")}
                    />
                    <p className="text-xs text-muted-foreground">
                      Saldo pendiente: <b className="text-violet-200">{formatCOP(Math.max(total - partialValue, 0))}</b>. Tus
                      números quedan reservados con abono cuando el organizador confirme el pago.
                    </p>
                  </div>
                )}
              </section>

              {/* 4. Método */}
              <section className="space-y-2">
                <Label>Medio de pago</Label>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {options.map((o) => (
                    <button
                      key={o.id}
                      type="button"
                      onClick={() => setAccountId(o.id)}
                      className={cn(
                        "relative overflow-hidden rounded-2xl border p-3 text-left transition",
                        account?.id === o.id ? "border-brand-400 shadow-brand" : "border-white/10 hover:border-white/25",
                      )}
                    >
                      <span className={cn("absolute inset-0 bg-gradient-to-br opacity-20", METHOD_COLOR[o.method])} />
                      <span className="relative block text-sm font-bold">{METHOD_LABEL[o.method]}</span>
                      <span className="relative block truncate text-xs text-muted-foreground">{o.label}</span>
                      {account?.id === o.id && <Check className="absolute right-2 top-2 h-4 w-4 text-brand-300" />}
                    </button>
                  ))}
                </div>

                {account && (
                  <div className="animate-float-up rounded-2xl border border-white/10 bg-black/30 p-4">
                    {account.method !== "cash" ? (
                      <div className="flex flex-col gap-4 sm:flex-row">
                        {account.qr_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={account.qr_url} alt={`QR ${account.label}`} className="mx-auto h-40 w-40 rounded-xl bg-white p-2" />
                        ) : (
                          <div className="mx-auto grid h-40 w-40 place-items-center rounded-xl border border-dashed border-white/15 text-muted-foreground">
                            <QrCode className="h-10 w-10" />
                          </div>
                        )}
                        <dl className="flex-1 space-y-2 text-sm">
                          {account.account_holder && (
                            <div><dt className="text-xs text-muted-foreground">Titular</dt><dd className="font-semibold">{account.account_holder}</dd></div>
                          )}
                          {account.account_number && (
                            <div>
                              <dt className="text-xs text-muted-foreground">
                                {account.method === "breb" ? "Llave" : account.account_type ? `Cuenta ${account.account_type}` : "Número"}
                              </dt>
                              <dd className="flex items-center gap-2">
                                <span className="font-mono text-lg font-bold text-brand-200">{account.account_number}</span>
                                <button type="button" onClick={() => copy(account.account_number!)} className="rounded-lg p-1.5 hover:bg-white/10" aria-label="Copiar">
                                  <Copy className="h-4 w-4" />
                                </button>
                              </dd>
                            </div>
                          )}
                          <div><dt className="text-xs text-muted-foreground">Valor a transferir</dt><dd className="font-display text-xl font-black text-emerald-300">{formatCOP(amountToPay)}</dd></div>
                          {account.instructions && <p className="text-xs text-muted-foreground">{account.instructions}</p>}
                        </dl>
                      </div>
                    ) : (
                      <div className="flex gap-3 text-sm">
                        <Banknote className="h-6 w-6 shrink-0 text-emerald-300" />
                        <div className="space-y-1">
                          <p className="font-semibold">Pagas {formatCOP(amountToPay)} en efectivo</p>
                          <p className="text-muted-foreground">{account.instructions ?? CASH_FALLBACK.instructions}</p>
                          <p className="flex items-center gap-1 text-xs text-sky-200">
                            <Clock className="h-3.5 w-3.5" /> Tus números quedan apartados {raffle.hold_minutes} minutos.
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </section>

                </div>
              )}

              {step === 2 && (
                <div key="s2" className="animate-float-up space-y-5">
              {/* 5. Comprobante */}
              {needsReceipt && (
                <section className="space-y-2">
                  <Label>Comprobante de pago</Label>
                  <input ref={inputRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
                  <button
                    type="button"
                    onClick={() => inputRef.current?.click()}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => { e.preventDefault(); onFile(e.dataTransfer.files?.[0]); }}
                    className={cn(
                      "flex w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed p-5 text-center transition",
                      file ? "border-emerald-400/50 bg-emerald-400/5" : "border-white/15 hover:border-brand-400/50 hover:bg-brand-400/5",
                    )}
                  >
                    {preview ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={preview} alt="Vista previa del comprobante" className="max-h-48 rounded-xl object-contain" />
                    ) : file ? (
                      <FileText className="h-10 w-10 text-emerald-300" />
                    ) : (
                      <div className="flex gap-3 text-muted-foreground"><Camera className="h-8 w-8" /><Upload className="h-8 w-8" /></div>
                    )}
                    <span className="text-sm font-semibold">{file ? file.name : "Toma una foto o sube el pantallazo"}</span>
                    <span className="text-xs text-muted-foreground">{file ? "Toca para cambiarlo" : "JPG, PNG o PDF · máx. 4 MB"}</span>
                  </button>
                </section>
              )}

                  <ConfirmSummary
                    rows={[
                      ["Nombre", buyer.name.trim()],
                      ["Identificación", buyer.nationalId],
                      ["Celular", buyer.phone],
                      ["Medio de pago", `${METHOD_LABEL[method]}${account?.label && account.method !== "cash" ? ` · ${account.label}` : ""}`],
                      ["Pago", plan === "full" ? `Completo · ${formatCOP(total)}` : `Abono ${formatCOP(partialValue)} · saldo ${formatCOP(Math.max(total - partialValue, 0))}`],
                    ]}
                  />
                </div>
              )}

              {/* Navegación */}
              <div className="flex gap-2 pt-1">
                {step > 0 && (
                  <Button variant="outline" size="lg" onClick={() => setStep((x) => x - 1)} disabled={submitting}>
                    <ChevronLeft /> Atrás
                  </Button>
                )}
                {step < 2 ? (
                  <Button size="lg" className="flex-1" onClick={next}>
                    Siguiente <ChevronRight />
                  </Button>
                ) : (
                  <Button size="lg" className="flex-1" onClick={submit} disabled={submitting || Boolean(validationError)}>
                    {submitting ? <><Loader2 className="animate-spin" /> Apartando…</> : <>Confirmar y apartar</>}
                  </Button>
                )}
              </div>
              {stepError && <p className="-mt-2 text-center text-xs text-muted-foreground">{stepError}</p>}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Stepper({ step, labels }: { step: number; labels: string[] }) {
  return (
    <ol className="flex items-center gap-2">
      {labels.map((l, i) => (
        <li key={l} className="flex flex-1 items-center gap-2">
          <span
            className={cn(
              "grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-black transition",
              i < step ? "bg-emerald-500 text-white" : i === step ? "bg-brand-600 text-white shadow-brand" : "bg-white/10 text-muted-foreground",
            )}
          >
            {i < step ? <Check className="h-4 w-4" /> : i + 1}
          </span>
          <span className={cn("truncate text-xs font-semibold", i === step ? "text-foreground" : "text-muted-foreground")}>{l}</span>
          {i < labels.length - 1 && <span className="hidden h-px flex-1 bg-white/10 sm:block" />}
        </li>
      ))}
    </ol>
  );
}

function ConfirmSummary({ rows }: { rows: [string, string][] }) {
  return (
    <dl className="divide-y divide-white/5 rounded-2xl border border-white/10 bg-black/30 text-sm">
      {rows.map(([k, v]) => (
        <div key={k} className="flex justify-between gap-3 px-4 py-2">
          <dt className="text-muted-foreground">{k}</dt>
          <dd className="text-right font-semibold">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

function Field({ label, ok, value, children }: { label: string; ok: boolean; value: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="flex items-center justify-between text-xs">
        {label}
        {value && (ok ? <Check className="h-3.5 w-3.5 text-emerald-300" /> : <span className="text-[11px] text-rose-300">Revisar</span>)}
      </Label>
      {children}
    </div>
  );
}

function SuccessView({
  tx, whatsapp, phone, raffle, onClose,
}: {
  tx: CreatedOrder; whatsapp: WaInfo; phone: string; raffle: Raffle; onClose: () => void;
}) {
  return (
    <div className="space-y-5 py-2 text-center">
      <div className="mx-auto grid h-20 w-20 animate-pop place-items-center rounded-full bg-gradient-to-br from-emerald-300 to-emerald-600 shadow-emerald">
        <CheckCircle2 className="h-11 w-11 text-white" />
      </div>
      <div>
        <DialogTitle className="text-2xl">¡Números apartados!</DialogTitle>
        <DialogDescription className="mt-1">Código de reserva <b className="font-mono text-brand-200">{tx.code}</b></DialogDescription>
        <p className="mt-1 flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
          <CalendarCheck className="h-3.5 w-3.5" /> Fecha de compra: {formatDate(tx.created_at)}
        </p>
      </div>
      <div className="flex flex-wrap justify-center gap-1.5">
        {tx.numbers.map((n) => (
          <span key={n} className="rounded-lg bg-sky-400/15 px-2.5 py-1 font-display text-lg font-black text-sky-100 ring-1 ring-sky-400/40">
            {padNumber(n, raffle.total_numbers)}
          </span>
        ))}
      </div>
      <div className="rounded-2xl border border-sky-400/30 bg-sky-400/10 p-4 text-sm">
        <p className="font-semibold text-sky-100">Estado: En verificación</p>
        <p className="mt-1 text-sky-100/80">
          Reserva activa por <Countdown to={tx.expires_at} className="text-sky-50" />. Si no se confirma el pago en ese tiempo, los números se liberan.
        </p>
      </div>

      {whatsapp.mode !== "manual" && whatsapp.buyerSent ? (
        <p className="flex items-center justify-center gap-2 rounded-xl bg-emerald-500/10 p-3 text-sm text-emerald-200">
          <MessageCircle className="h-4 w-4" />
          {whatsapp.mode === "bot" ? "En unos minutos te llega la confirmación por WhatsApp." : "Te enviamos la confirmación por WhatsApp."}
        </p>
      ) : (
        whatsapp.buyerText && (
          <Button asChild variant="outline" className="w-full">
            <a href={whatsappLink(phone, whatsapp.buyerText)} target="_blank" rel="noopener noreferrer">
              <MessageCircle /> Guardar el resumen en mi WhatsApp
            </a>
          </Button>
        )
      )}

      <div className="grid gap-2 sm:grid-cols-2">
        {!whatsapp.ownerSent && whatsapp.ownerPhone && whatsapp.ownerText && (
          <Button asChild variant="secondary">
            <a href={whatsappLink(whatsapp.ownerPhone, whatsapp.ownerText)} target="_blank" rel="noopener noreferrer">
              <MessageCircle /> Avisar al organizador
            </a>
          </Button>
        )}
        <Button asChild variant="outline" className={cn(whatsapp.ownerSent && "sm:col-span-2")}>
          <Link href="/consultar" onClick={onClose}>Consultar mis números</Link>
        </Button>
      </div>
    </div>
  );
}

async function celebrate() {
  try {
    const confetti = (await import("canvas-confetti")).default;
    confetti({ particleCount: 140, spread: 80, origin: { y: 0.7 }, colors: ["#fadb5f", "#f0b429", "#34d399", "#ffffff"] });
  } catch {}
}
