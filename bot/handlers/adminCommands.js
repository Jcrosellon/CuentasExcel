// /handlers/adminCommands.js

const fs = require("fs");
const { DateTime } = require("luxon");
const { leerClientesGoogle, actualizarFilaExistenteEnGoogleSheets, agregarNuevaFilaEnGoogleSheets, moverFilaOrdenadaPorFechaFinal } = require("../utils/utilsGoogle");
const { validarComprobante } = require("../utils/ocrValidator");
const { generarResumenEstado, obtenerEstadoDeCuentas } = require("../utils/estadoCuentas");
const { obtenerCatalogoTexto } = require("../utils/catalogoUtils");
const { limpiarTexto } = require("../utils/helpers");
const pm2 = require("pm2");
const paths = require("../config/paths");
const rutaPendientes = paths.pendientes;
const rutaPendienteNuevo = paths.pendienteNuevo;
const rutaPendienteActual = paths.pendienteActual;

function cargarJsonSeguro(ruta, tipo = "array") {
  if (!fs.existsSync(ruta)) return tipo === "array" ? [] : {};
  try {
    const contenido = fs.readFileSync(ruta, "utf8");
    if (!contenido.trim()) return tipo === "array" ? [] : {};
    return JSON.parse(contenido);
  } catch (err) {
    console.error(`❌ Error leyendo archivo ${ruta}:`, err.message);
    return tipo === "array" ? [] : {};
  }
}

async function buscarFechaFinalAnterior(numero, cuenta) {
  const clientes = await leerClientesGoogle();
  const cliente = clientes.find(c => 
    (c["NUMERO WHATSAPP"] || "").replace(/\D/g, "") === (numero || "").replace(/\D/g, "") &&
    (c["CUENTA"] || "").toLowerCase() === (cuenta || "").toLowerCase()
  );

  if (cliente && cliente["FECHA FINAL"]) {
    const [d, m, y] = cliente["FECHA FINAL"].split("/");
    const fechaFinalAnterior = DateTime.fromFormat(`${d}/${m}/${y}`, "dd/LL/yyyy", { zone: "America/Bogota" });
    if (fechaFinalAnterior.isValid) {
      return fechaFinalAnterior;
    }
  }
  return null; // Si no encuentra fecha
}



