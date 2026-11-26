# 🤖 Bot de WhatsApp (gratis, desde tu PC)

Envía solo, por WhatsApp:
- La **confirmación** al comprador apenas aparta sus números.
- El **aviso al dueño** de cada compra nueva.
- Los **recordatorios de pago** y **del sorteo** cuando los pides desde el panel.

## ⚠ Antes de empezar (importante)
- Esto usa **WhatsApp Web de forma no oficial**. WhatsApp **puede bloquear el número** si detecta envíos masivos.
- **Usa un número aparte**: un chip/celular solo para el bot, con WhatsApp o WhatsApp Business instalado. **No uses tu número personal.**
- Envía solo a personas que compraron (ellas aceptan recibir mensajes al apartar). Nada de publicidad masiva.
- Para que el número “caliente”: úsalo unos días como normal (escribe a conocidos) antes de mandar muchos mensajes.
- El bot ya trae protecciones: 1 mensaje cada 8 a 20 segundos, máximo 60 por hora y “escribiendo…” antes de enviar.

## Instalación (una sola vez)
1. En Supabase → SQL Editor ejecuta `supabase/004_bot_whatsapp.sql`.
2. En el `.env.local` de la página agrega la línea:
   ```
   WHATSAPP_PROVIDER=bot
   ```
   y reinicia la página (`Ctrl + C` y `npm run dev`).
3. Entra a la carpeta `bot` y dale **doble clic a `iniciar-bot.bat`**.
   La primera vez instala lo necesario (tarda unos minutos).
4. Aparece un **código QR** en la ventana. En el celular del bot:
   **WhatsApp → ⋮ (o Configuración) → Dispositivos vinculados → Vincular un dispositivo** y escanéalo.
5. Cuando diga **“✔ Bot conectado”**, listo. **Deja la ventana abierta** (puedes minimizarla).

El bot toma las claves del `.env.local` de la página. No hay que configurar nada más.

## Uso diario
- Para encenderlo, dale doble clic a `iniciar-bot.bat`. Ya no pide el QR otra vez.
- En **Admin → Reservas** verás la tarjeta **“Bot de WhatsApp”**: si está conectado, cuántos mensajes están en cola, cuántos se enviaron hoy y cuáles fallaron (con botón para reintentar).
- Si el PC está apagado, los mensajes esperan en cola y salen cuando enciendas el bot. Los que tengan más de 48 horas se descartan.
- Si se cierra solo, la ventana lo vuelve a abrir en 10 segundos.

## Problemas comunes
| Síntoma | Solución |
|---|---|
| Pide el QR cada vez / “Error de autenticación” | Cierra el bot, borra la carpeta `bot/.sesion-whatsapp` y vuelve a escanear |
| “Faltan SUPABASE_URL… ” | Revisa que `.env.local` tenga `NEXT_PUBLIC_SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` |
| “No se pudo abrir WhatsApp Web” | Vuelve a instalar: borra `bot/node_modules` y abre `iniciar-bot.bat`. Si sigue, en `bot/.env` pon `CHROME_PATH=` con la ruta de tu Chrome |
| Deja de enviar tras una actualización de WhatsApp | En la carpeta `bot` ejecuta `npm update whatsapp-web.js` |
| “Ese número no tiene WhatsApp” | El celular que escribió el comprador no tiene WhatsApp; contáctalo por llamada |

## Con la página en Vercel
Funciona igual: la página (en internet) deja los mensajes en Supabase y el bot (en tu PC) los envía. Solo agrega `WHATSAPP_PROVIDER=bot` en las variables de entorno de Vercel.
