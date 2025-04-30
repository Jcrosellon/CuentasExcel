// /bot/handlers/vencimientosScheduler.js
const cron = require("node-cron");
const { DateTime } = require("luxon");
const { leerClientesGoogle } = require("../utils/utilsGoogle")
const { formatearPesosColombianos, esNumeroValido } = require("../utils/helpers");
const fs = require("fs");
const paths = require("../config/paths");
const rutaMensajesEnviados = paths.mensajesEnviados;
const rutaPendientes = paths.pendientes;

function agruparClientesPorNumero(clientes) {
  const mapa = {};
  for (const c of clientes) {
    const numero = c["NUMERO WHATSAPP"]?.toString().split(".")[0] || "";
    const clave = numero;
    if (!mapa[clave]) {
      mapa[clave] = {
        nombre: c["NOMBRE"] || "",
        numero: clave,
        cuentas: [],
      };
    }
    mapa[clave].cuentas.push({
      cuenta: c["CUENTA"] || "",
      dispositivo: c["DISPOSITIVO"] || "",
      valor: c["VALOR"] || "0",
fechaFinal: c["FECHA FINAL"] || "",
respuesta: c["RESPUESTA"] || ""

    });
  }
  return mapa;
}

function guardarPendiente(numero, nombre, cuenta) {
  let pendientes = [];
if (fs.existsSync(rutaPendientes)) {
  try {
    const contenido = fs.readFileSync(rutaPendientes, "utf8");
    pendientes = contenido.trim() ? JSON.parse(contenido) : [];
  } catch (err) {
    console.error("⚠️ Error leyendo paths.pendientes:", err.message);
    pendientes = [];
  }
}


  const yaExiste = pendientes.some(p => p.numero === numero && p.cuenta === cuenta.cuenta && !p.confirmado);
  if (!yaExiste) {
    pendientes.push({
      numero,
      nombre,
      cuenta: cuenta.cuenta,
      usuario: "",
      valor: cuenta.valor,
      referencia: `AUTO-${Date.now()}`,
      fecha: DateTime.now().toISO(),
      imagen: "",
      confirmado: false,
      esNuevo: false
    });
    fs.writeFileSync(rutaPendientes, JSON.stringify(pendientes, null, 2));
  }
}

function enviarMensajeVencimiento(client) {
  return async (numero, nombre, cuentas, cuando) => {
    let mensaje = `🌙 Buenas tardes ${nombre}, RoussillonTechnology te recuerda que ${cuando} se vencen los siguientes servicios:\n\n`;
    let total = 0;
    for (const cuenta of cuentas) {
      mensaje += `🔸 ${cuenta.cuenta} ( ${cuenta.dispositivo} ): $${formatearPesosColombianos(cuenta.valor)}\n`;
      total += parseInt(cuenta.valor);
      guardarPendiente(numero, nombre, cuenta);
    }
    mensaje += `\n💰 Total a pagar: $${formatearPesosColombianos(total)}\n\n¿Deseas continuar? ✨\nResponde con *SI*✅ o *NO*❌`;

    if (esNumeroValido(numero)) {
      const chatId = numero + "@c.us";
      try {
        const isValid = await client.isRegisteredUser(chatId);
        if (!isValid) {
          console.warn(`⚠️ ${chatId} no es un usuario de WhatsApp válido. Se omitirá.`);
          return;
        }
        await client.sendMessage(chatId, mensaje);
      } catch (err) {
        console.error("❌ Error al intentar enviar el mensaje a", chatId, ":", err.message);
      }
    

      let historial = {};
      if (fs.existsSync(rutaMensajesEnviados)) {
        try {
          const contenido = fs.readFileSync(rutaMensajesEnviados, "utf8");
          historial = contenido ? JSON.parse(contenido) : {};
        } catch (err) {
          console.error("⚠️ Error leyendo paths.mensajesEnviados:", err.message);
          historial = {};
        }
      }

      historial[numero] = mensaje;
      fs.writeFileSync(rutaMensajesEnviados, JSON.stringify(historial, null, 2));
    }
  };
}