module.exports = async function manejarComandosAdmin(msg, client, adminPhone) {
  const texto = msg.body.trim();
  const textoLimpio = texto.toLowerCase();

  if (textoLimpio === "limpiar pendientes") {
    fs.writeFileSync(rutaPendientes, JSON.stringify([], null, 2));
    fs.writeFileSync(rutaPendienteNuevo, JSON.stringify([], null, 2));
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

  if (textoLimpio === "estado bot") {
    const os = require("os");
    const uptime = process.uptime();
    const minutos = Math.floor(uptime / 60);
    const memoria = process.memoryUsage().rss / 1024 / 1024;
    const cpu = os.cpus()[0].model;
  
    await client.sendMessage(adminPhone, `📈 *Estado del bot:*\n\n🕒 Uptime: ${minutos} min\n🧠 RAM: ${memoria.toFixed(1)} MB\n💻 CPU: ${cpu}`);
    return;
  }

  if (textoLimpio === "reiniciar bot") {
    await client.sendMessage(adminPhone, "♻️ Reiniciando el bot...");
    pm2.connect(function (err) {
      if (err) {
        console.error(err);
        return;
      }
  
      pm2.restart("bot-wa", function (err) {
        pm2.disconnect(); // Desconecta de PM2
        if (err) {
          console.error("Error al reiniciar:", err);
          client.sendMessage(adminPhone, "❌ Error al intentar reiniciar el bot.");
        }
      });
    });
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

  const matchComando = texto.trim().match(/^(✅|❌|confirmado|rechazado)\s*(confirmado|rechazado)?\s*(.+)$/i);


if (matchComando) {
  const accion = matchComando[1].toLowerCase();
  const referenciaBuscada = limpiarTexto(matchComando[3]);

  let pendientesRenovacion = cargarJsonSeguro(rutaPendientes);
  let pendientesCompra = cargarJsonSeguro(rutaPendienteNuevo);

  // NORMALIZAMOS la referencia buscada
const referenciaNormalizada = referenciaBuscada.trim().toLowerCase();

// Buscar en pendientes de renovación primero
let pendiente = pendientesRenovacion.find(p => 
  (p.referencia || "").trim().toLowerCase() === referenciaNormalizada
);

let tipo = "renovacion";

if (!pendiente) {
  pendiente = pendientesCompra.find(p => 
    (p.referencia || "").trim().toLowerCase() === referenciaNormalizada
  );
  tipo = pendiente ? "nueva" : null;
}



  if (!pendiente) {
    await msg.reply(`⚠️ No se encontró un comprobante pendiente con la referencia *${referenciaBuscada}*.`);
    return;
  }

  if (["confirmado", "✅"].includes(accion)) {
    pendiente.confirmado = true;
    pendiente.fechaConfirmacion = DateTime.now().toISO();

    if (tipo === "renovacion") {
      fs.writeFileSync(rutaPendienteActual, JSON.stringify(pendiente, null, 2));
      pendientesRenovacion = pendientesRenovacion.filter(p => limpiarTexto(p.referencia) !== referenciaBuscada);
      fs.writeFileSync(rutaPendientes, JSON.stringify(pendientesRenovacion, null, 2));
    } else {
      fs.writeFileSync(rutaPendienteActual, JSON.stringify(pendiente, null, 2));
      pendientesCompra = pendientesCompra.filter(p => limpiarTexto(p.referencia) !== referenciaBuscada);
      fs.writeFileSync(rutaPendienteNuevo, JSON.stringify(pendientesCompra, null, 2));
    }

    if (pendiente.imagen && fs.existsSync(pendiente.imagen)) {
      fs.unlinkSync(pendiente.imagen);
    }

    await client.sendMessage(pendiente.numero + "@c.us", `✅ Tu pago con referencia *${pendiente.referencia}* ha sido confirmado. ¡Gracias por tu ${tipo === "nueva" ? "compra" : "renovación"}! 🎉`);
    await msg.reply("✅ Confirmación registrada y cliente notificado.");

    // Si es renovación, actualiza el documento
    if (tipo === "renovacion") {
      let fechaInicio, fechaFinal;

const fechaFinalAnterior = await buscarFechaFinalAnterior(pendiente.numero, pendiente.cuenta);

if (fechaFinalAnterior) {
  fechaInicio = fechaFinalAnterior;
  fechaFinal = fechaFinalAnterior.plus({ months: 1 });
} else {
  const hoy = DateTime.now().setZone("America/Bogota");
  fechaInicio = hoy;
  fechaFinal = hoy.plus({ months: 1 });
}


      const filaActualizada = {
        numero: pendiente.numero,
        cuenta: pendiente.cuenta,
        fechaInicio: fechaInicio.toFormat("dd/LL/yyyy"),
        fechaFinal: fechaFinal.toFormat("dd/LL/yyyy"),
        respuesta: "✅ Renovación",
        fechaRespuesta: DateTime.now().setZone("America/Bogota").toFormat("dd/LL/yyyy"),
        referencia: pendiente.referencia
      };

      await actualizarFilaExistenteEnGoogleSheets(filaActualizada);
      await moverFilaOrdenadaPorFechaFinal(filaActualizada);

      await client.sendMessage(pendiente.numero + "@c.us", "🎉 *Gracias por continuar con nosotros.* Tu renovación fue exitosa.\nSi deseas adquirir un nuevo servicio, aquí está nuestro catálogo actualizado:");
      await client.sendMessage(pendiente.numero + "@c.us", obtenerCatalogoTexto());
      await client.sendMessage(adminPhone, `🔄 Renovación registrada automáticamente para *${pendiente.nombre}* - *${pendiente.cuenta}*.`);
      fs.unlinkSync(rutaPendienteActual);
    }

    // Si es nueva, esperamos a que el admin mande los datos de cuenta
    if (tipo === "nueva") {
      await client.sendMessage(adminPhone, `📝 Este es un cliente *nuevo*. Por favor responde con los datos de la nueva cuenta para registrar la venta:\n\n📌 *Escribe en este formato:*\nDISNEY\nusuario: juan123\nclave: abc456`);
    }

  } else if (["rechazado", "❌"].includes(accion)) {
    pendiente.rechazado = true;
    pendiente.fechaRechazo = DateTime.now().toISO();
    
    if (tipo === "renovacion") {
      fs.writeFileSync(rutaPendientes, JSON.stringify(pendientesRenovacion, null, 2));
    } else {
      fs.writeFileSync(rutaPendienteNuevo, JSON.stringify(pendientesCompra, null, 2));
    }

    if (pendiente.imagen && fs.existsSync(pendiente.imagen)) {
      fs.unlinkSync(pendiente.imagen);
    }

    await client.sendMessage(pendiente.numero + "@c.us", `❌ Tu comprobante con referencia *${pendiente.referencia}* fue rechazado. Por favor revisa que sea un comprobante válido y vuelve a enviarlo.`);
    await msg.reply("❌ Rechazo registrado y cliente notificado.");
  }
  return;
}


  if (["confirmado", "✅"].includes(textoLimpio)) {
    const pendiente = cargarJsonSeguro(rutaPendienteActual, "objeto");
    if (!pendiente || Array.isArray(pendiente)) return;
    pendiente.confirmado = true;
    pendiente.fechaConfirmacion = DateTime.now().toISO();
    fs.writeFileSync(rutaPendienteActual, JSON.stringify(pendiente, null, 2));

    if (pendiente.imagen && fs.existsSync(pendiente.imagen)) {
      fs.unlinkSync(pendiente.imagen);
    }

    if (pendiente.esNuevo) {
      const refCliente = pendiente.referencia?.startsWith("AUTO-") ? "" : `Ref: *${pendiente.referencia}*. `;
      await client.sendMessage(pendiente.numero + "@c.us", `✅ Tu pago ha sido confirmado. ${refCliente}¡Gracias por tu compra! 🎉`);
      await client.sendMessage(adminPhone, `📝 Este es un cliente *nuevo*. Por favor responde con los datos de la nueva cuenta para registrar la venta:\n\n📌 *Escribe en este formato:*\nDISNEY\nusuario: juan123\nclave: abc456`);
    } else {
      let fechaInicio, fechaFinal;

      const fechaFinalAnterior = await buscarFechaFinalAnterior(pendiente.numero, pendiente.cuenta);
      
      if (fechaFinalAnterior) {
        fechaInicio = fechaFinalAnterior;
        fechaFinal = fechaFinalAnterior.plus({ months: 1 });
      } else {
        const hoy = DateTime.now().setZone("America/Bogota");
        fechaInicio = hoy;
        fechaFinal = hoy.plus({ months: 1 });
      }
      


const fechaInicioStr = fechaInicio.toFormat("dd/LL/yyyy");
const fechaFinalStr = fechaFinal.toFormat("dd/LL/yyyy");


      const referencia = pendiente.referencia?.startsWith("AUTO-") ? "" : pendiente.referencia;

      const filaActualizada = {
        numero: pendiente.numero,
        cuenta: pendiente.cuenta,
        fechaInicio: fechaInicioStr,
        fechaFinal: fechaFinalStr,
        respuesta: "✅ Renovación",
        fechaRespuesta: DateTime.now().setZone("America/Bogota").toFormat("dd/LL/yyyy"),
        referencia
      };
      
      
      

      await actualizarFilaExistenteEnGoogleSheets(filaActualizada);
await moverFilaOrdenadaPorFechaFinal(filaActualizada); // ← Esta es la nueva línea


      const mensaje = `🎉 *Gracias por continuar con nosotros.* Tu renovación fue exitosa.\nSi deseas adquirir un nuevo servicio, aquí está nuestro catálogo actualizado:`;
      await client.sendMessage(pendiente.numero + "@c.us", mensaje);
      await client.sendMessage(pendiente.numero + "@c.us", obtenerCatalogoTexto());
      await client.sendMessage(adminPhone, `🔄 Renovación registrada automáticamente para *${pendiente.nombre}* - *${pendiente.cuenta}*.`);
    }

    return;
  }

  if (fs.existsSync(rutaPendienteActual)) {
    const pendiente = cargarJsonSeguro(rutaPendienteActual);
if (!pendiente || Array.isArray(pendiente)) return; // protección por si devuelve []

    const patron = /^(.+?)\s*\n\s*usuario[:\s]+(.+)\s*\n\s*clave[:\s]+(.+)/i;
    const match = msg.body.trim().match(patron);

    if (!match) {
      await client.sendMessage(adminPhone, `❌ Formato no reconocido. Asegúrate de escribir:\n\nDISNEY\nusuario: juan123\nclave: abc456`);
      return;
    }

    const cuenta = match[1].trim().toUpperCase();
    const usuarioCuenta = match[2].trim();
    const claveCuenta = match[3].trim();

    const fechaFinalAnteriorStr = pendiente.fechaFinal || null;

let fechaInicio, fechaFinal;

if (pendiente.fechaFinal) {
  const [d, m, y] = pendiente.fechaFinal.split("/");
  const fechaFinalAnterior = DateTime.fromFormat(`${d}/${m}/${y}`, "dd/LL/yyyy", { zone: "America/Bogota" });
  fechaInicio = fechaFinalAnterior;
  fechaFinal = fechaFinalAnterior.plus({ months: 1 });
} else {
  const hoy = DateTime.now().setZone("America/Bogota");
  fechaInicio = hoy;
  fechaFinal = hoy.plus({ months: 1 });
}


const fechaInicioStr = fechaInicio.toFormat("dd/LL/yyyy");
const fechaFinalStr = fechaFinal.toFormat("dd/LL/yyyy");


    

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