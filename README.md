# 🎟️ Iñistare Sorteos — Plataforma de rifas para Colombia

Next.js 15 (App Router) · Tailwind · componentes estilo shadcn/ui · Lucide · Supabase (Postgres + Auth Google + Storage + Realtime + pg_cron). Se despliega en Vercel + Supabase, ambos en plan gratuito.

## 🤖 Bot de WhatsApp (gratis, no oficial)
Confirmaciones, avisos al dueño y recordatorios **automáticos** enviados por WhatsApp Web desde tu PC. Instrucciones y advertencias en **`bot/LEEME.md`** (requiere `supabase/004_bot_whatsapp.sql` y `WHATSAPP_PROVIDER=bot`).

## ✨ Novedades v3
- **Estilo Iñistare**: negro, blanco y rojo, con el logo incluido (`public/logo.png`). Se cambia en Admin → Contenido.
- **El comprador ya no ve estadísticas**: solo números libres u ocupados. Disponibles, vendidos, en verificación y con abono los ve únicamente el admin (en Rifas → Gestionar).
- **Más didáctica**: pasos “¿Cómo comprar?”, botón “Ver cómo comprar” con el video tutorial, compra en 3 pasos (Tus datos → Forma de pago → Comprobante) y botón flotante de WhatsApp para pedir ayuda.
- **Multimedia por enlace**: YouTube, TikTok, Instagram, Facebook, Vimeo, Google Drive, imágenes, videos y **PDF**, ya sea subiendo el archivo o pegando el enlace.
- **“¿Cómo se juega?”** en cada rifa, para explicar la metodología con video, PDF del reglamento o imagen.
- **Fecha de compra** visible para el comprador, en el panel de reservas y en el Excel.
- **Reporte en Excel** (botón “Descargar Excel” en Reservas o en cada rifa) con 4 hojas: Resumen, Ventas (con número de cuotas, detalle de abonos y saldo pendiente), Abonos y pagos (cada cuota con fecha, medio, acumulado y saldo) y Números (quién tiene cada número).
- **Redes sociales**: enlaces a Facebook, Instagram y TikTok, y en cada rifa un estudio **“Publicar en redes”** con imagen generada automáticamente (formato publicación y formato historia), texto con hashtags y vista previa.

### Actualizar desde la v2
1. SQL Editor → ejecuta `supabase/003_v3_redes_pdf_enlaces.sql`.
2. Copia los archivos nuevos (borra antes la carpeta `src`) y reinicia `npm run dev`. No hay paquetes nuevos.

### Cómo funciona “Publicar en redes”
| Red | Qué hace el botón |
|---|---|
| **Compartir desde el celular** | Abre el menú del teléfono con la imagen y el texto, para elegir Instagram, TikTok, Facebook, WhatsApp… (la forma más rápida) |
| **Facebook** | Sin configuración, abre la ventana de compartir con la vista previa del sorteo. Con `FB_PAGE_ID` + `FB_PAGE_ACCESS_TOKEN`, publica directo en tu página (solo con la web en internet, no en localhost) |
| **Instagram / TikTok** | Esas redes no permiten publicar desde una página web: en computador, el botón descarga la imagen, copia el texto y abre la red para que lo subas |
| **WhatsApp** | Abre WhatsApp con el texto y el enlace (el enlace muestra la vista previa con la imagen del sorteo) |

**Token de la página de Facebook:** en <https://developers.facebook.com> crea una app tipo Empresa, agrega tu página y genera un token de página con los permisos `pages_manage_posts` y `pages_read_engagement`. Para que no se venza, usa un usuario del sistema del Business Manager. `FB_PAGE_ID` es el ID que aparece en la sección “Información” de tu página.

---

