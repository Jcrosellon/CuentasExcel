// index.js
const qrcode = require("qrcode-terminal");
const { Client, LocalAuth } = require("whatsapp-web.js");
const { DateTime } = require("luxon");
const fs = require("fs");
const { writeFile } = require("fs/promises");
const ExcelJS = require("exceljs");

const config = require("./config.json");
const { leerClientes } = require("./utils");
const { validarComprobante } = require("./ocrValidator");
const { actualizarRespuestaEnExcel } = require("./guardarRespuestas");
const cron = require("node-cron");

const path = "./respuestas.json";
const perfilMaximos = {
  "NETFLIX": 5,
  "TELE LATINO": 6,
  "DISNEY": 7,
  "AMAZON PRIME": 6,
  "MAX PLATINO": 5,
  "IPTV": 3,
};

const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: { headless: true },
});

client.on("qr", (qr) => {
  qrcode.generate(qr, { small: true });
  console.log("\ud83d\udcf2 Escanea el c\u00f3digo QR con tu WhatsApp");
});

client.on("ready", async () => {
  console.log("✅ Bot listo. Enviando mensajes agrupados...");
  try {
    const clientes = leerClientes();
    const agrupados = agruparClientesPorNumero(clientes);

    for (const numero in agrupados) {
      const cliente = agrupados[numero];
      const numeroWhatsApp = numero + "@c.us";
      let mensaje = `🌙 Buenas noches ${cliente.nombre}, para recordarte que MAÑANA se vencen los siguientes servicios:\n\n`;
      let total = 0;
      for (const cuenta of cliente.cuentas) {
        mensaje += `🔸 ${cuenta.cuenta} (${cuenta.dispositivo}): $${cuenta.valor}\n`;
        total += parseInt(cuenta.valor);
      }
      mensaje += `\n💰 *Total a pagar: $${total}*\n\n¿Deseas continuar? ✨\nResponde con *SI*✅ o *NO*❌`;

      console.log(`> Enviando mensaje a ${cliente.nombre} (${numeroWhatsApp})`);
      await client.sendMessage(numeroWhatsApp, mensaje);
    }
  } catch (err) {
    console.error("❌ Error durante envío agrupado:", err);
  }
});


client.on("message", async (msg) => {
  if (msg.fromMe) return;
  const texto = msg.body.trim().toLowerCase();
  const numero = msg.from.replace("@c.us", "");
  const fechaActual = DateTime.now().setZone("America/Bogota").toISODate();

  if (texto === "estado") {
    const clientes = leerClientes();
    const resumen = obtenerEstadoDeCuentas(clientes);
    const mensaje = generarResumenEstado(resumen);
    await msg.reply(mensaje);

    const contenidoArchivo = resumen.map(r => `${r.cuenta} | ${r.usuario} | Usados: ${r.usados} / ${r.maximos} | Disponibles: ${r.disponibles}`).join("\n");
    fs.writeFileSync("estado.txt", contenidoArchivo);
    console.log("✅ Archivo estado.txt generado.");
    return;
  }

  const clientes = leerClientes();
  const cuentasUsuario = clientes.filter(c => (c["NUMERO WHATSAPP"]?.toString() || "").includes(numero));
  if (cuentasUsuario.length === 0) return;

  if (msg.hasMedia) {
    msg.reply("📸 Recibimos tu comprobante. Validando...");
    const media = await msg.downloadMedia();
    const buffer = Buffer.from(media.data, "base64");
    const tempPath = `./temp-${numero}.jpg`;
    await writeFile(tempPath, buffer);

    let valorEsperado = cuentasUsuario.reduce((acc, c) => acc + parseInt((c["VALOR"] || "0").toString().replace(/\./g, "")), 0);
    valorEsperado = valorEsperado.toString();

    const resultado = await validarComprobante(tempPath, valorEsperado);
    if (!resultado.valido) {
      msg.reply("⚠️ No pudimos validar tu comprobante. Asegúrate de que se vea el valor, la fecha y el número de destino (3183192913).");
      return;
    }

    const nuevaReferencia = (resultado.referenciaDetectada || "").trim();
    let algunaActualizada = false;

    for (const cliente of cuentasUsuario) {
      const cambio = await actualizarComprobanteFila(cliente["NUMERO WHATSAPP"], nuevaReferencia);
      if (cambio) {
        await actualizarRespuestaEnExcel(cliente["NUMERO WHATSAPP"], "SI", fechaActual, nuevaReferencia);
        algunaActualizada = true;
      }
    }

    if (!algunaActualizada) {
      msg.reply(`❌ Este comprobante ya está registrado (Ref: ${nuevaReferencia}).\nPago rechazado.`);
      return;
    }

    msg.reply(`✅ Comprobante verificado. Referencia: ${nuevaReferencia}\n¡Gracias por tu pago! 🙌`);
    return;
  }

  if (["si", "sí", "✅ si"].includes(texto)) {
    msg.reply("👍 ¡Perfecto! Para continuar, realiza el pago a *Nequi o Daviplata: 3183192913* y adjunta el pantallazo por aquí. Yo me encargaré de validarlo. 🧐📲");
    for (const cliente of cuentasUsuario) {
      await guardarRespuesta(numero, cliente, "SI", fechaActual);
    }
  } else if (["no", "❌ no"].includes(texto)) {
    const catalogo = fs.readFileSync("./catalogo.txt", "utf8");
    const mensaje = `☹️ Siento que hayas tenido algún inconveniente. Si decides regresar, estaré aquí para ayudarte. 🌟\n\nMientras tanto, te comparto nuestro catálogo de precios actualizados:\n\n${catalogo}`;
    msg.reply(mensaje);
    for (const cliente of cuentasUsuario) {
      await guardarRespuesta(numero, cliente, "NO", fechaActual);
    }
  }
});