function enviarMensajeMora(client) {
  return async (numero, nombre, cuentas) => {
    console.log(`📤 Enviando mensaje a ${numero} con ${cuentas.length} cuenta(s) en mora`);

    const diasMaximos = Math.max(...cuentas.map(c => c.dias || 0));
    const textoDias = diasMaximos > 0 ? ` (${diasMaximos} DÍA${diasMaximos > 1 ? 'S' : ''})` : "";

    let mensaje = `📢 Hola ${nombre}, RoussillonTechnology te recuerda que tus servicios:\n\n` +
      `😱 ¡TIENEN${textoDias} EN MORA!\n\n`;

    let total = 0;

    for (const cuenta of cuentas) {
      mensaje += `🔸 ${cuenta.cuenta} ( ${cuenta.dispositivo} ): $${formatearPesosColombianos(cuenta.valor)}\n`;
      total += parseInt(cuenta.valor);
      guardarPendiente(numero, nombre, cuenta);
    }

    mensaje += `\n💰 Total a pagar: $${formatearPesosColombianos(total)}\n\n`;
    mensaje += `¿Si deseas continuar? ✨\nResponde con *SI*✅ o *NO*❌`;

    if (esNumeroValido(numero)) {
      await client.sendMessage(numero + "@c.us", mensaje);

      let historial = {};
      if (fs.existsSync(rutaMensajesEnviados)) {
        try {
          const contenido = fs.readFileSync(rutaMensajesEnviados, "utf8");
          historial = contenido ? JSON.parse(contenido) : {};
        } catch (err) {
          const paths = require("../config/paths"); // o la ruta correcta
console.error(`⚠️ Error leyendo ${paths.mensajesEnviados}:`, err.message);
          historial = {};
        }
      }

      historial[numero] = mensaje;
      fs.writeFileSync(rutaMensajesEnviados, JSON.stringify(historial, null, 2));
    }
  };
}


function enviarVencimientosProgramados(client, numeroDePrueba = null) {
  console.log("🔍 Ejecutando función enviarVencimientosProgramados...");

  const enviarVencimiento = enviarMensajeVencimiento(client);
  const enviarMora = enviarMensajeMora(client);

  cron.schedule("0 18 * * *", async () => {
    try {
      await client.sendMessage("573183192913@c.us", "📅 Iniciando envío automático de vencimientos programados (18:00). Este es un mensaje de prueba de seguimiento programado. A continuación, los vencimientos reales:");

      const hoy = DateTime.now().setZone("America/Bogota").startOf("day");
      const clientes = await leerClientesGoogle();
      console.log(`📄 Se leyeron ${clientes.length} clientes desde Google Sheets`);

      const agrupados = agruparClientesPorNumero(clientes);

      for (const numero in agrupados) {
        if (numeroDePrueba && numero !== numeroDePrueba) continue;

        console.log("👤 Procesando cliente:", numero);

        const cliente = agrupados[numero];

        // 🚫 Si algún servicio tiene RESPUESTA = "NO", omitir este número
        const yaDijoNo = cliente.cuentas.some(c =>
          (c.respuesta || "").trim().toLowerCase() === "no"
        );
        
        if (yaDijoNo) {
          console.log(`🚫 ${numero} ya respondió NO, se omite.`);
          continue;
        }
        

        const cuentas = cliente.cuentas;
        let vencenManana = [];
        let vencenHoy = [];
        let enMora = [];

        for (const cuenta of cuentas) {
          let fechaFinal;
          const rawFecha = cuenta.fechaFinal;

          if (typeof rawFecha === "string") {
            const [dia, mes, anio] = rawFecha.split("/");
            const fechaStr = `${dia.padStart(2, "0")}/${mes.padStart(2, "0")}/${anio}`;
            fechaFinal = DateTime.fromFormat(fechaStr, "dd/MM/yyyy", { zone: "America/Bogota" });
          } else if (typeof rawFecha === "number") {
            fechaFinal = DateTime.fromJSDate(new Date(Math.round((rawFecha - 25569 + 1) * 86400 * 1000))).setZone("America/Bogota").startOf("day");
          } else if (rawFecha instanceof Date) {
            fechaFinal = DateTime.fromJSDate(rawFecha).setZone("America/Bogota");
          } else {
            fechaFinal = null;
          }

          if (!fechaFinal || !fechaFinal.isValid) continue;

          const finalDia = fechaFinal.startOf("day");
          const diferencia = Math.floor(finalDia.diff(hoy, "days").days);

          if (diferencia === 1) vencenManana.push(cuenta);
          else if (diferencia === 0) vencenHoy.push(cuenta);
          else if (diferencia < 0) enMora.push({ ...cuenta, dias: Math.abs(diferencia) });
        }

        if (vencenManana.length > 0) await enviarVencimiento(numero, cliente.nombre, vencenManana, "MAÑANA");
        if (vencenHoy.length > 0) await enviarVencimiento(numero, cliente.nombre, vencenHoy, "HOY");
        if (enMora.length > 0) await enviarMora(numero, cliente.nombre, enMora);

        console.log("🗓️ Vencimientos HOY:", vencenHoy.length);
        console.log("🗓️ Vencimientos MAÑANA:", vencenManana.length);
        console.log("💀 En MORA:", enMora.length);
      }

    } catch (err) {
      console.error("❌ Error en ejecución del cron diario:", err);
    }
  });
}