## ✨ Novedades v2
- **Compra sin registro**: el comprador solo escribe nombre completo, cédula y celular. Google queda solo para el administrador.
- **Consultar mis números** (`/consultar`): con cédula + celular se ven los números, el pago y el saldo.
- **WhatsApp**: confirmación al comprador y aviso al organizador en cada compra; recordatorios de pago a deudores y del sorteo a todos.
- **Contenido** (Admin → Contenido): logo, nombre, frase, video de YouTube “¿Cómo participar?” y banners del inicio.
- **Multimedia por rifa**: galería del premio (fotos, video MP4 o YouTube) y banners laterales izquierdo/derecho.

### Actualizar un proyecto que ya tenía la v1
1. Supabase → SQL Editor → pega y ejecuta `supabase/002_v2_invitados_whatsapp_multimedia.sql`.
2. Agrega a `.env.local` (y en Vercel) la variable **`SUPABASE_SERVICE_ROLE_KEY`**: Supabase → Project Settings → API Keys → *Secret keys* (`sb_secret_...`) o, en *Legacy API keys*, la `service_role`. **Es secreta**: no la publiques ni la pongas en variables `NEXT_PUBLIC_`.
3. Agrega `RATE_LIMIT_SALT` con cualquier texto aleatorio.
4. Reinicia `npm run dev`.

---

## 1. Arquitectura en 30 segundos

```
Navegador ──(supabase-js, RLS)──▶ Supabase
   │                                ├─ Postgres: users, raffles, tickets, transactions, transaction_payments, payment_methods
   │                                ├─ RPC SECURITY DEFINER: create_order, admin_approve, admin_register_payment, admin_reject…
   │◀── Realtime (tickets/transactions) ┤
   │                                ├─ Storage: receipts (privado) · raffle-images (público)
   └── Next.js en Vercel (SSR + middleware de sesión)   └─ pg_cron: libera reservas vencidas cada minuto
```

**Reglas de diseño clave**

- **Nadie escribe `tickets` ni `transactions` directamente.** Todo pasa por funciones RPC que bloquean filas (`FOR UPDATE`), así dos personas nunca compran el mismo número.
- **Temporizador doble** (configurable por rifa):
  - `hold_minutes` (30 min por defecto): reservas **sin comprobante** (efectivo).
  - `verification_minutes` (24 h por defecto): reservas **con comprobante**, para que un pago real no se libere solo porque el admin tardó en revisar.
  - Si lo quieres estricto (15–30 min para todo), pon el mismo valor en ambos campos.
- Las reservas vencidas se liberan con **pg_cron cada minuto**, y además en cada compra y cada vez que alguien abre la rifa. La cuadrícula muestra como disponible una reserva vencida aunque el cron no haya pasado todavía.
- La tabla `tickets` es pública pero **no tiene datos personales**. Los datos del comprador están en `transactions`, que solo ven su dueño y el admin.

### Estados

| Número (`tickets.status`) | Orden (`transactions.status`) | Significado |
|---|---|---|
| `available` | — | Disponible |
| `pending` | `pending` | En verificación (con temporizador) |
| `partial` | `partial` | Reservado con abono (sin vencimiento) |
| `paid` | `approved` | Vendido / pagado |
| → `available` | `rejected` / `expired` | Liberado |

"Seleccionado" es un estado del navegador (no toca la BD) y se guarda en `sessionStorage`, así sobrevive al login con Google.

---

## 2. Estructura del proyecto

