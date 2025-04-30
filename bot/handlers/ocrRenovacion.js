const fs = require("fs");
const { DateTime } = require("luxon");
const { obtenerCatalogoTexto } = require("../utils/catalogoUtils");
const { formatearPesosColombianos } = require("../utils/helpers");
const { leerClientesGoogle } = require("../utils/utilsGoogle");
const { moverFilaOrdenadaPorFechaFinal } = require("../utils/utilsGoogle");
const paths = require("../config/paths");
const rutaPendientes = paths.pendientes;

async function manejarRenovacion({ client, numero, media, resultado, tempPath, msg, adminPhone }) {
  const referenciaDetectada = resultado.referenciaDetectada?.trim() || "";
  const valorDetectado = resultado.valorDetectado || 0;

  // Uso de la lectura segura de pendientes.json
  let pendientes = [];
  try {
    const contenido = fs.readFileSync(paths.pendientes, "utf8").trim();
    pendientes = contenido ? JSON.parse(contenido) : [];
  } catch (err) {
    console.error("⚠️ Error leyendo pendientes.json:", err.message);
    pendientes = [];  // fallback seguro
  }

  const pendiente = pendientes.find(p => p.numero === numero && !p.confirmado);

  if (!pendiente) {
    await msg.reply("⚠️ No se encontró información de una renovación activa con tu número.");
    await client.sendMessage(numero + "@c.us", "🎁 Aquí tienes nuestro catálogo actualizado por si deseas adquirir un nuevo servicio, por favor selecciona un producto del catálogo:");
    await client.sendMessage(numero + "@c.us", obtenerCatalogoTexto());
    await fs.promises.unlink(tempPath).catch(() => {});
    return;
  }

  const valorEsperado = (pendiente.valor || "20000").toString().replace(/\./g, "");

  if (valorDetectado === 0 || isNaN(valorDetectado)) {
    await msg.reply("⚠️ No pudimos detectar un valor de pago en el comprobante. Asegúrate de que el comprobante sea válido.");
    await fs.promises.unlink(tempPath).catch(() => {});
    return;
  }

  if (valorDetectado < parseFloat(valorEsperado)) {
    await msg.reply(`❌ El pago es insuficiente. El valor esperado es: *${formatearPesosColombianos(valorEsperado)}*.`);
    await fs.promises.unlink(tempPath).catch(() => {});
    return;
  }

  // Buscar la fecha final actual desde el documento
  const clientes = await leerClientesGoogle();
  const filaCliente = clientes.find(c =>
    (c["NUMERO WHATSAPP"] || "").replace(/\D/g, "") === numero.replace(/\D/g, "") &&
    c["CUENTA"] === pendiente.cuenta
  );

  pendiente.referencia = referenciaDetectada;
  pendiente.fechaFinal = filaCliente?.["FECHA FINAL"] || "";
  pendiente.fecha = DateTime.now().toISO();
  pendiente.imagen = tempPath;

  // Enviar mensaje al admin con los datos del pago
  await client.sendMessage(adminPhone,
    `🧾 *Pago recibido de ${pendiente.nombre}*\n` +
    `🧩 Referencia: *${referenciaDetectada}*\n` +
    `📌 Cuenta: *${pendiente.cuenta}* (usuario: ${pendiente.usuario || "-"})\n` +
    `🧾 Tipo: *Renovación*`
  );

  // Enviar imagen del comprobante
  await client.sendMessage(adminPhone, media, { caption: "🖼 Comprobante adjunto" });

  // Enviar comandos separados para fácil copia
  await client.sendMessage(adminPhone, "CONFIRMADO " + referenciaDetectada + "");
  await client.sendMessage(adminPhone, "RECHAZADO " + referenciaDetectada + "");

  await msg.reply("🕓 Comprobante enviado para validación. Te notificaremos pronto. 🙌");

  fs.writeFileSync(paths.pendientes, JSON.stringify(pendientes, null, 2));

  console.log("📩 Pendiente agregado para revisión (renovación):", referenciaDetectada);
}

module.exports = { manejarRenovacion };
