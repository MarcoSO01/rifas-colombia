import { LookupForm } from "@/components/orders/lookup-form";

export const metadata = { title: "Consultar mis números" };

export default function ConsultarPage() {
  return (
    <div className="container max-w-3xl space-y-6 py-8">
      <div>
        <h1 className="font-display text-3xl font-black">Consultar mis <span className="text-gradient">números</span></h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Escribe la cédula y el celular que usaste al comprar para ver tus números y el estado de tu pago.
        </p>
      </div>
      <LookupForm />
    </div>
  );
}