```
supabase/schema.sql            ← TODO el backend (tablas, RLS, triggers, RPC, storage, cron)
src/
  middleware.ts                ← refresca sesión y protege /admin, /perfil, /mis-boletas
  app/
    page.tsx                   ← Home: rifas activas + historial
    login/page.tsx             ← Google, solo para el administrador
    auth/callback/route.ts, auth/signout/route.ts
    rifas/[slug]/page.tsx      ← Detalle, galería/video del premio, banners laterales, cuadrícula en vivo
    consultar/page.tsx         ← Consulta pública por cédula + celular
    api/orders/route.ts        ← Compra sin registro (sube comprobante, crea orden, envía WhatsApp)
    api/lookup/route.ts        ← Consulta de órdenes
    api/admin/reminders/route.ts ← Recordatorios de pago y de sorteo
    admin/
      layout.tsx               ← Guard: role = 'admin'
      page.tsx                 ← Reservas por verificar (realtime) + KPIs
      rifas/page.tsx           ← Listado con progreso y recaudo
      rifas/nueva/page.tsx
      rifas/[id]/page.tsx      ← Editar / publicar / pausar / finalizar + venta manual
      pagos/page.tsx           ← Cuentas Nequi, Daviplata, Bre-B, Bancolombia, efectivo + QR
      contenido/page.tsx       ← Logo, marca, video "cómo participar", banners del inicio
  components/
    raffle/number-grid.tsx     ← ⭐ Cuadrícula interactiva (bloques de 100, búsqueda, al azar)
    raffle/raffle-board.tsx    ← Selección múltiple, realtime, barra fija de compra
    checkout/checkout-dialog.tsx ← ⭐ Plan (completo/abono), medio, QR, subida de comprobante
    admin/reservations-panel.tsx ← ⭐ Aprobar / Abono / Liberar / +30 min, visor de comprobante
    admin/raffle-form.tsx, admin/manual-sale.tsx, admin/payment-methods-manager.tsx
    ui/                        ← button, card, dialog, input, badge, progress… (API shadcn)
  hooks/use-raffle-tickets.ts  ← Carga paginada (>1000 filas) + suscripción Realtime
  lib/ (supabase clients, types, utils: COP, celulares, compresión de imágenes, errores en español)
```

---

## 3. Puesta en marcha (≈20 minutos)

### 3.1 Supabase
1. Crea un proyecto en <https://supabase.com> (región **São Paulo** para menor latencia desde Colombia).
2. **Database → Extensions** → habilita `pg_cron`.
3. **SQL Editor** → pega `supabase/schema.sql`. **Antes de ejecutarlo**, cambia `tu-correo-admin@gmail.com` (sección 12) por tu Gmail. Luego dale Run.
   Después, en consultas nuevas y en orden, ejecuta `supabase/002_v2_invitados_whatsapp_multimedia.sql` y `supabase/003_v3_redes_pdf_enlaces.sql`.
4. **Authentication → Providers → Google**: actívalo con el *Client ID* y el *Secret* de Google Cloud (paso 3.2).
5. **Authentication → URL Configuration**:
   - Site URL: `https://TU-APP.vercel.app`
   - Redirect URLs: `http://localhost:3000/**` y `https://TU-APP.vercel.app/**`

### 3.2 Google Cloud (OAuth)
1. <https://console.cloud.google.com> → APIs y servicios → **Pantalla de consentimiento OAuth** (Externo) → publícala.
2. **Credenciales → Crear ID de cliente OAuth → Aplicación web**.
3. URI de redirección autorizado: `https://<tu-proyecto>.supabase.co/auth/v1/callback`.

### 3.3 Local
```bash
cp .env.example .env.local      # llena las variables
npm install
npm run dev                     # http://localhost:3000
```
Entra con tu Gmail admin → completa el perfil → aparece el botón **Admin**.
Si ya te habías registrado antes de correr el SQL:
```sql
update public.users set role = 'admin' where email = 'tu@gmail.com';
```

### 3.4 Vercel
1. Sube el repo a GitHub → <https://vercel.com/new> → importa el repo.
2. Agrega las variables de `.env.example` (con `NEXT_PUBLIC_SITE_URL` = tu dominio de Vercel).
3. Deploy. Actualiza la *Site URL* de Supabase si cambió el dominio.

### 3.5 Primer uso
1. **Admin → Medios de pago**: crea tus cuentas y sube los QR (Nequi/Daviplata/Bre-B se exportan como imagen desde cada app).
2. **Admin → Rifas → Nueva rifa** → Guardar → **Publicar**.
3. Comparte el enlace `/rifas/<slug>` por WhatsApp (tiene vista previa Open Graph con la imagen del premio).

---

## 4. Flujo completo

