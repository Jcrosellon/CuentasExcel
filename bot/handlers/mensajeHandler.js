// /bot/handlers/mensajeHandler.js

const fs = require("fs");
const { DateTime } = require("luxon");
const { buscarProductoPorNumero, obtenerCatalogoTexto, obtenerValorProductoPorNumero } = require("../utils/catalogoUtils");
const {
  guardarRespuesta,
  yaFueConfirmado,
  yaRespondido,
  marcarRespondido
} = require("../utils/respuestasManager");

const rutaMensajesEnviados = "./mensajesEnviados.json";
const rutaPendientes = "./pendientes.json";
const rutaPendienteActual = "./pendiente_actual.json";

async function manejarMensajeTexto(msg, numero, texto, cuentasUsuario, client, adminPhone) {
  const textoLimpio = texto.toLowerCase();
  const fechaActual = DateTime.now().setZone("America/Bogota").toISODate();

 // Reemplaza el bloque completo if (cuentasUsuario.length === 0) por este:
if (cuentasUsuario.length === 0) {
  const numeroPedido = parseInt(texto.replace(/[^\d]/g, ""));

  if (!isNaN(numeroPedido)) {
    const producto = buscarProductoPorNumero(numeroPedido);
    const valorProducto = obtenerValorProductoPorNumero(numeroPedido);

    if (producto) {
      await client.sendMessage(numero + "@c.us", `🛙 Has elegido:\n${producto}\n\n💳 Realiza el pago a *Nequi o Daviplata: 3183192913* y envía el pantallazo por aquí. ¡Gracias por tu compra! 🙌`);

      // Guardar como pendiente de nueva compra
      const pendiente = {
        numero,
        cuenta: producto.split("-")[0].trim().toUpperCase(),
        valor: valorProducto || "20000",
        nombre: "Nuevo Cliente",
        usuario: "",
        fecha: DateTime.now().toISO(),
        confirmado: false
      };

      fs.writeFileSync(rutaPendienteActual, JSON.stringify(pendiente, null, 2));
      console.log("✨ Guardado en pendiente_actual.json:", pendiente);

      return;
    }
  }

  // Si no eligió un número válido
  await client.sendMessage(numero + "@c.us", `👋¡Hola! Bienvenido a *Roussillon Technology*.`);
  await client.sendMessage(numero + "@c.us", "📦 Este es nuestro catálogo de productos. Selecciona el número del que te interese:");
  const catalogo = obtenerCatalogoTexto();
  await client.sendMessage(numero + "@c.us", catalogo);
  return;
}


  const cliente = cuentasUsuario[0];
  const yaPago = cliente["RESPUESTA"]?.toLowerCase().includes("comprobante");

  if (["si", "sí", "✅ si"].includes(textoLimpio)) {
    await msg.reply("👍 ¡Perfecto! Realiza el pago a *Nequi o Daviplata: 3183192913* y adjunta el pantallazo aquí.");
    for (const cliente of cuentasUsuario) await guardarRespuesta(numero, cliente, "SI", fechaActual);
    return;
  }

  if (["no", "❌ no"].includes(textoLimpio)) {
    await msg.reply("☹️ Siento que hayas tenido algún inconveniente...");
    const catalogo = obtenerCatalogoTexto();
    await client.sendMessage(numero + "@c.us", catalogo);
    for (const cliente of cuentasUsuario) await guardarRespuesta(numero, cliente, "NO", fechaActual);
    return;
  }

  const numeroPedido = parseInt(texto.replace(/[^\d]/g, ""));
  const producto = buscarProductoPorNumero(numeroPedido);

  if (yaPago) {
    if (!isNaN(numeroPedido) && producto) {
      await client.sendMessage(numero + "@c.us", `🛙 Has elegido:\n${producto}\n\n💳 Realiza el pago y envía el pantallazo aquí para procesarlo. 🙌`);
      await client.sendMessage(adminPhone, `🆕 Cliente *${numero}* ya activo quiere otra cuenta:\n${producto}`);
      return;
    }

    const claves = ["cuenta", "netflix", "disney", "ayuda", "asesor", "iptv"];
    if (claves.some(p => textoLimpio.includes(p))) {
      await client.sendMessage(numero + "@c.us", "📦 Servicios disponibles. Elige el número del producto que deseas:");
      const catalogo = obtenerCatalogoTexto();
      await client.sendMessage(numero + "@c.us", catalogo);
    } else {
      await client.sendMessage(numero + "@c.us", "✅ Ya registramos tu pago. Si necesitas algo más, escríbeme.");
    }
    return;
  }

  if (yaFueConfirmado(numero)) {
    if (!isNaN(numeroPedido) && producto) {
      await client.sendMessage(numero + "@c.us", `🛙 Has elegido:\n${producto}\n\n💳 Realiza el pago y envía el pantallazo aquí.`);
      await client.sendMessage(adminPhone, `📦 Cliente *${numero}* confirmado quiere:\n${producto}`);
      return;
    }

    const claves = ["cuenta", "ayuda", "asesor", "iptv"];
    if (claves.some(p => textoLimpio.includes(p))) {
      await client.sendMessage(numero + "@c.us", "📦 Servicios disponibles:");
      const catalogo = obtenerCatalogoTexto();
      await client.sendMessage(numero + "@c.us", catalogo);
    } else if (!yaRespondido(numero)) {
      await client.sendMessage(numero + "@c.us", "✅ Ya registramos tu pago. Si necesitas algo más, escríbeme.");
      marcarRespondido(numero);
    }
    return;
  }

  let historial = {};
  if (fs.existsSync(rutaMensajesEnviados)) {
    try {
      const contenido = fs.readFileSync(rutaMensajesEnviados, "utf8");
      historial = contenido ? JSON.parse(contenido) : {};
    } catch (err) {
      console.error("⚠️ Error leyendo historial:", err.message);
    }
  }

  if (!isNaN(numeroPedido) && producto) {
    await client.sendMessage(numero + "@c.us", `🛙 Has elegido:\n${producto}\n\n💳 Realiza el pago y envía el pantallazo aquí.`);
    await client.sendMessage(adminPhone, `📦 Cliente *${numero}* está interesado en:\n${producto}`);
    return;
  }

  // Al final de manejarMensajeTexto
const mensajeAnterior = historial[numero];
if (mensajeAnterior) {
  await client.sendMessage(numero + "@c.us", "🤖 No entendí tu mensaje. Aquí está lo último que te envié:");
  await client.sendMessage(numero + "@c.us", mensajeAnterior);
} else {
  await client.sendMessage(numero + "@c.us", "🤔 No entendí tu mensaje. Escribe *SI*, *NO* o un número del catálogo para continuar.");
}
}
module.exports = {
  manejarMensajeTexto
};