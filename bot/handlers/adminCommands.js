// /handlers/adminCommands.js

const fs = require("fs");
const { DateTime } = require("luxon");
const { leerClientesGoogle, actualizarFilaExistenteEnGoogleSheets, agregarNuevaFilaEnGoogleSheets } = require("../utils/utilsGoogle");
const { validarComprobante } = require("../utils/ocrValidator");
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
    const clientes = await leerClientesGoogle();
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

  if (textoLimpio === "enviar vencimientos") {
    const { procesarVencimientos } = require("./vencimientosScheduler");
    const adminNumero = adminPhone.replace("@c.us", "");
    await msg.reply("🚀 Ejecutando envío manual de vencimientos...");

    const resumen = { total: 0, hoy: 0, manana: 0, mora: 0 };
    const procesarConResumen = async () => {
      const hoy = DateTime.now().setZone("America/Bogota").startOf("day");
      const clientes = await leerClientesGoogle();
      const agrupados = {};

      for (const c of clientes) {
        const numero = c["NUMERO WHATSAPP"]?.toString().split(".")[0] || "";
        if (!agrupados[numero]) {
          agrupados[numero] = { nombre: c["NOMBRE"] || "", cuentas: [] };
        }
        agrupados[numero].cuentas.push({
          cuenta: c["CUENTA"],
          valor: c["VALOR"],
          fechaFinal: c["FECHA FINAL"],
          dispositivo: c["DISPOSITIVO"] || "",
        });
      }

      for (const numero in agrupados) {
        if (numero !== adminNumero) continue;
        const cuentas = agrupados[numero].cuentas;

        for (const cuenta of cuentas) {
          let fechaFinal;
          const rawFecha = cuenta.fechaFinal;

          if (typeof rawFecha === "string") {
            const [d, m, y] = rawFecha.split("/");
            fechaFinal = DateTime.fromFormat(`${d.padStart(2, "0")}/${m.padStart(2, "0")}/${y}`, "dd/MM/yyyy", { zone: "America/Bogota" });
          }

          if (!fechaFinal || !fechaFinal.isValid) continue;

          const diff = fechaFinal.startOf("day").diff(hoy, "days").days;

          if (diff === 1) resumen.manana++;
          else if (diff === 0) resumen.hoy++;
          else if (diff < 0) resumen.mora++;

          resumen.total++;
        }

        await procesarVencimientos(client, adminNumero);
      }
    };

    await procesarConResumen();

    await client.sendMessage(adminPhone, `📊 *Resumen de envío de vencimientos:*\n\n🟢 Total cuentas: ${resumen.total}\n📅 Vencen HOY: ${resumen.hoy}\n⏳ Vencen MAÑANA: ${resumen.manana}\n💀 En MORA: ${resumen.mora}`);
    return;
  }

  let pendientes = fs.existsSync(rutaPendientes)
    ? JSON.parse(fs.readFileSync(rutaPendientes))
    : [];

  const pendiente = pendientes.find(p => !p.confirmado);

  if (["rechazado", "❌"].includes(textoLimpio) && pendiente) {
    pendiente.rechazado = true;
    pendiente.fechaRechazo = DateTime.now().toISO();
    fs.writeFileSync(rutaPendientes, JSON.stringify(pendientes, null, 2));

    if (pendiente.imagen && fs.existsSync(pendiente.imagen)) {
      fs.unlinkSync(pendiente.imagen);
    }

    await client.sendMessage(pendiente.numero + "@c.us", "❌ Tu comprobante fue rechazado por el administrador. Por favor revisa el valor pagado y vuelve a intentarlo.");
    await msg.reply("❌ Rechazo registrado y notificado al cliente.");
    return;
  }

  if (["confirmado", "✅"].includes(textoLimpio) && pendiente) {
    pendiente.confirmado = true;
    pendiente.fechaConfirmacion = DateTime.now().toISO();
    fs.writeFileSync(rutaPendienteActual, JSON.stringify(pendiente, null, 2));

    pendientes = pendientes.filter(p => p.referencia !== pendiente.referencia && p.numero !== pendiente.numero);
    fs.writeFileSync(rutaPendientes, JSON.stringify(pendientes, null, 2));

    if (pendiente.imagen && fs.existsSync(pendiente.imagen)) {
      fs.unlinkSync(pendiente.imagen);
    }

    if (pendiente.esNuevo) {
      const refCliente = pendiente.referencia?.startsWith("AUTO-") ? "" : `Ref: *${pendiente.referencia}*. `;
      await client.sendMessage(pendiente.numero + "@c.us", `✅ Tu pago ha sido confirmado. ${refCliente}¡Gracias por tu compra! 🎉`);
      await client.sendMessage(adminPhone, `📝 Este es un cliente *nuevo*. Por favor responde con los datos de la nueva cuenta para registrar la venta:\n\n📌 *Escribe en este formato:*\nDISNEY\nusuario: juan123\nclave: abc456`);
    } else {
      const hoy = DateTime.now().setZone("America/Bogota");
      const fechaInicio = hoy.toFormat("dd/LL/yyyy");
      const fechaFinal = hoy.plus({ days: 30 }).toFormat("dd/LL/yyyy");

      const referencia = pendiente.referencia?.startsWith("AUTO-") ? "" : pendiente.referencia;

      const filaActualizada = {
        numero: pendiente.numero,
        cuenta: pendiente.cuenta,
        fechaInicio,
        fechaFinal,
        respuesta: "✅ Renovación",
        fechaRespuesta: fechaInicio,
        referencia
      };

      await actualizarFilaExistenteEnGoogleSheets(filaActualizada);

      const mensaje = `🎉 *Gracias por continuar con nosotros.* Tu renovación fue exitosa.\nSi deseas adquirir un nuevo servicio, aquí está nuestro catálogo actualizado:`;
      await client.sendMessage(pendiente.numero + "@c.us", mensaje);
      await client.sendMessage(pendiente.numero + "@c.us", obtenerCatalogoTexto());
      await client.sendMessage(adminPhone, `🔄 Renovación registrada automáticamente para *${pendiente.nombre}* - *${pendiente.cuenta}*.`);
    }

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
      referencia: pendiente.referencia?.startsWith("AUTO-") ? "" : pendiente.referencia
    };

    await agregarNuevaFilaEnGoogleSheets(fila);

    const mensajeCliente = `✅ Tu cuenta ha sido activada:\n\n📺 *${cuenta}*\n👤 Usuario: *${usuarioCuenta}*\n🔐 Clave: *${claveCuenta}*\n\n⚠ *TÉRMINOS Y CONDICIONES*\n📌 USAR LAS PANTALLAS CONTRATADAS\n📌 NO COMPARTIR LA CUENTA\n\n📝 Incumplir estos términos puede generar la pérdida de garantía.\n\nGracias por elegir *Roussillon Technology*. ¡Estamos comprometidos con ofrecerte el mejor servicio!*`;

    await client.sendMessage(pendiente.numero + "@c.us", mensajeCliente);
    await client.sendMessage(adminPhone, `✅ Cuenta *${cuenta}* registrada y enviada al cliente *${pendiente.nombre}*.`);

    fs.unlinkSync(rutaPendienteActual);
  }
};