function sumarMesClampeando(dtOriginal) {
  let newMonth = dtOriginal.month + 1;
  let newYear = dtOriginal.year;
  if (newMonth > 12) {
    newMonth = 1;
    newYear++;
  }
  const temp = DateTime.local(newYear, newMonth, 1).setZone(dtOriginal.zone);
  const daysInNextMonth = temp.daysInMonth;
  const newDay = Math.min(dtOriginal.day, daysInNextMonth);

  return DateTime.local(newYear, newMonth, newDay).setZone(dtOriginal.zone).set({ hour: 12 });
}

async function guardarRespuesta(numero, clienteData, respuestaTexto, fechaActual) {
  let registros = [];
  if (fs.existsSync(path)) {
    registros = JSON.parse(fs.readFileSync(path));
  }
  registros.push({
    nombre: clienteData["NOMBRE"],
    numero,
    cuenta: clienteData["CUENTA"],
    valor: clienteData["VALOR"],
    respuesta: respuestaTexto,
    fecha: fechaActual
  });
  fs.writeFileSync(path, JSON.stringify(registros, null, 2));
  await actualizarRespuestaEnExcel(numero, respuestaTexto, fechaActual, "");
  console.log(`\ud83d\udcdc Respuesta registrada: ${numero} => ${respuestaTexto}`);
}

function obtenerEstadoDeCuentas(clientes) {
  const cuentas = {};
  for (const cliente of clientes) {
    const cuenta = (cliente["CUENTA"] || "").toUpperCase().trim();
    const usuario = (cliente["USUARIO"] || "").trim();
    const perfiles = parseInt(cliente["PERFIL"] || 1);
    if (!cuenta || !usuario || isNaN(perfiles)) continue;
    const clave = `${cuenta}|${usuario}`;
    if (!cuentas[clave]) {
      cuentas[clave] = {
        cuenta,
        usuario,
        usados: 0,
        maximos: perfilMaximos[cuenta] || 1
      };
    }
    cuentas[clave].usados += perfiles;
  }
  return Object.values(cuentas).map(c => ({
    cuenta: c.cuenta,
    usuario: c.usuario,
    usados: c.usados,
    disponibles: Math.max(c.maximos - c.usados, 0),
    maximos: c.maximos
  }));
}

function generarResumenEstado(resumen) {
  if (resumen.length === 0) return "😐 No se encontraron cuentas para mostrar estado.";
  let mensaje = "📊 *Estado de Cuentas y Perfiles:*";
  for (const r of resumen) {
    let estado = "";
    if (r.usados >= r.maximos) {
      estado = "❌ ¡LLENA!";
    } else if (r.usados >= r.maximos - 1) {
      estado = "⚠️ Casi llena";
    } else {
      estado = "✅ Disponible";
    }
    mensaje += `🔹 ${r.cuenta} (${r.usuario}): ${r.usados}/${r.maximos} usados → ${r.disponibles} disponibles ${estado}\n`;
  }
  return mensaje;
}

// Programar envío automático todos los días a las 8:00am
cron.schedule("0 8 * * *", async () => {
  try {
    const clientes = leerClientes();
    const resumen = obtenerEstadoDeCuentas(clientes);
    const mensaje = generarResumenEstado(resumen);
    const admin = config.adminPhone + "@c.us";

    await client.sendMessage(admin, `📅 *Resumen Diario de Perfiles*\n\n${mensaje}`);
    console.log("📨 Resumen diario enviado al admin.");

    const contenidoArchivo = resumen
      .map(r => `${r.cuenta} | ${r.usuario} | Usados: ${r.usados} / ${r.maximos} | Disponibles: ${r.disponibles}`)
      .join("\n");
    fs.writeFileSync("estado.txt", contenidoArchivo);
  } catch (err) {
    console.error("❌ Error al enviar resumen diario:", err);
  }
});

function generarResumenPorUsuario(clientes) {
  const agrupado = {};
  for (const c of clientes) {
    const nombre = c["NOMBRE"] || "";
    const numero = c["NUMERO WHATSAPP"] || "";
    const cuenta = c["CUENTA"] || "";
    const usuario = c["USUARIO"] || "";
    const perfiles = parseInt(c["PERFIL"] || 1);
    const clave = `${nombre}|${numero}`;
    if (!agrupado[clave]) agrupado[clave] = { nombre, numero, total: 0, cuentas: [] };
    agrupado[clave].total += perfiles;
    agrupado[clave].cuentas.push(`${cuenta} (${usuario}) → ${perfiles} perfil(es)`);
  }

  let salida = "👥 *Resumen de perfiles por usuario:*";
  for (const clave in agrupado) {
    const data = agrupado[clave];
    salida += `🧾 *${data.nombre}* (${data.numero}): Total perfiles en uso: ${data.total}\n`;
    data.cuentas.forEach((c) => (salida += `   - ${c}\n`));
    salida += "\n";
  }
  return salida;
}

client.on("message", async (msg) => {
  const texto = msg.body.trim().toLowerCase();
  if (texto === "estado") {
    const clientes = leerClientes();
    const mensaje = generarResumenPorUsuario(clientes);
    await msg.reply(mensaje);
  }
});

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
    });
  }
  return mapa;
}

client.initialize();