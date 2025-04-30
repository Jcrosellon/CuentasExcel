// /bot/handlers/mensajeHandler.js
// Mueve la importación de 'paths' al inicio del archivo
const paths = require('../config/paths');  // Esta línea debe ir primero
const fs = require("fs");
const { DateTime } = require("luxon");
const { esNumeroValido } = require("../utils/helpers");
const { leerClientesGoogle } = require("../utils/utilsGoogle");
const { leerJsonSeguro } = require("../utils/helpers");

const {
  buscarProductoPorNumero,
  obtenerCatalogoTexto,
  obtenerValorProductoPorNumero,
} = require("../utils/catalogoUtils");
const {
  guardarRespuesta,
  yaFueConfirmado,
  yaRespondido,
  marcarRespondido
} = require("../utils/respuestasManager");

const config = require("../config/configLoader")();
const adminPhone = config.adminPhone + "@c.us";
const rutaMensajesEnviados = paths.mensajesEnviados;  // Ahora está correcto
const rutaPendientesSI = paths.pendientesSI;  // Ahora está correcto
const rutaPendienteNuevo = paths.pendienteNuevo;  // Ahora está correcto

async function manejarMensajeTexto(client, msg) {
  if (!msg.body || typeof msg.body !== 'string') return;
  if (!msg.from || !msg.from.includes("@")) return;
  if (!esNumeroValido(msg.from.split("@")[0])) return;
  if (msg.from === "status@broadcast") return;

  const numero = msg.from.replace("@c.us", "");
  const texto = msg.body.trim();
  const textoLimpio = texto.toLowerCase();
  const fechaActual = DateTime.now().setZone("America/Bogota").toISODate();

  console.log(`📩 Mensaje recibido de ${numero}: ${textoLimpio}`);

  const clientes = await leerClientesGoogle();
  const cuentasUsuario = clientes.filter(c =>
    (c["NUMERO WHATSAPP"] || "").toString().includes(numero)
  );

  const numeroPedido = parseInt(texto.replace(/[^\d]/g, ""));
  console.log("🔹 Número detectado del mensaje:", numeroPedido);

  const producto = buscarProductoPorNumero(numeroPedido);
  const valorProducto = obtenerValorProductoPorNumero(numeroPedido);
  console.log("🛒 Producto detectado:", producto || "❌ No encontrado");

  // 🔰 Cliente sin cuentas registradas
  if (cuentasUsuario.length === 0) {
    console.log("👤 Cliente nuevo (sin cuentas registradas)");

    if (!isNaN(numeroPedido) && producto) {
      const pendiente = {
        numero,
        cuenta: producto.split("-")[0].trim().toUpperCase(),
        valor: valorProducto ? valorProducto.toString() : "0",
        nombre: "Nuevo Cliente",
        usuario: "",
        fecha: DateTime.now().toISO(),
        confirmado: false
      };

      try {
        fs.writeFileSync(paths.pendienteNuevo, JSON.stringify(pendiente, null, 2));

        console.log("✅ Compra nueva guardada en pendiente_nuevo.json:", pendiente);
      } catch (err) {
        console.error("❌ Error al guardar pendiente_nuevo.json:", err.message);
      }

      await client.sendMessage(numero + "@c.us", `📹 Has elegido:\n${producto}\n\n💳 Realiza el pago a *Nequi o Daviplata: 3183192913* y envía el pantallazo por aquí. ¡Gracias por tu compra! 🙌`);
      return;
    }

    console.log("📤 Cliente nuevo, pero no eligió un número válido. Enviando catálogo...");
    await client.sendMessage(numero + "@c.us", `👋¡Hola! Bienvenido a *Roussillon Technology*.`);
    await client.sendMessage(numero + "@c.us", "📆 Este es nuestro catálogo de productos. Selecciona el número del que te interese:");
    await client.sendMessage(numero + "@c.us", obtenerCatalogoTexto());
    return;
  }

  const cliente = cuentasUsuario[0];
  const yaPago = cliente["RESPUESTA"]?.toLowerCase().includes("comprobante");
  console.log("💰 ¿Ya pagó este cliente?", yaPago);

  // ✅ Palabras afirmativas robustas
  const afirmativos = [
    "si", "sí", "sii", "siii", "sip", "sep", "claro", "dale", "vale", "va", "sí señor", "por supuesto", "de una",
    "confirmo", "ok", "okay", "👍", "✅", "sí!", "si!", "listo", "si claro", "si obvio", "simon", "yes", "yea", "yeah"
  ];

  if (afirmativos.some(a => textoLimpio.includes(a))) {
    console.log(`✅ Respuesta afirmativa detectada para ${numero}: "${textoLimpio}"`);

    await msg.reply("👍 ¡Perfecto! Realiza el pago a *Nequi o Daviplata: 3183192913* y adjunta el pantallazo aquí.");

    for (const cliente of cuentasUsuario) {
      await guardarRespuesta(numero, cliente, "SI", fechaActual);
      console.log(`📂 Respuesta SI registrada para ${cliente["NOMBRE"] || numero}`);
    }

    if (yaPago) {
      await client.sendMessage(numero + "@c.us", "🛍️ Aquí tienes de nuevo nuestro catálogo por si deseas adquirir otro servicio, por favor selecciona un producto del catálogo.:");
      await client.sendMessage(numero + "@c.us", obtenerCatalogoTexto());
    }

    const rutaPendientesSI = paths.pendientesSI;

    let pendientesSI = [];
    try {
      const contenido = fs.readFileSync(paths.pendientesSI, "utf8").trim();
      const pendientesSI = leerJsonSeguro(paths.pendientesSI);
    } catch (err) {
      console.error("⚠️ Error leyendo pendientes_si.json:", err.message);
      pendientesSI = [];
    }


    pendientesSI[numero] = {
      intencion: "si",
      fecha: DateTime.now().toISO(),
      enviado: true
    };

    fs.writeFileSync(paths.pendientesSI, JSON.stringify(pendientesSI, null, 2));

    console.log(`📝 Registro de SI persistente guardado para ${numero}`);
    return;
  }

  // ❌ Palabras negativas robustas
  const negativos = [
    "no", "nada", "no nada", "nop", "nah", "nunca", "ya no", "gracias no", "no gracias", "❌", "no quiero",
    "no puedo", "no por ahora", "nones", "nope", "😔", "👎", "nel", "nanay"
  ];

  if (negativos.some(n => textoLimpio.includes(n))) {
    console.log(`❌ Respuesta negativa detectada para ${numero}: "${textoLimpio}"`);

    await msg.reply("☹️ Lamentamos que no continúes. Aquí tienes el catálogo por si cambias de opinión, por favor selecciona un producto del catálogo.:");
    await client.sendMessage(numero + "@c.us", obtenerCatalogoTexto());

    for (const cliente of cuentasUsuario) {
      await guardarRespuesta(numero, cliente, "NO", fechaActual);
      console.log(`📂 Respuesta NO registrada para ${cliente["NOMBRE"] || numero}`);
    }

    return;
  }

  // 🧾 Ya pagó pero manda algo que no se entiende
  if (yaPago) {
    console.log("✅ Cliente ya tiene comprobante registrado");

    if (!isNaN(numeroPedido) && producto) {
      await client.sendMessage(numero + "@c.us", `📹 Has elegido:\n${producto}\n\n💳 Realiza el pago y envía el pantallazo aquí para procesarlo. 🙌`);
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
      await client.sendMessage(numero + "@c.us", `📹 Has elegido:\n${producto}\n\n💳 Realiza el pago y envía el pantallazo aquí.`);
      await client.sendMessage(adminPhone, `📦 Cliente *${numero}* confirmado quiere:\n${producto}`);
      return;
    }

    console.log("⚠️ Confirmado pero mensaje no válido");
    await client.sendMessage(numero + "@c.us", "📆 Servicios disponibles:");
    await client.sendMessage(numero + "@c.us", obtenerCatalogoTexto());
    return;
  }

  console.log("🤔 Última validación: mensaje sin interpretación útil");
  let historial = {};
  if (fs.existsSync(rutaMensajesEnviados)) {
    try {
      const historial = leerJsonSeguro(paths.mensajesEnviados);



      historial = contenido ? JSON.parse(contenido) : {};
    } catch (err) {
      console.error("⚠️ Error leyendo historial:", err.message);
    }
  }

  const mensajeAnterior = historial[numero];
  if (mensajeAnterior) {
    await client.sendMessage(numero + "@c.us", "🧠 No entendí tu mensaje. Por favor responde correctamente:");
    await client.sendMessage(numero + "@c.us", mensajeAnterior);
  } else {
    await client.sendMessage(numero + "@c.us", "🤔 No entendí tu mensaje. Escribe *SI*, *NO* o un número del catálogo para continuar.");
  }
}

module.exports = {
  manejarMensajeTexto
};
