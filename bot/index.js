const qrcode = require("qrcode-terminal");
const client = require("./clientConfig");
const config =  require("./config/configLoader")();
const { validarComprobante } = require("./utils/ocrValidator");
const { leerClientesGoogle } = require("./utils/utilsGoogle");
const { DateTime } = require("luxon");
const fs = require("fs");
const cron = require("node-cron");
const { cargarJsonSeguro } = require("./utils/helpers");


const manejarComandosAdmin = require("./handlers/adminCommands");
const { manejarMensajeTexto } = require("./handlers/mensajeHandler");
const { manejarMediaComprobante } = require("./handlers/ocrHandler");
const { enviarVencimientosProgramados, procesarVencimientos } = require("./handlers/vencimientosScheduler");

const adminPhone = config.adminPhone + "@c.us";
const paths = require("./config/paths");
const rutaMensajesEnviados = paths.mensajesEnviados;
const { esNumeroValido } = require("./utils/helpers");

client.on("qr", (qr) => {
  qrcode.generate(qr, { small: true });
  console.log("📲 Escanea el código QR con tu WhatsApp");
});

client.on("ready", async () => {
  console.log("✅ Bot listo. Programando tareas...");
  await client.sendMessage(adminPhone, "✅ *El bot se ha iniciado correctamente*.");


  await procesarVencimientos(client, '573114207673');
  enviarVencimientosProgramados(client);

  // 🕛 Ejecutar recordatorios todos los días a las 12:00 PM
  cron.schedule("30 12 * * *", async () => {
    console.log("⏰ Ejecutando recordatorios programados (12:30 PM)...");
    const { enviarRecordatorios } = require("./handlers/enviarRecordatorios");
    await enviarRecordatorios(client);
  });


});

client.on("message", async (msg) => {
  try {
    // 🛡️ Validaciones para ignorar mensajes inválidos o ruido
    if (!msg.body && !msg.hasMedia) return;
    if (!msg.from || !msg.from.includes("@")) return;
    if (msg.from === "status@broadcast") return;

    const numero = msg.from.replace("@c.us", "");
    if (!esNumeroValido(numero)) return;

    console.log("📩 Mensaje recibido de", numero, ":", msg.body);

    // 🔄 Cargar cuentas actualizadas desde Google Sheets
    const clientes = await leerClientesGoogle();
    const cuentasUsuario = clientes.filter(c =>
      (c["NUMERO WHATSAPP"] || "").toString().includes(numero)
    );

    // 🖼️ Si es una imagen comprobante
    if (msg.hasMedia) {
      const media = await msg.downloadMedia().catch(() => null);
      if (!media || !["image/jpeg", "image/png"].includes(media.mimetype)) {
        reenviarMensajeAnterior(client, numero);
        return;
      }

      await msg.reply("📸 Recibimos tu comprobante. *Validando...*");
      await manejarMediaComprobante(client, msg, numero, media, cuentasUsuario, adminPhone);
      return;
    }

    // 👑 Si es un mensaje del administrador
    if (msg.from === adminPhone) {
      await manejarComandosAdmin(msg, client, adminPhone);
      return;
    }

    // 💬 Si es un mensaje de texto común
    await manejarMensajeTexto(client, msg);

  } catch (error) {
    console.error("❌ Error procesando mensaje:", error.message);
  }
});


function reenviarMensajeAnterior(client, numero) {
  let historial = {};
  if (fs.existsSync(rutaMensajesEnviados)) {
    try {
      const contenido = fs.readFileSync(paths.mensajesEnviados, "utf8");

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

process.on("uncaughtException", (err) => {
  console.error("🔥 Error no capturado:", err);
  setTimeout(() => {
    client.sendMessage(adminPhone, `❌ *Error no capturado:* ${err.message}`).catch(() => {});
  }, 1000);
});


process.on("unhandledRejection", async (reason) => {
  console.error("🔴 Rechazo no manejado:", reason);
  try {
    await client.sendMessage(adminPhone, `❌ *Promesa no manejada:* ${reason}`);
  } catch (e) {
    console.error("🚫 No se pudo notificar al admin:", e.message);
  }
});

