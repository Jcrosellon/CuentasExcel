const fs = require("fs");
const { DateTime } = require("luxon");
const { MessageMedia } = require("whatsapp-web.js");
const { obtenerCatalogoTexto } = require("../utils/catalogoUtils");
const { limpiarTexto } = require("../utils/helpers");
const { leerClientesGoogle, agregarNuevaFilaEnGoogleSheets } = require("../utils/utilsGoogle");
const paths = require("../config/paths");
const rutaPendienteActual = paths.pendienteActual;
const rutaPendienteNuevo = paths.pendienteNuevo;

async function manejarCompraNueva({ client, numero, media, resultado, tempPath, msg, adminPhone }) {
  const refLimpia = limpiarTexto(resultado.referenciaDetectada);
  const clientesSheet = await leerClientesGoogle();

  const yaConfirmada = clientesSheet.some(c => {
    const refDoc = limpiarTexto(c["COMPROBANTE"]);
    const numDoc = (c["NUMERO WHATSAPP"] || "").replace(/\D/g, "");
    const numCliente = numero.replace(/\D/g, "");
    return refDoc === refLimpia && numDoc.includes(numCliente);
  });

  if (yaConfirmada) {
    await msg.reply("✅ Este pago ya fue confirmado anteriormente. No tienes servicios pendientes por renovar.");
    await client.sendMessage(numero + "@c.us", "🎁 Aquí tienes nuestro catálogo actualizado por si deseas adquirir un nuevo servicio:");
    await client.sendMessage(numero + "@c.us", obtenerCatalogoTexto());
    await fs.promises.unlink(tempPath).catch(() => {});
    return;
  }

  if (!fs.existsSync(rutaPendienteActual)) {
    await msg.reply("⚠️ No encontramos información de tu compra. Por favor selecciona un producto del catálogo antes de enviar el comprobante.");
    await fs.promises.unlink(tempPath).catch(() => {});
    return;
  }

  const pendienteActual = JSON.parse(fs.readFileSync(rutaPendienteActual));
  if (pendienteActual.numero !== numero) {
    await msg.reply("⚠️ El número de WhatsApp no coincide con una compra nueva activa. Por favor selecciona un producto del catálogo.");
    await fs.promises.unlink(tempPath).catch(() => {});
    return;
  }

  const valorEsperado = parseInt(pendienteActual.valor?.toString().replace(/[^\d]/g, ""), 10);

const clienteData = {
  nombre: pendienteActual.nombre || "Nuevo Cliente",
  cuenta: pendienteActual.cuenta || "SERVICIO NUEVO",
  usuario: pendienteActual.usuario || "",
  valor: valorEsperado || 0
};


  const mensajeAdmin = `🧾 *Pago recibido de ${clienteData.nombre}*\n` +
    `🧩 Referencia: *${resultado.referenciaDetectada}*\n` +
    `📌 Cuenta: *${clienteData.cuenta}* (usuario: ${clienteData.usuario})\n` +
    `🧾 Tipo: *Nueva Compra*`;

  await client.sendMessage(adminPhone, mensajeAdmin);
  await client.sendMessage(adminPhone, media, { caption: "🖼 Comprobante adjunto" });
  await client.sendMessage(adminPhone, `CONFIRMADO ${resultado.referenciaDetectada}`);
  await client.sendMessage(adminPhone, `RECHAZADO ${resultado.referenciaDetectada}`);
  await msg.reply("🕓 Comprobante enviado para validación. Te notificaremos pronto. 🙌");

  const nuevoPendiente = {
    numero,
    referencia: resultado.referenciaDetectada,
    fecha: DateTime.now().toISO(),
    nombre: clienteData.nombre,
    cuenta: clienteData.cuenta,
    usuario: clienteData.usuario,
    imagen: tempPath,
    esNuevo: true,
    valor: clienteData.valor,
    confirmado: false
  };

  fs.writeFileSync(rutaPendienteNuevo, JSON.stringify(nuevoPendiente, null, 2));
  console.log("🆕 Pendiente de nueva compra registrado:", resultado.referenciaDetectada);
}

module.exports = { manejarCompraNueva };
