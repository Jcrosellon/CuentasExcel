const { Client, LocalAuth, Buttons } = require("whatsapp-web.js");
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
  console.log("✅ Bot listo para enviar BOTÓN de prueba");

  const numero = "573114207673@c.us";
  const mensaje = "🧪 Hola Carlos, esto es una prueba con botón. ¿Deseas continuar?";
  const botones = new Buttons(mensaje, ["✅ Sí", "❌ No"], "Confirmación", "Responde una opción");

  try {
    const resultado = await client.sendMessage(numero, botones);
    console.log("📩 Resultado:", resultado);
  } catch (err) {
    console.error("❌ Error al enviar botón:", err);
  }
});

client.initialize();
