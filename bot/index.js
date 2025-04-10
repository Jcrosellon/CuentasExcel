const qrcode = require("qrcode-terminal");
const client = require("./clientConfig");
const config = require("./config/configLoader")();
const { validarComprobante } = require("./utils/ocrValidator");
const { leerClientesGoogle } = require("./utils/utilsGoogle");
const { DateTime } = require("luxon");
const fs = require("fs");
const cron = require("node-cron");

const manejarComandosAdmin = require("./handlers/adminCommands");
const { manejarMensajeTexto } = require("./handlers/mensajeHandler");
const { manejarMediaComprobante } = require("./handlers/ocrHandler");
const { enviarVencimientosProgramados, procesarVencimientos } = require("./handlers/vencimientosScheduler");

const adminPhone = config.adminPhone + "@c.us";
const rutaMensajesEnviados = "./mensajesEnviados.json";
const { esNumeroValido } = require("./utils/helpers");

client.on("qr", (qr) => {
  qrcode.generate(qr, { small: true });
  console.log("📲 Escanea el código QR con tu WhatsApp");
});

client.on("ready", async () => {
  console.log("✅ Bot listo. Programando tareas...");

  await procesarVencimientos(client, "573114207673");
enviarVencimientosProgramados(client);
});

client.on("message", async (msg) => {
  const numero = msg.from.replace("@c.us", "");

  // 🔄 Cargar cuentas actualizadas desde Google Sheets
  const clientes = await leerClientesGoogle();
  const cuentasUsuario = clientes.filter(c =>
    (c["NUMERO WHATSAPP"] || "").toString().includes(numero)
  );


  if (msg.hasMedia) {
    const media = await msg.downloadMedia().catch(() => null);
    if (!media || !["image/jpeg", "image/png"].includes(media.mimetype)) {
      reenviarMensajeAnterior(client, numero);
      return;
    }
  
    // Solo si es imagen válida continúa
    await msg.reply("📸 Recibimos tu comprobante. *Validando...*");
    await manejarMediaComprobante(client, msg, numero, media, cuentasUsuario, adminPhone);
    return;
  }
  

  if (msg.from === adminPhone) {
    await manejarComandosAdmin(msg, client, adminPhone);
    return;
  }

  await manejarMensajeTexto(msg, numero, msg.body, cuentasUsuario, client, adminPhone);
});

function reenviarMensajeAnterior(client, numero) {
  let historial = {};
  if (fs.existsSync(rutaMensajesEnviados)) {
    try {
      const contenido = fs.readFileSync(rutaMensajesEnviados, "utf8");
      historial = contenido ? JSON.parse(contenido) : {};
    } catch (err) {
      console.error("⚠️ Error leyendo historial:", err.message);
    }
  }

  const mensaje = historial[numero];
  if (mensaje && typeof mensaje === "string" && esNumeroValido(numero)) {
    client.sendMessage(numero + "@c.us", "🤖 No entendí eso, pero aquí está lo último que te envié:");
    client.sendMessage(numero + "@c.us", mensaje);
  } else {
    client.sendMessage(numero + "@c.us", "🤔 No entendí tu mensaje. Intenta escribir *SI* o *NO* para continuar.");
  }
}

client.initialize();
