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
        valor: valorProducto ? valorProducto.toString() : "0", // o puedes lanzar error si no se encuentra
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

  const afirmativos = ["si", "sí", "✅", "dale", "confirmo", "de una", "claro", "vale", "ok"];

  if (/(\bsi\b|\bsí\b|✅|dale|confirmo|claro|vale|ok)/i.test(texto)) {

  console.log(`✅ Respuesta afirmativa detectada para ${numero}: "${textoLimpio}"`);

  await msg.reply("👍 ¡Perfecto! Realiza el pago a *Nequi o Daviplata: 3183192913* y adjunta el pantallazo aquí.");

  // Registrar la respuesta SI en el documento (Google Sheets o local)
  for (const cliente of cuentasUsuario) {
    await guardarRespuesta(numero, cliente, "SI", fechaActual);
    console.log(`💾 Respuesta SI registrada para ${cliente["NOMBRE"] || numero}`);
  }

  // (Opcional) Enviar el catálogo para facilitar nueva selección
  const catalogo = obtenerCatalogoTexto();
  // Solo enviar catálogo si ya pagó o si es nuevo cliente seleccionando producto
if (yaPago) {
  await client.sendMessage(numero + "@c.us", "🛍️ Aquí tienes de nuevo nuestro catálogo por si deseas adquirir otro servicio:");
  await client.sendMessage(numero + "@c.us", obtenerCatalogoTexto());
}


  // 📌 Guardar respuesta "sí" para reenviar número de pago si fue ignorado
const rutaPendientesSI = "./pendientes_si.json";
let pendientesSI = {};

if (fs.existsSync(rutaPendientesSI)) {
  try {
    pendientesSI = JSON.parse(fs.readFileSync(rutaPendientesSI, "utf8"));
  } catch (err) {
    console.error("❌ Error leyendo pendientes_si.json:", err.message);
  }
}

pendientesSI[numero] = {
  intencion: "si",
  fecha: DateTime.now().toISO(),
  enviado: true // ya fue enviado en este momento
};

fs.writeFileSync(rutaPendientesSI, JSON.stringify(pendientesSI, null, 2));
console.log(`📝 Registro de SI persistente guardado para ${numero}`);


  return;
}


const negativos = ["no", "❌", "nah", "nop", "nunca", "ya no", "gracias no"];

if (negativos.some(p => textoLimpio.includes(p))) {
  console.log(`❌ Respuesta negativa detectada para ${numero}: "${textoLimpio}"`);

  await msg.reply("☹️ Lamentamos que no continúes. Aquí tienes el catálogo por si cambias de opinión:");
  await client.sendMessage(numero + "@c.us", obtenerCatalogoTexto());

  for (const cliente of cuentasUsuario) {
    await guardarRespuesta(numero, cliente, "NO", fechaActual);
    console.log(`💾 Respuesta NO registrada para ${cliente["NOMBRE"] || numero}`);
  }

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