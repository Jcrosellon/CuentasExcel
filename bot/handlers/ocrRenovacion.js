const fs = require("fs");
const { DateTime } = require("luxon");
const { obtenerCatalogoTexto } = require("../utils/catalogoUtils");
const { formatearPesosColombianos } = require("../utils/helpers");

const rutaPendientes = "./pendientes.json";

async function manejarRenovacion({ client, numero, media, resultado, tempPath, msg, adminPhone }) {
  const referenciaDetectada = resultado.referenciaDetectada?.trim() || "";
  const valorDetectado = resultado.valorDetectado || 0;

  const pendientes = fs.existsSync(rutaPendientes)
    ? JSON.parse(fs.readFileSync(rutaPendientes))
    : [];

  const pendiente = pendientes.find(p => p.numero === numero && !p.confirmado);

  if (!pendiente) {
    await msg.reply("⚠️ No se encontró información de una renovación activa con tu número. Si ya pagaste antes, este comprobante pudo haber sido confirmado.");
    await client.sendMessage(numero + "@c.us", "🎁 Aquí tienes nuestro catálogo actualizado por si deseas adquirir un nuevo servicio:");
    await client.sendMessage(numero + "@c.us", obtenerCatalogoTexto());
    await fs.promises.unlink(tempPath).catch(() => {});
    return;
  }

  const valorEsperado = (pendiente.valor || "20000").toString().replace(/\./g, "");

  if (valorDetectado === 0 || isNaN(valorDetectado)) {
    await msg.reply("⚠️ No pudimos detectar un valor de pago en el comprobante. Asegúrate de que el monto esté visible.");
    await fs.promises.unlink(tempPath).catch(() => {});
    return;
  }

  if (valorDetectado < parseFloat(valorEsperado)) {
    await msg.reply(`❌ El pago es insuficiente. El valor esperado es: *${formatearPesosColombianos(valorEsperado)}*.`);
    await fs.promises.unlink(tempPath).catch(() => {});
    return;
  }

  const mensajeAdmin = `🧾 *Pago recibido de ${pendiente.nombre}*\n` +
    `🧩 Referencia: ${referenciaDetectada}\n` +
    `📌 Cuenta: ${pendiente.cuenta} (usuario: ${pendiente.usuario})\n` +
    `🧾 Tipo: Renovación\n\n` +
    `✅ Para *confirmar* este pago responde: *CONFIRMADO* o ✅\n` +
    `❌ Para *rechazarlo* responde: *RECHAZADO* o ❌`;

  await client.sendMessage(adminPhone, mensajeAdmin);
  await client.sendMessage(adminPhone, media, { caption: "🖼 Comprobante adjunto" });
  await msg.reply("🕓 Comprobante enviado para validación. Te notificaremos pronto. 🙌");

  pendiente.referencia = referenciaDetectada;
  pendiente.fecha = DateTime.now().toISO();
  pendiente.imagen = tempPath;

  fs.writeFileSync(rutaPendientes, JSON.stringify(pendientes, null, 2));
  console.log("📩 Pendiente agregado para revisión (renovación):", referenciaDetectada);
}

module.exports = { manejarRenovacion };