1. El usuario elige uno o varios números. Si otra persona aparta uno de ellos en ese momento, se le quita de la selección y se le avisa (Realtime).
2. Pulsa **Apartar** y escribe nombre completo, cédula y celular (no necesita cuenta; el celular recuerda sus datos para la próxima).
3. Checkout: elige **pago completo** o **abono** (mínimo configurable, 30 % por defecto), el **medio de pago** (ve titular, número con botón copiar y QR) y **sube el comprobante**. La foto se comprime en el navegador a menos de 1 MB.
4. `create_order` valida perfil, edad, disponibilidad y topes. Si todo está bien, los números quedan **En verificación** y salen confeti, un contador y un botón **"Avisar por WhatsApp"** con el mensaje ya armado.
5. El admin recibe una notificación en vivo y abre el comprobante (URL firmada de 10 min). Desde ahí elige:
   - **Aprobar pago** → los números quedan **pagados**.
   - **Abono** con el monto recibido → **reservado con abono**. Los abonos se suman, y al completar el total pasa a pagado solo.
   - **Liberar** con un motivo, que el usuario ve en *Mis boletas*.
   - **+30 min** para extender la reserva.
6. **Venta manual**: en la página de la rifa, el admin elige números en la misma cuadrícula, escribe el comprador y el monto. Si pone un correo que ya tiene cuenta, la orden queda vinculada a ese usuario.
7. **Finalizar**: escribe el número ganador. Aparece con corona en la cuadrícula y en el historial, y al ganador le sale una felicitación en *Mis boletas*.

---

## 5. Seguridad incluida

- RLS en todas las tablas. Las RPC de admin validan `is_admin()` en el servidor, así que ocultar botones en el front no es la única protección.
- Un usuario no puede cambiarse el rol (trigger `protect_user_columns`).
- Comprobantes en un bucket **privado**. Solo el servidor los sube (carpeta `guest/…`) y solo el admin los ve.
- La compra sin registro pasa por el servidor: la función `create_guest_order` solo la puede ejecutar la clave secreta, con límite de intentos por IP y máximo 3 reservas pendientes por cédula/celular.
- Tope de números por compra y casilla obligatoria de mayoría de edad + Habeas Data.
- `release_expired_holds` es idempotente: solo libera lo vencido, por eso es seguro exponerla.

---

## 6. Límites del plan gratuito (tenlos en cuenta)

- **Supabase Free**: 500 MB de base de datos y 1 GB de Storage, suficiente para miles de comprobantes comprimidos. **El proyecto se pausa si pasa una semana sin actividad**. Con una rifa activa no pasa, pero entre rifas entra al panel de vez en cuando.
- **Vercel Hobby**: sus términos lo limitan a **uso personal / no comercial**. Si la plataforma genera ingresos, revisa si necesitas el plan Pro (o despliega en Netlify o Cloudflare Pages).
- Realtime Free: 200 conexiones simultáneas, de sobra para rifas medianas.

## 7. Aspecto legal (Colombia) ⚖️

En Colombia las rifas son un juego de suerte y azar regulado (Ley 643 de 2001). Para operarlas se necesita **autorización previa**: de **Coljuegos** si el alcance es nacional o abarca varios departamentos, o de la entidad territorial correspondiente si es departamental o municipal. Además, la base de datos de compradores está sujeta a la **Ley 1581 de 2012 (Habeas Data)**. La app ya pide la autorización, pero conviene publicar una política de tratamiento de datos. Consulta con un abogado antes de lanzar.

---

## 8. WhatsApp automático (opcional)

Sin configurar nada, la app trabaja en **modo asistido**:
- Al comprar, el cliente ve los botones “Guardar el resumen en mi WhatsApp” y “Avisar al organizador” (mensajes ya escritos).
- Los recordatorios muestran una lista: tocas **Enviar** en cada persona y se abre WhatsApp con el mensaje listo.

Para que los mensajes salgan **solos**, se usa la **API oficial de WhatsApp Business (Cloud API de Meta)**. Las alternativas “no oficiales” (bots que usan WhatsApp Web) violan los términos de WhatsApp y te pueden bloquear el número.

