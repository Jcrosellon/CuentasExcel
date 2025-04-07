// /handlers/adminCommands.js

const fs = require("fs");
const { DateTime } = require("luxon");
const { leerClientesGoogle  } = require("../utils/utilsGoogle");
const { validarComprobante } = require("../utils/ocrValidator");
const { agregarNuevaFilaEnGoogleSheets } = require("../utils/utilsGoogle");
const { generarResumenEstado, obtenerEstadoDeCuentas } = require("../utils/estadoCuentas");
const { obtenerCatalogoTexto } = require("../utils/catalogoUtils");

const rutaPendientes = "./pendientes.json";
const rutaPendienteActual = "./pendiente_actual.json";

module.exports = async function manejarComandosAdmin(msg, client, adminPhone) {
  const texto = msg.body.trim();
  const textoLimpio = texto.toLowerCase();

  if (textoLimpio === "limpiar pendientes") {
    fs.writeFileSync(rutaPendientes, JSON.stringify([], null, 2));
    await msg.reply("🧹 Pendientes limpiados con éxito.");
    return;
  }

  if (textoLimpio === "estado") {
    const clientes = await leerClientesGoogle ();
    const resumen = obtenerEstadoDeCuentas(clientes);
    const mensaje = generarResumenEstado(resumen);
    await client.sendMessage(adminPhone, mensaje);
    return;
  }

  if (["analizar último", "analizar ultimo"].includes(textoLimpio)) {
    const { reanalizarUltimoPendiente } = require("./ocrHandler");
    await reanalizarUltimoPendiente(client, adminPhone);
    return;
  }
  


  const pendientes = fs.existsSync(rutaPendientes)
    ? JSON.parse(fs.readFileSync(rutaPendientes))
    : [];

  const pendiente = pendientes.length > 0 && !pendientes[0].confirmado ? pendientes.shift() : null;
  fs.writeFileSync(rutaPendientes, JSON.stringify(pendientes, null, 2));

  if (["confirmado", "✅"].includes(textoLimpio) && pendiente) {
    await client.sendMessage(pendiente.numero + "@c.us", `✅ Tu pago ha sido confirmado. Ref: *${pendiente.referencia}*. ¡Gracias por tu compra! 🎉\nEspera un momento mientras generamos tus accesos...`);
    pendiente.confirmado = true;
    pendiente.fechaConfirmacion = DateTime.now().toISO();
    fs.writeFileSync(rutaPendienteActual, JSON.stringify(pendiente, null, 2));
    await client.sendMessage(adminPhone, `📝 Por favor responde con los datos de la nueva cuenta para registrar la venta:\n\n📌 *Escribe en este formato:*\nDISNEY\nusuario: juan123\nclave: abc456`);
    return;
  }

  if (fs.existsSync(rutaPendienteActual)) {
    const pendiente = JSON.parse(fs.readFileSync(rutaPendienteActual, "utf8"));
    const patron = /^(.+?)\s*\n\s*usuario[:\s]+(.+)\s*\n\s*clave[:\s]+(.+)/i;
    const match = msg.body.trim().match(patron);

    if (!match) {
      await client.sendMessage(adminPhone, `❌ Formato no reconocido. Asegúrate de escribir:\n\nDISNEY\nusuario: juan123\nclave: abc456`);
      return;
    }

    const cuenta = match[1].trim().toUpperCase();
    const usuarioCuenta = match[2].trim();
    const claveCuenta = match[3].trim();
    const hoy = DateTime.now().setZone("America/Bogota");
    const fechaInicio = hoy.toFormat("dd/LL/yyyy");
    const fechaFinal = hoy.plus({ days: 30 }).toFormat("dd/LL/yyyy");

    const fila = {
      nombre: pendiente.nombre,
      alias: "",
      fechaInicio,
      fechaFinal,
      usuario: usuarioCuenta,
      clave: claveCuenta,
      cuenta,
      dispositivo: "",
      perfil: "1",
      valor: pendiente.valor || "",
      numero: pendiente.numero,
      respuesta: "✅ Comprobante",
      fechaRespuesta: fechaInicio,
      referencia: pendiente.referencia || ""
    };

    await agregarNuevaFilaEnGoogleSheets(fila);
    await client.sendMessage(pendiente.numero + "@c.us", `✅ Tu cuenta ha sido activada:\n\n📺 *${cuenta}*\n👤 Usuario: *${usuarioCuenta}*\n🔐 Clave: *${claveCuenta}*\n\n⚠ TÉRMINOS Y CONDICIONES\n📌 USAR LAS PANTALLAS CONTRATADAS\n📌 NO COMPARTIR LA CUENTA\n\n📝 Incumplir estos términos puede generar la pérdida de garantía.\n\nGracias por elegir *Roussillon Technology*. ¡Estamos comprometidos con ofrecerte el mejor servicio!*`);
    await client.sendMessage(adminPhone, `✅ Cuenta *${cuenta}* registrada y enviada al cliente *${pendiente.nombre}*`);
    fs.unlinkSync(rutaPendienteActual);
  }
  module.exports = manejarComandosAdmin;
}
