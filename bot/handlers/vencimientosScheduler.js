// /bot/handlers/vencimientosScheduler.js
const cron = require("node-cron");
const { DateTime } = require("luxon");
const { leerClientesGoogle  } = require("../utils/utilsGoogle")
const { formatearPesosColombianos, esNumeroValido } = require("../utils/helpers");
const fs = require("fs");

const rutaMensajesEnviados = "./mensajesEnviados.json";

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
    });
  }
  return mapa;
}

function enviarMensajeVencimiento(client) {
  return async (numero, nombre, cuentas, cuando) => {
    let mensaje = `🌙 Buenas tardes ${nombre}, RoussillonTechnology te recuerda que ${cuando} se vencen los siguientes servicios:\n\n`;
    let total = 0;
    for (const cuenta of cuentas) {
      mensaje += `🔸 ${cuenta.cuenta} ( ${cuenta.dispositivo} ): $${formatearPesosColombianos(cuenta.valor)}\n`;
      total += parseInt(cuenta.valor);
    }
    mensaje += `\n💰 Total a pagar: $${formatearPesosColombianos(total)}\n\n¿Deseas continuar? ✨\nResponde con *SI*✅ o *NO*❌`;

    if (esNumeroValido(numero)) {
      await client.sendMessage(numero + "@c.us", mensaje);

      let historial = {};
      if (fs.existsSync(rutaMensajesEnviados)) {
        try {
          const contenido = fs.readFileSync(rutaMensajesEnviados, "utf8");
          historial = contenido ? JSON.parse(contenido) : {};
        } catch (err) {
          console.error("⚠️ Error leyendo mensajesEnviados.json:", err.message);
          historial = {};
        }
      }

      historial[numero] = mensaje;
      fs.writeFileSync(rutaMensajesEnviados, JSON.stringify(historial, null, 2));
    }
  };
}

function enviarMensajeMora(client) {
  return async (numero, nombre, cuenta) => {
    console.log(`📤 Enviando mensaje a ${numero} con 1 cuenta en mora`);

    const mensaje = `📢 Hola ${nombre}, RoussillonTechnology te recuerda que tus servicios:\n\n` +
      `😱 ¡TIENEN ${cuenta.dias} DÍA${cuenta.dias > 1 ? "S" : ""} EN MORA!\n\n` +
      `🔸 ${cuenta.cuenta} ( ${cuenta.dispositivo} ): $${formatearPesosColombianos(cuenta.valor)}\n\n` +
      `💰 Total a pagar: $${formatearPesosColombianos(cuenta.valor)}\n\n` +
      `¿Si deseas continuar? ✨\nResponde con *SI*✅ o *NO*❌`;

    if (esNumeroValido(numero)) {
      await client.sendMessage(numero + "@c.us", mensaje);

      let historial = {};
      if (fs.existsSync(rutaMensajesEnviados)) {
        try {
          const contenido = fs.readFileSync(rutaMensajesEnviados, "utf8");
          historial = contenido ? JSON.parse(contenido) : {};
        } catch (err) {
          console.error("⚠️ Error leyendo mensajesEnviados.json:", err.message);
          historial = {};
        }
      }

      historial[numero] = mensaje;
      fs.writeFileSync(rutaMensajesEnviados, JSON.stringify(historial, null, 2));
    }
  };
}


function enviarVencimientosProgramados(client) {
  console.log("🔍 Ejecutando función enviarVencimientosProgramados...");

  const enviarVencimiento = enviarMensajeVencimiento(client);
  const enviarMora = enviarMensajeMora(client);

  cron.schedule("0 10 * * *", async () => {
    try {
      const hoy = DateTime.now().setZone("America/Bogota").startOf("day");
      const clientes = await leerClientesGoogle();
      console.log(`📄 Se leyeron ${clientes.length} clientes desde Google Sheets`);

      const agrupados = agruparClientesPorNumero(clientes);

      const numeroDePrueba = "573114207673"; // ← aquí pones tu número sin @c.us

for (const numero in agrupados) {
  if (numero !== numeroDePrueba) continue; // ⛔️ Salta los demás
  console.log("👤 Procesando cliente de prueba:", numero);

  const cliente = agrupados[numero];
        const cuentas = cliente.cuentas;
        let vencenManana = [];
        let vencenHoy = [];
        let enMora = [];

        for (const cuenta of cuentas) {
          let fechaFinal;
          const rawFecha = cuenta.fechaFinal;

          if (typeof rawFecha === "string") {
            const partes = rawFecha.split("/");
            const dia = partes[0].padStart(2, "0");
            const mes = partes[1].padStart(2, "0");
            const anio = partes[2];
            const fechaStr = `${dia}/${mes}/${anio}`;
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

console.log(`📅 Cliente: ${cliente.nombre} - Fecha Final: ${finalDia.toFormat("dd/MM/yyyy")} - Hoy: ${hoy.toFormat("dd/MM/yyyy")} - Diff: ${diferencia}`);

if (diferencia === 1) vencenManana.push(cuenta);
else if (diferencia === 0) vencenHoy.push(cuenta);
else if (diferencia < 0) enMora.push({ ...cuenta, dias: Math.abs(diferencia) });
        }

        if (vencenManana.length > 0) await enviarVencimiento(numero, cliente.nombre, vencenManana, "MAÑANA");
        if (vencenHoy.length > 0) await enviarVencimiento(numero, cliente.nombre, vencenHoy, "HOY");
        for (const mora of enMora) await enviarMora(numero, cliente.nombre, mora);
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
    for (const mora of enMora) await enviarMora(numero, cliente.nombre, mora);
  }
}


module.exports = {
  enviarVencimientosProgramados,
  procesarVencimientos
};
