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
const rutaPendienteNuevo = "./pendiente_nuevo.json";

async function manejarMensajeTexto(msg, numero, texto, cuentasUsuario, client, adminPhone) {
  const textoLimpio = texto.toLowerCase();
  const fechaActual = DateTime.now().setZone("America/Bogota").toISODate();
  console.log(`📩 Mensaje recibido de ${numero}: ${textoLimpio}`);

  const numeroPedido = parseInt(texto.replace(/[^\d]/g, ""));
  console.log("🔢 Número detectado del mensaje:", numeroPedido);

  const producto = buscarProductoPorNumero(numeroPedido);
  const valorProducto = obtenerValorProductoPorNumero(numeroPedido);
  console.log("🛒 Producto detectado:", producto || "❌ No encontrado");

  if (cuentasUsuario.length === 0) {
    console.log("👤 Cliente nuevo (sin cuentas registradas)");

    if (!isNaN(numeroPedido) && producto) {
      const pendiente = {
        numero,
        cuenta: producto.split("-")[0].trim().toUpperCase(),
        valor: valorProducto || "20000",
        nombre: "Nuevo Cliente",
        usuario: "",
        fecha: DateTime.now().toISO(),
        confirmado: false
      };

      try {
        fs.writeFileSync(rutaPendienteNuevo, JSON.stringify(pendiente, null, 2));
        console.log("✅ Compra nueva guardada en pendiente_nuevo.json:", pendiente);
      } catch (err) {
        console.error("❌ Error al guardar pendiente_nuevo.json:", err.message);
      }

      await client.sendMessage(numero + "@c.us", `🛙 Has elegido:\n${producto}\n\n💳 Realiza el pago a *Nequi o Daviplata: 3183192913* y envía el pantallazo por aquí. ¡Gracias por tu compra! 🙌`);
      return;
    }

    console.log("📤 Cliente nuevo, pero no eligió un número válido. Enviando catálogo...");
    await client.sendMessage(numero + "@c.us", `👋¡Hola! Bienvenido a *Roussillon Technology*.`);
    await client.sendMessage(numero + "@c.us", "📦 Este es nuestro catálogo de productos. Selecciona el número del que te interese:");
    await client.sendMessage(numero + "@c.us", obtenerCatalogoTexto());
    return;
  }

  const cliente = cuentasUsuario[0];
  const yaPago = cliente["RESPUESTA"]?.toLowerCase().includes("comprobante");
  console.log("💰 ¿Ya pagó este cliente?", yaPago);

  if (["si", "sí", "✅ si"].includes(textoLimpio)) {
    console.log("📥 Cliente respondió que sí pagará");
    await msg.reply("👍 ¡Perfecto! Realiza el pago a *Nequi o Daviplata: 3183192913* y adjunta el pantallazo aquí.");
    for (const cliente of cuentasUsuario) await guardarRespuesta(numero, cliente, "SI", fechaActual);
    return;
  }

  if (["no", "❌ no"].includes(textoLimpio)) {
    console.log("📥 Cliente respondió que no pagará");
    await msg.reply("☹️ Siento que hayas tenido algún inconveniente...");
    await client.sendMessage(numero + "@c.us", obtenerCatalogoTexto());
    for (const cliente of cuentasUsuario) await guardarRespuesta(numero, cliente, "NO", fechaActual);
    return;
  }

  if (yaPago) {
    console.log("✅ Cliente ya tiene comprobante registrado");

    if (!isNaN(numeroPedido) && producto) {
      await client.sendMessage(numero + "@c.us", `🛙 Has elegido:\n${producto}\n\n💳 Realiza el pago y envía el pantallazo aquí para procesarlo. 🙌`);
      await client.sendMessage(adminPhone, `🆕 Cliente *${numero}* ya activo quiere otra cuenta:\n${producto}`);
      return;
    }

    console.log("📥 Cliente ya pagó, pero mensaje no contiene número válido");
    await client.sendMessage(numero + "@c.us", "✅ Ya registramos tu pago. Si necesitas algo más, escríbeme.");
    return;
  }

  if (yaFueConfirmado(numero)) {
    console.log("✅ Cliente confirmado previamente");

    if (!isNaN(numeroPedido) && producto) {
      await client.sendMessage(numero + "@c.us", `🛙 Has elegido:\n${producto}\n\n💳 Realiza el pago y envía el pantallazo aquí.`);
      await client.sendMessage(adminPhone, `📦 Cliente *${numero}* confirmado quiere:\n${producto}`);
      return;
    }

    console.log("⚠️ Confirmado pero mensaje no válido");
    await client.sendMessage(numero + "@c.us", "📦 Servicios disponibles:");
    await client.sendMessage(numero + "@c.us", obtenerCatalogoTexto());
    return;
  }

  console.log("🤔 Última validación: mensaje sin interpretación útil");
  let historial = {};
  if (fs.existsSync(rutaMensajesEnviados)) {
    try {
      const contenido = fs.readFileSync(rutaMensajesEnviados, "utf8");
      historial = contenido ? JSON.parse(contenido) : {};
    } catch (err) {
      console.error("⚠️ Error leyendo historial:", err.message);
    }
  }

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