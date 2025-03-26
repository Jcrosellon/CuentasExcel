const { Client, LocalAuth } = require("whatsapp-web.js");
const qrcode = require("qrcode-terminal");

const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: { headless: true }
});

client.on("qr", (qr) => {
  qrcode.generate(qr, { small: true });
  console.log("📲 Escanea el código QR con tu WhatsApp");
});

client.on("ready", async () => {
  console.log("✅ Bot listo para enviar mensaje directo");

  // Número de destino (cambia si quieres probar otro)
  const numero = "573114207673@c.us";
  const mensaje = "👋 Hola Carlos, esto es un mensaje directo de prueba desde el bot.";

  try {
    const resultado = await client.sendMessage(numero, mensaje);
    console.log("📩 Resultado del envío:", resultado);
  } catch (err) {
    console.error("❌ Error al enviar el mensaje:", err);
  }
});

client.initialize();