async function procesarVencimientos(client, numeroDePrueba = null) {
  console.log("🔍 Ejecutando procesamiento de vencimientos...");

  const hoy = DateTime.now().setZone("America/Bogota").startOf("day");
  
  const clientes = await leerClientesGoogle();
  console.log(`📄 Se leyeron ${clientes.length} clientes desde Google Sheets`);

  const agrupados = agruparClientesPorNumero(clientes);

  const enviarVencimiento = enviarMensajeVencimiento(client);
  const enviarMora = enviarMensajeMora(client);

  for (const numero in agrupados) {
    if (numeroDePrueba && numero !== numeroDePrueba) continue;
    console.log("👤 Procesando cliente:", numero);

    const cliente = agrupados[numero];
    const cuentas = cliente.cuentas;

    let vencenManana = [];
    let vencenHoy = [];
    let enMora = [];

    for (const cuenta of cuentas) {
      let fechaFinal;
      const rawFecha = cuenta.fechaFinal;

      if (typeof rawFecha === "string") {
        const [d, m, y] = rawFecha.split("/");
        fechaFinal = DateTime.fromFormat(`${d.padStart(2, "0")}/${m.padStart(2, "0")}/${y}`, "dd/MM/yyyy", { zone: "America/Bogota" });
      } else if (typeof rawFecha === "number") {
        fechaFinal = DateTime.fromJSDate(new Date(Math.round((rawFecha - 25569 + 1) * 86400 * 1000))).setZone("America/Bogota").startOf("day");
      } else if (rawFecha instanceof Date) {
        fechaFinal = DateTime.fromJSDate(rawFecha).setZone("America/Bogota");
      } else {
        fechaFinal = null;
      }

      if (!fechaFinal || !fechaFinal.isValid) continue;

      const diff = fechaFinal.startOf("day").diff(hoy, "days").days;

      if (diff === 1) vencenManana.push(cuenta);
      else if (diff === 0) vencenHoy.push(cuenta);
      else if (diff < 0) enMora.push({ ...cuenta, dias: Math.abs(Math.round(diff)) });
    }

    console.log("🗓️ Vencimientos HOY:", vencenHoy.length);
    console.log("🗓️ Vencimientos MAÑANA:", vencenManana.length);
    console.log("💀 En MORA:", enMora.length);

    if (vencenManana.length > 0) await enviarVencimiento(numero, cliente.nombre, vencenManana, "MAÑANA");
    if (vencenHoy.length > 0) await enviarVencimiento(numero, cliente.nombre, vencenHoy, "HOY");
    if (enMora.length > 0) await enviarMora(numero, cliente.nombre, enMora);
  }
}

module.exports = {
  enviarVencimientosProgramados,
  procesarVencimientos
};
