/**
 * Bot de WhatsApp para la plataforma de rifas.
 * - Lee la bandeja "whatsapp_outbox" en Supabase y envía cada mensaje por WhatsApp Web.
 * - Envía de a uno, con pausas al azar y un tope por hora, para reducir el riesgo de bloqueo.
 *
 * ⚠ Usa WhatsApp Web de forma no oficial: WhatsApp puede bloquear el número.
 *   Usa un número dedicado y envía solo a personas que compraron.
 */
const fs = require("fs");
const path = require("path");

// Usa bot/.env si existe; si no, toma las claves del .env.local de la página
const envFile = fs.existsSync(path.join(__dirname, ".env")) ? path.join(__dirname, ".env") : path.join(__dirname, "..", ".env.local");
require("dotenv").config({ path: envFile });

const { Client, LocalAuth } = require("whatsapp-web.js");
const qrcode = require("qrcode-terminal");
const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error(`\n✖ Faltan SUPABASE_URL (o NEXT_PUBLIC_SUPABASE_URL) y SUPABASE_SERVICE_ROLE_KEY.\n  Archivo leído: ${envFile}\n`);
  process.exit(1);
}

const MIN_DELAY = Number(process.env.MIN_DELAY_SECONDS || 8) * 1000;
const MAX_DELAY = Number(process.env.MAX_DELAY_SECONDS || 20) * 1000;
const MAX_PER_HOUR = Number(process.env.MAX_PER_HOUR || 60);
const MAX_AGE_HOURS = Number(process.env.MAX_AGE_HOURS || 48);
const POLL_MS = 10_000;

const db = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const randomDelay = () => MIN_DELAY + Math.random() * (MAX_DELAY - MIN_DELAY);
const hora = () => new Date().toLocaleTimeString("es-CO");

let state = "starting";
let myPhone = null;
let ready = false;
let busy = false;
const sentTimes = [];

async function setStatus(newState, info = null) {
  state = newState;
  const { error } = await db
    .from("bot_status")
    .upsert({ id: 1, state, last_seen: new Date().toISOString(), phone: myPhone, info });
  if (error) console.error("No se pudo actualizar el estado del bot:", error.message, "(¿ejecutaste 004_bot_whatsapp.sql?)");
}

/** 3001234567 → 573001234567 */
function toWaNumber(phone) {
  let d = String(phone).replace(/\D/g, "");
  if (d.length === 10) d = `57${d}`;
  return d;
}

/** Usa el Chrome o Edge instalado en Windows (WhatsApp Web carga mejor que con el navegador interno) */
function findBrowser() {
  const pf = process.env["PROGRAMFILES"] || "C:\\Program Files";
  const pf86 = process.env["PROGRAMFILES(X86)"] || "C:\\Program Files (x86)";
  const local = process.env.LOCALAPPDATA || "";
  const candidates = [
    process.env.CHROME_PATH,
    `${pf}\\Google\\Chrome\\Application\\chrome.exe`,
    `${pf86}\\Google\\Chrome\\Application\\chrome.exe`,
    local && `${local}\\Google\\Chrome\\Application\\chrome.exe`,
    `${pf86}\\Microsoft\\Edge\\Application\\msedge.exe`,
    `${pf}\\Microsoft\\Edge\\Application\\msedge.exe`,
  ].filter(Boolean);
  return candidates.find((p) => {
    try {
      return fs.existsSync(p);
    } catch {
      return false;
    }
  });
}

const SHOW_BROWSER = /^(1|true|si|sí)$/i.test(process.env.SHOW_BROWSER || "");
const browserPath = findBrowser();
console.log(browserPath ? `🌐 Navegador: ${browserPath}` : "🌐 Navegador: el interno del bot");
if (SHOW_BROWSER) console.log("👀 Modo visible: verás la ventana de WhatsApp Web (puedes escanear el QR ahí también).");

const client = new Client({
  authStrategy: new LocalAuth({ dataPath: path.join(__dirname, ".sesion-whatsapp") }),
  authTimeoutMs: 180_000, // la primera carga de WhatsApp Web puede tardar más de 30 s
  qrMaxRetries: 10,
  puppeteer: {
    headless: !SHOW_BROWSER,
    executablePath: browserPath,
    protocolTimeout: 240_000,
    timeout: 120_000,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-gpu", "--no-first-run", "--no-default-browser-check"],
  },
});

client.on("qr", (qr) => {
  console.log("\n📱 Escanea este código con el celular del bot:");
  console.log("   WhatsApp → ⋮ / Configuración → Dispositivos vinculados → Vincular un dispositivo\n");
  qrcode.generate(qr, { small: true });
  setStatus("qr");
});

client.on("authenticated", () => console.log("✔ Sesión iniciada"));

client.on("auth_failure", (msg) => {
  console.error("✖ Error de autenticación:", msg);
  setStatus("disconnected", "Error de autenticación: borra la carpeta bot/.sesion-whatsapp y vuelve a escanear");
});

