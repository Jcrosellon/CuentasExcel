const fs = require("fs");
const { DateTime } = require("luxon");
const { MessageMedia } = require("whatsapp-web.js");
const { obtenerCatalogoTexto } = require("../utils/catalogoUtils");
const { limpiarTexto } = require("../utils/helpers");
const { leerClientesGoogle } = require("../utils/utilsGoogle");

const rutaPendientes = "./pendientes.json";
const rutaPendienteActual = "./pendiente_actual.json";

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

  const clienteData = {
    NOMBRE: pendienteActual.nombre || "Nuevo Cliente",
    CUENTA: pendienteActual.cuenta || "SERVICIO NUEVO",
    USUARIO: pendienteActual.usuario || "",
    VALOR: pendienteActual.valor || "20000"
  };

  const mensajeAdmin = `🧾 *Pago recibido de ${clienteData.NOMBRE}*\n` +
    `🧩 Referencia: ${resultado.referenciaDetectada}\n` +
    `📌 Cuenta: ${clienteData.CUENTA} (usuario: ${clienteData.USUARIO})\n` +
    `🧾 Tipo: Nueva Compra\n\n` +
    `✅ Para *confirmar* este pago responde: *CONFIRMADO* o ✅\n` +
    `❌ Para *rechazarlo* responde: *RECHAZADO* o ❌`;

  await client.sendMessage(adminPhone, mensajeAdmin);
  await client.sendMessage(adminPhone, media, { caption: "🖼 Comprobante adjunto" });
  await msg.reply("🕓 Comprobante enviado para validación. Te notificaremos pronto. 🙌");

  const pendientes = fs.existsSync(rutaPendientes) ? JSON.parse(fs.readFileSync(rutaPendientes)) : [];
  pendientes.push({
    numero,
    referencia: resultado.referenciaDetectada,
    fecha: DateTime.now().toISO(),
    nombre: clienteData.NOMBRE,
    cuenta: clienteData.CUENTA,
    usuario: clienteData.USUARIO,
    imagen: tempPath,
    esNuevo: true,
    valor: clienteData.VALOR,
    confirmado: false
  });

  fs.writeFileSync(rutaPendientes, JSON.stringify(pendientes, null, 2));
  console.log("🆕 Pendiente de nueva compra registrado:", resultado.referenciaDetectada);
}

module.exports = { manejarCompraNueva };