**Costo:** Meta cobra por mensaje de plantilla entregado. Para Colombia la categoría *Utilidad* es de las más baratas del mundo (fracciones de centavo de dólar por mensaje), pero exige registrar un medio de pago en Meta. Revisa la tarifa vigente en la página de precios de Meta antes de activar.

### Pasos
1. Crea una app en <https://developers.facebook.com> → tipo **Empresa** → agrega el producto **WhatsApp**.
2. En **WhatsApp → Configuración de la API** registra un **número nuevo** (no puede estar usándose en la app normal de WhatsApp) y verifica el código por SMS.
3. Copia el **Phone number ID** → `WHATSAPP_PHONE_NUMBER_ID`.
4. Crea un **token permanente**: Business Manager → Usuarios del sistema → crear (Admin) → *Generar token* con permisos `whatsapp_business_messaging` y `whatsapp_business_management` → `WHATSAPP_TOKEN`.
5. En **WhatsApp Manager → Plantillas de mensajes** crea estas 4 plantillas, categoría **Utilidad**, idioma **Español (es)**, con el texto EXACTO (las variables `{{n}}` deben quedar en ese orden):

**`rifa_compra_confirmada`** (al comprador)
```
Hola {{1}} 👋 Recibimos tu reserva en la rifa *{{2}}*.
🎟️ Números: {{3}}
💰 Valor: {{4}}
📌 Código de reserva: {{5}}
🗓️ Sorteo: {{6}}
Tus números quedan en verificación hasta que confirmemos el pago. Consulta su estado aquí: {{7}} ¡Mucha suerte!
```
Ejemplos para Meta: Ana · Rifa Moto · 07, 24 · $20.000 · A1B2C3D4 · 20 de diciembre de 2026 · https://tu-app.vercel.app/consultar

**`rifa_nueva_reserva`** (al organizador)
```
🔔 Nueva reserva {{1}} en *{{2}}*
👤 {{3}} · C.C. {{4}} · Cel. {{5}}
🎟️ Números: {{6}}
💰 {{7}}
Revísala en el panel de administración.
```

**`rifa_recordatorio_pago`**
```
Hola {{1}}, te recordamos que en la rifa *{{2}}* tienes un saldo pendiente de {{3}} por los números {{4}}.
🗓️ Sorteo: {{5}}
Completa tu pago para asegurar tu participación. ¡Gracias!
```

**`rifa_recordatorio_sorteo`**
```
Hola {{1}} 🍀 ¡Se acerca el sorteo de *{{2}}*!
🗓️ {{3}}
🎟️ Tus números: {{4}}
{{5}}
¡Mucha suerte!
```

6. Cuando Meta las apruebe (minutos u horas), pon `WHATSAPP_TOKEN` y `WHATSAPP_PHONE_NUMBER_ID` en `.env.local` / Vercel y reinicia. Desde ese momento todo se envía solo y queda registrado en la tabla `notifications`.
7. En **Admin → Contenido** escribe el **WhatsApp del organizador**: ahí llegan los avisos de cada compra.

> Mientras la app de Meta esté en modo desarrollo, solo puedes enviar a números agregados como “destinatarios de prueba”.
> Si Meta guarda el idioma como `es_CO` o `es_MX`, ajusta `WHATSAPP_TEMPLATE_LANG`.

Los recordatorios no se repiten a la misma persona en 6 horas (si insistes, el panel te pregunta antes de reenviar).

---

## 9. Próximas ideas
- **Promociones por cantidad**: por ejemplo, 10 % de descuento desde 5 boletas, con porcentaje y cantidad configurables por rifa.
- Mensaje automático al aprobar el pago y al anunciar el ganador.
- Exportar compradores a Excel desde el panel.
- Pasarela opcional (Wompi / Bold) para quien prefiera pagar en línea.
- Sorteo interno con semilla verificable cuando no se use la lotería oficial.