client.on("ready", async () => {
  ready = true;
  myPhone = client.info && client.info.wid ? client.info.wid.user : null;
  console.log(`\n✔ Bot conectado como +${myPhone}. Esperando mensajes… (deja esta ventana abierta)\n`);
  await setStatus("ready");
  processQueue();
});

client.on("disconnected", async (reason) => {
  ready = false;
  console.warn("✖ WhatsApp se desconectó:", reason);
  await setStatus("disconnected", `Desconectado: ${reason}`);
  // El archivo iniciar-bot.bat vuelve a abrir el bot
  setTimeout(() => process.exit(1), 2000);
});

async function processQueue() {
  if (!ready || busy) return;
  busy = true;
  try {
    // Mensajes muy viejos ya no tienen sentido (ej. el PC estuvo apagado días)
    const limit = new Date(Date.now() - MAX_AGE_HOURS * 3600_000).toISOString();
    await db.from("whatsapp_outbox").update({ status: "cancelled", error: "Vencido sin enviar" }).eq("status", "queued").lt("created_at", limit);

    while (ready) {
      // Tope por hora (anti-bloqueo)
      const hourAgo = Date.now() - 3600_000;
      while (sentTimes.length && sentTimes[0] < hourAgo) sentTimes.shift();
      if (sentTimes.length >= MAX_PER_HOUR) {
        console.log(`⏸ ${hora()} Se alcanzó el tope de ${MAX_PER_HOUR} mensajes por hora. Continúa más tarde.`);
        break;
      }

      const { data: rows, error } = await db
        .from("whatsapp_outbox")
        .select("*")
        .eq("status", "queued")
        .order("created_at")
        .limit(1);
      if (error) {
        console.error("Error leyendo la bandeja:", error.message);
        break;
      }
      const msg = rows && rows[0];
      if (!msg) break;

      // "Reservar" el mensaje para no enviarlo dos veces
      const { data: claimed } = await db
        .from("whatsapp_outbox")
        .update({ status: "sending", attempts: msg.attempts + 1 })
        .eq("id", msg.id)
        .eq("status", "queued")
        .select("id");
      if (!claimed || !claimed.length) continue;

      try {
        const numberId = await client.getNumberId(toWaNumber(msg.phone));
        if (!numberId) throw new Error("Ese número no tiene WhatsApp");
        const chatId = numberId._serialized;
        try {
          const chat = await client.getChatById(chatId);
          await chat.sendStateTyping();
          await sleep(1500 + Math.random() * 2500);
        } catch {
          /* chat nuevo: se envía sin "escribiendo…" */
        }
        await client.sendMessage(chatId, msg.body);
        await db.from("whatsapp_outbox").update({ status: "sent", sent_at: new Date().toISOString(), error: null }).eq("id", msg.id);
        sentTimes.push(Date.now());
        console.log(`✔ ${hora()} Enviado (${msg.kind}) a ${msg.phone}`);
      } catch (e) {
        const err = (e && e.message) || String(e);
        const final = msg.attempts + 1 >= 3 || /no tiene WhatsApp/.test(err);
        await db.from("whatsapp_outbox").update({ status: final ? "failed" : "queued", error: err.slice(0, 300) }).eq("id", msg.id);
        console.warn(`✖ ${hora()} No se pudo enviar a ${msg.phone}: ${err}`);
      }

      await sleep(randomDelay());
    }
  } catch (e) {
    console.error("Error en la cola:", (e && e.message) || e);
  } finally {
    busy = false;
  }
}

// Revisa la bandeja cada 10 s y reporta "sigo vivo" cada 30 s
setInterval(processQueue, POLL_MS);
setInterval(() => {
  db.from("bot_status").update({ last_seen: new Date().toISOString(), state, phone: myPhone }).eq("id", 1).then(() => {});
}, 30_000);

async function shutdown() {
  console.log("\nCerrando el bot…");
  ready = false;
  await setStatus("offline", "Bot cerrado");
  try {
    await client.destroy();
  } catch {}
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

(async () => {
  console.log("🤖 Iniciando bot de WhatsApp… (la primera vez tarda un poco)");
  // Si el bot se cerró a mitad de un envío, esos mensajes vuelven a la cola
  await db.from("whatsapp_outbox").update({ status: "queued" }).eq("status", "sending");
  await setStatus("starting", "Iniciando");
  client.initialize().catch(async (e) => {
    const msg = (e && e.message) || String(e);
    console.error("✖ No se pudo abrir WhatsApp Web:", msg);
    if (!SHOW_BROWSER) console.error("  Sugerencia: cierra esta ventana y abre «iniciar-bot-visible.bat» para ver qué muestra WhatsApp Web.");
    await setStatus("disconnected", `No abrió WhatsApp Web: ${msg.slice(0, 120)}`);
    process.exit(1);
  });
})();
