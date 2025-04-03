// index.js
const qrcode = require("qrcode-terminal");
const { Client, LocalAuth, MessageMedia } = require("whatsapp-web.js");
const { DateTime } = require("luxon");
const fs = require("fs");
const { writeFile } = require("fs/promises");
const ExcelJS = require("exceljs");
const cron = require("node-cron");

const config = require("./configLoader")();
const { leerClientes } = require("./utils");
const { validarComprobante } = require("./ocrValidator");
const { actualizarComprobanteFila } = require("./guardarRespuestas");

const adminPhone = config.adminPhone + "@c.us";
const path = "./respuestas.json";
const rutaPendientes = "./pendientes.json";
const rutaMensajesEnviados = "./mensajesEnviados.json";
const { yaFueConfirmado, marcarRespondido, yaRespondido } = require("./postPagoManager");

const perfilMaximos = {
  "NETFLIX": 5,
  "TELE LATINO": 6,
  "DISNEY": 7,
  "AMAZON PRIME": 6,
  "MAX PLATINO": 5,
  "IPTV": 3,
};

async function logError(mensaje, err = null, rutaImagen = null) {
  const timestamp = DateTime.now().setZone("America/Bogota").toISO();
  let texto = `🕓 ${timestamp} - ${mensaje}`;
  if (err) {
    texto += `\n🛠️ Detalles: ${err.stack || err.message || err}`;
  }
  texto += "\n\n";
  fs.appendFileSync("errores.txt", texto);

  try {
    if (client && client.info && client.info.wid && adminPhone) {
      const resumen = mensaje.length > 300 ? mensaje.slice(0, 300) + "..." : mensaje;
      await client.sendMessage(adminPhone, `⚠️ *Error detectado:*
${resumen}`);

      if (rutaImagen && fs.existsSync(rutaImagen)) {
        const media = new MessageMedia("image/jpeg", fs.readFileSync(rutaImagen, "base64"));
        await client.sendMessage(adminPhone, media, { caption: "📎 Último pantallazo vinculado al error." });
      }
    }
  } catch (notifyErr) {
    console.error("❌ No se pudo notificar al admin sobre el error:", notifyErr.message);
  }
}

process.on("uncaughtException", (err) => {
  logError("❌ Excepción no capturada (uncaughtException)", err);
});

process.on("unhandledRejection", (reason, promise) => {
  logError("❌ Promesa no manejada (unhandledRejection)", reason);
});

const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: { headless: true },
});

client.on("auth_failure", (msg) => {
  logError("❌ Fallo de autenticación con WhatsApp", msg);
});

client.on("disconnected", (reason) => {
  logError("🔌 Bot desconectado de WhatsApp", reason);
});

client.on("qr", (qr) => {
  qrcode.generate(qr, { small: true });
  console.log("📲 Escanea el código QR con tu WhatsApp");
});

client.on("ready", async () => {
  console.log("✅ Bot listo. Programando envíos automáticos...");

  cron.schedule("0 18 * * *", async () => {
    try {
      const hoy = DateTime.now().setZone("America/Bogota").startOf("day");
      const clientes = await leerClientes();
      const agrupados = agruparClientesPorNumero(clientes);

      for (const numero in agrupados) {
        const cliente = agrupados[numero];
        if (numero === "573114207673") {
          await enviarMensajeVencimiento(numero, cliente.nombre, cliente.cuentas, "🧪 PRUEBA DIARIA");
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
          const diff = finalDia.diff(hoy, "days").days;

          console.log(`[DEBUG FECHA] Cliente: ${cliente.nombre}, Excel: ${rawFecha}, Parseada: ${finalDia.toISODate()}, Hoy: ${hoy.toISODate()}, Diff: ${diff}`);

          if (diff === 1) {
            vencenManana.push(cuenta);
          } else if (diff === 0) {
            vencenHoy.push(cuenta);
          } else if (diff < 0) {
            console.log(`📆 Servicio en mora para ${cliente.nombre}: ${cuenta.cuenta} (${diff} días)`);
            enMora.push({ ...cuenta, dias: Math.abs(Math.round(diff)) });
          }
        }

        if (vencenManana.length > 0) {
          await enviarMensajeVencimiento(numero, cliente.nombre, vencenManana, "MAÑANA");
        }

        if (vencenHoy.length > 0) {
          await enviarMensajeVencimiento(numero, cliente.nombre, vencenHoy, "HOY");
        }

        for (const mora of enMora) {
          await enviarMensajeMora(numero, cliente.nombre, mora);
        }
      }
    } catch (err) {
      logError("Error en ejecución del cron diario", err);
    }
  });

  // ⚡ Enviar al instante solo para pruebas (comenta esto en producción)
  //await enviarTodosLosMensajes();
});


client.on("message", async (msg) => {
  const texto = msg.body.trim().toLowerCase();
  const numero = msg.from.replace("@c.us", "");
  const fechaActual = DateTime.now().setZone("America/Bogota").toISODate();

  if (msg.from === adminPhone) {
    let pendientes = fs.existsSync(rutaPendientes) ? JSON.parse(fs.readFileSync(rutaPendientes)) : [];
    const pendiente = pendientes.shift();
    fs.writeFileSync(rutaPendientes, JSON.stringify(pendientes, null, 2));

    if (texto === "estado") {
      const clientes = await leerClientes();

      const resumen = obtenerEstadoDeCuentas(clientes);
      const mensaje = generarResumenEstado(resumen);
      await client.sendMessage(msg.from, mensaje);
      return;
    }

    if (texto === "limpiar pendientes") {
      fs.writeFileSync(rutaPendientes, JSON.stringify([], null, 2));
      msg.reply("🧹 Pendientes limpiados con éxito.");
      console.log("🧼 Admin limpió todos los pendientes.");
      return;
    }


    if (texto === "analizar último") {
      const pendientes = fs.existsSync(rutaPendientes)
        ? JSON.parse(fs.readFileSync(rutaPendientes))
        : [];

      if (pendientes.length === 0) {
        await client.sendMessage(adminPhone, "⚠️ No hay pendientes guardados para analizar.");
        return;
      }

      const ultimo = pendientes[pendientes.length - 1];

      if (!ultimo.imagen || !fs.existsSync(ultimo.imagen)) {
        await client.sendMessage(adminPhone, "⚠️ No se encontró la imagen del último pendiente.");
        return;
      }

      await client.sendMessage(adminPhone, "🔁 Reanalizando el último pantallazo...");

      try {
        const clientes = await leerClientes();
        const clienteRelacionado = clientes.find(c =>
          (c["NUMERO WHATSAPP"]?.toString() || "").includes(ultimo.numero)
        );

        const valorEsperado = clienteRelacionado
          ? clienteRelacionado["VALOR"]?.toString().replace(/\./g, "")
          : "20000";

        const resultado = await validarComprobante(ultimo.imagen, valorEsperado);


        if (!resultado.valido) {
          await client.sendMessage(adminPhone, "❌ OCR no logró validar el comprobante nuevamente.");
          return;
        }

        await client.sendMessage(adminPhone, `🧾 Referencia: ${resultado.referenciaDetectada}\n💵 Valor: ${resultado.valorDetectado}`);
        await client.sendMessage(adminPhone, new MessageMedia("image/jpeg", fs.readFileSync(ultimo.imagen).toString("base64")), {
          caption: "🖼 Comprobante reanalizado",
        });
      } catch (err) {
        console.error("❌ Error reanalizando pantallazo:", err);
        await client.sendMessage(adminPhone, "❌ Hubo un error al analizar el pantallazo.");
      }
    }



    if (pendiente) {
      const clientes = await leerClientes();

      const relacionados = clientes.filter(c => (c["NUMERO WHATSAPP"]?.toString() || "").includes(pendiente.numero));
      for (const cliente of relacionados) {
        await actualizarComprobanteFila(cliente["NUMERO WHATSAPP"], pendiente.referencia);
        await actualizarRespuestaEnExcel(cliente["NUMERO WHATSAPP"], "✅ Comprobante", DateTime.now().toISODate(), pendiente.referencia);
      }
      if (texto === "confirmado" || texto === "✅") {
        const mensajeConfirmacion = `✅ Tu pago ha sido confirmado. Ref: *${pendiente.referencia}*. ¡Gracias por continuar con nosotros! 🎉`;
        await client.sendMessage(pendiente.numero + "@c.us", mensajeConfirmacion);
        await client.sendMessage(adminPhone, `✅ Confirmaste el pago con referencia: *${pendiente.referencia}*`);
      }
      else if (texto === "rechazado" || texto === "❌") {
        await client.sendMessage(pendiente.numero + "@c.us", "❌ Tu pago fue rechazado. Verifica que el pantallazo sea correcto y vuelve a intentarlo.");
        await client.sendMessage(adminPhone, `❌ Rechazaste el pago con referencia: *${pendiente.referencia}*`);
      }
    } else {
      msg.reply("⚠️ No hay pagos pendientes para confirmar o rechazar.");
    }
    return;
  }

  const clientes = await leerClientes();

  const cuentasUsuario = clientes.filter(c => (c["NUMERO WHATSAPP"]?.toString() || "").includes(numero));
  if (cuentasUsuario.length === 0) return;

  if (msg.hasMedia) {
    let media;
    try {
      media = await msg.downloadMedia();
    } catch (err) {
      console.error("❌ Error descargando media:", err.message);
      await client.sendMessage(msg.from, "⚠️ Ocurrió un error descargando tu archivo. Intenta enviarlo de nuevo.");
      return;
    }

    if (!media || !["image/jpeg", "image/png"].includes(media.mimetype)) {
      let historial = {};
      if (fs.existsSync(rutaMensajesEnviados)) {
        try {
          const contenido = fs.readFileSync(rutaMensajesEnviados, "utf8");
          historial = contenido ? JSON.parse(contenido) : {};
        } catch (err) {
          console.error("⚠️ Error leyendo mensajesEnviados.json:", err.message);
        }
      }

      const mensajeAnterior = historial[numero];
      if (mensajeAnterior) {
        await client.sendMessage(numero + "@c.us", "🤖 No entendí eso, pero aquí está lo último que te envié:");
        await client.sendMessage(numero + "@c.us", mensajeAnterior);
      } else {
        await client.sendMessage(numero + "@c.us", "🤔 No entendí tu mensaje. Intenta escribir *SI* o *NO* para continuar.");
      }
      return;
    }

    msg.reply("📸 Recibimos tu comprobante. *Validando...*");
    const ext = media.mimetype === "image/png" ? "png" : "jpg";
    const tempPath = `./temp-${numero}.${ext}`;
    const buffer = Buffer.from(media.data, "base64");
    await writeFile(tempPath, buffer);

    const clienteData = cuentasUsuario[0];
    const valorEsperado = clienteData["VALOR"]?.toString().replace(/\./g, "") || "20000";

    let resultado;
    try {
      resultado = await validarComprobante(tempPath, valorEsperado);

      const valorEsperadoNum = parseFloat(valorEsperado);
      const valorDetectado = resultado.valorDetectado || 0;

      console.log("🔍 Comparando valores: Detectado =", valorDetectado, "Esperado =", valorEsperadoNum);

      if (valorDetectado === 0 || isNaN(valorDetectado)) {
        await msg.reply("⚠️ No pudimos detectar un valor de pago en el comprobante. Asegúrate de que el monto esté visible.");
        await fs.promises.unlink(tempPath).catch(() => { });
        return;
      }

      if (valorDetectado < valorEsperadoNum) {
        await msg.reply(`❌ Pago rechazado, Recuerda que tu pago es: *${formatearPesosColombianos(valorEsperadoNum)}*.`);
        console.log(`🚫 Comprobante rechazado automáticamente: valor insuficiente.`);
        await fs.promises.unlink(tempPath).catch(() => { });
        return;
      }
    } catch (err) {
      await logError("❌ Error durante OCR:", err, tempPath);
      await msg.reply("⚠️ No pudimos leer la imagen. Asegúrate que el pantallazo esté claro y vuelve a intentarlo.");
      await fs.promises.unlink(tempPath).catch(() => { });
      return;
    }



    await fs.promises.unlink(tempPath).catch(() => { });

    if (!resultado.valido) {
      msg.reply("⚠️ No pudimos validar tu comprobante. Asegúrate que el pantallazo esté claro y vuelve a intentarlo.");
      return;
    }

    const nuevaReferencia = (resultado.referenciaDetectada || "").trim();
    let pendientes = fs.existsSync(rutaPendientes) ? JSON.parse(fs.readFileSync(rutaPendientes)) : [];
    if (pendientes.some(p => p.referencia === nuevaReferencia)) {
      msg.reply(`❌ Este comprobante no es valido (Ref: ${nuevaReferencia}).\nPago rechazado.`);
      return;
    }

    const mensajeAdmin = `🧾 *Pago recibido de ${clienteData["NOMBRE"]}*\n` +
      `🧩 Referencia: ${nuevaReferencia}\n` +
      `📌 Cuenta: ${clienteData["CUENTA"]} (usuario: ${clienteData["USUARIO"]})\n\n` +
      `✅ Para *confirmar* este pago responde: *CONFIRMADO* o ✅\n❌ Para *rechazarlo* responde: *RECHAZADO* o ❌`;

    await client.sendMessage(adminPhone, mensajeAdmin);
    await client.sendMessage(adminPhone, media, { caption: "🖼 Comprobante adjunto" });
    msg.reply("🕓 Comprobante enviado para validación. Te notificaremos pronto. 🙌");

    pendientes.push({
      numero,
      referencia: nuevaReferencia,
      fecha: DateTime.now().toISO(),
      nombre: clienteData["NOMBRE"],
      cuenta: clienteData["CUENTA"],
      usuario: clienteData["USUARIO"]
    });
    fs.writeFileSync(rutaPendientes, JSON.stringify(pendientes, null, 2));
    console.log("📩 Pendiente agregado para revisión:", nuevaReferencia);

    return;
  }


  if (["si", "sí", "✅ si"].includes(texto)) {
    msg.reply("👍 ¡Perfecto! Para continuar, realiza el pago a *Nequi o DaviPlata: 3183192913* y adjunta el pantallazo por aquí. Yo me encargaré de validarlo. 🧐📲");
    for (const cliente of cuentasUsuario) await guardarRespuesta(numero, cliente, "SI", fechaActual);
  } else if (["no", "❌ no"].includes(texto)) {
    const mensaje = `☹️ Siento que hayas tenido algún inconveniente...`;
    msg.reply(mensaje);
    for (const cliente of cuentasUsuario) await guardarRespuesta(numero, cliente, "NO", fechaActual);


} else {
  const cliente = cuentasUsuario[0];

  // 🔒 Validar si ya tiene comprobante ✅
  const yaPago = cliente["RESPUESTA"]?.toLowerCase().includes("comprobante");

  if (yaPago) {
    const palabrasClave = ["cuenta", "netflix", "disney", "tele latino", "ayuda", "tienes", "ip tv", "iptv", "necesito"];
    const contieneClave = palabrasClave.some(p => texto.includes(p));
  
    if (contieneClave) {
      await client.sendMessage(numero + "@c.us", "🎁 Si deseas activar una cuenta adicional, escribe *AYUDA* o contacta a un asesor. 👩‍💻");
    } else {
      await client.sendMessage(numero + "@c.us", "✅ Ya registramos tu pago exitosamente. Si necesitas algo más, escríbeme y pronto te atenderemos. 🙌");
    }
  
    console.log(`✅ Mensaje ignorado porque ya pagó: ${numero}`);
    return;
  }
  

  if (yaFueConfirmado(numero)) {
    const palabrasClave = [
      "cuenta", "netflix", "disney", "tele latino", "ayuda", "tienes", "ip tv", "iptv", "necesito"
    ];
    const contieneClave = palabrasClave.some(p => texto.includes(p));
  
    if (contieneClave) {
      await client.sendMessage(numero + "@c.us", "🎁 Si deseas activar una cuenta adicional, escribe *AYUDA* o contacta a un asesor. 👩‍💻");
    } else if (!yaRespondido(numero)) {
      await client.sendMessage(numero + "@c.us", "✅ Ya registramos tu pago exitosamente. Si necesitas algo más, escríbeme y pronto te atenderemos. 🙌");
      marcarRespondido(numero);
    } else {
      console.log(`🤐 Ya se respondió al cliente confirmado: ${numero}`);
    }
    return;
  }
  
  // Reenviar mensaje original guardado
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

const mensajeAnterior = historial[numero];
if (mensajeAnterior) {
  await client.sendMessage(numero + "@c.us", mensajeAnterior);
  console.log(`🔁 Reenviado mensaje original a ${numero}`);
} else {
  console.warn(`⚠️ No se encontró mensaje anterior para ${numero}`);
}
console.log(`🔁 Mensaje reenviado por respuesta no válida de ${numero}`);
}
});


function formatearPesosColombianos(valor) {
  return Math.round(valor).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

async function enviarMensajeVencimiento(numero, nombre, cuentas, cuando) {
  console.log(`📨 [${cuando}] Enviando mensaje a ${numero}: ${cuentas.map(c => c.cuenta).join(", ")}`);
  let mensaje = `🌙 Buenas tardes ${nombre}, RoussillonTechnology te recuerda que ${cuando} se vencen los siguientes servicios:\n\n`;
  let total = 0;
  for (const cuenta of cuentas) {
    mensaje += `🔸 ${cuenta.cuenta} ( ${cuenta.dispositivo} ): $${formatearPesosColombianos(cuenta.valor)}\n`;
    total += parseInt(cuenta.valor);
  }
  mensaje += `\n💰 Total a pagar: $${formatearPesosColombianos(total)}\n\n¿Deseas continuar? ✨\nResponde con *SI*✅ o *NO*❌`;

  if (esNumeroValido(numero)) {
    await client.sendMessage(numero + "@c.us", mensaje);

    // ✅ Solo guardar si no hay mensaje ya guardado
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

  } else {
    console.log(`❌ Número inválido: ${numero}`);
  }
}


async function enviarMensajeMora(numero, nombre, cuenta) {
  const mensaje = `📢 Hola ${nombre}, RoussillonTechnology te recuerda que tus servicios:\n\n` +
    `😱 ¡TIENEN ${cuenta.dias} DÍA${cuenta.dias > 1 ? "S" : ""} EN MORA!\n\n` +
    `🔸 ${cuenta.cuenta} ( ${cuenta.dispositivo} ): $${formatearPesosColombianos(cuenta.valor)}\n\n` +
    `💰 Total a pagar: $${formatearPesosColombianos(cuenta.valor)}\n\n` +
    `¿Si deseas continuar? ✨\nResponde con *SI*✅ o *NO*❌`;

  if (esNumeroValido(numero)) {
    await client.sendMessage(numero + "@c.us", mensaje);

    // ✅ Solo guardar si no está guardado ya
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


  } else {
    console.warn(`❌ Número inválido ignorado: ${numero}`);
  }
}


// ✅ Asegúrate de que cada cuenta en agruparClientesPorNumero incluya `fechaFinal` correctamente:
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

  // 👉 Actualizamos respuesta en Excel
  if (config.useGoogleSheet) {
    const { actualizarRespuestaEnGoogle } = require("./utilsGoogle");
    await actualizarRespuestaEnGoogle(numero, respuestaTexto, fechaActual, "");
  } else {
    await actualizarRespuestaEnExcel(numero, respuestaTexto, fechaActual, "");
  }

  // 🚫 No tocar el historial si la respuesta fue NO RECONOCIDO
  if (respuestaTexto === "NO RECONOCIDO") return;
}



async function actualizarRespuestaEnExcel(numero, respuesta, fecha, referencia = "") {
  const workbook = new ExcelJS.Workbook();

  const rutaExcel = process.platform === "win32"
    ? "C:/Users/JoseRosellon/OneDrive - LOGISTICA FERRETERA/CUENTASEXCEL.xlsx"
    : "/Users/mariapaz/Downloads/CUENTASEXCEL.xlsx";

  await workbook.xlsx.readFile(rutaExcel);
  const worksheet = workbook.getWorksheet("Hoja1");

  for (let i = 2; i <= worksheet.rowCount; i++) {
    const row = worksheet.getRow(i);
    const celNumero = row.getCell("J").value?.toString().replace(/\D/g, "") || "";
    const celRef = row.getCell("M").value?.toString().trim() || "";

    const coincide = referencia
      ? celNumero.includes(numero) && celRef === referencia
      : celNumero.includes(numero);

    if (coincide) {
      row.getCell("K").value = respuesta;
      row.getCell("L").value = fecha;

      if (respuesta.toLowerCase() === "no") {
        row.getCell("M").value = "XXXXXXXX";
        row.getCell("A").font = { color: { argb: "FFFF0000" } };
        console.log(`🔴 Nombre en rojo para ${numero} (respuesta NO)`);
      }

      row.commit();
      await workbook.xlsx.writeFile(rutaExcel);
      console.log("📗 Respuesta actualizada en Excel:", numero);
      return true;
    }
  }

  console.log("⚠️ No se encontró coincidencia para:", numero, referencia);
  return false;
}


function esNumeroValido(numero) {
  return /^\d{11,15}$/.test(numero); // Por ejemplo: 573001234567
}



function obtenerEstadoDeCuentas(clientes) {
  const cuentas = {};
  for (const cliente of clientes) {
    const cuenta = (cliente["CUENTA"] || "").toUpperCase().trim();
    const usuario = (cliente["USUARIO"] || "").trim();
    const clave = (cliente["CLAVE"] || "").trim(); // 👈 obtenemos la clave
    const perfiles = parseInt(cliente["PERFIL"] || 1);
    if (!cuenta || !usuario || isNaN(perfiles)) continue;

    const claveCuenta = `${cuenta}|${usuario}`;
    if (!cuentas[claveCuenta]) {
      cuentas[claveCuenta] = {
        cuenta,
        usuario,
        clave, // 👈 la guardamos
        usados: 0,
        maximos: perfilMaximos[cuenta] || 1
      };
    }
    cuentas[claveCuenta].usados += perfiles;
  }

  return Object.values(cuentas).map(c => ({
    cuenta: c.cuenta,
    usuario: c.usuario,
    clave: c.clave, // 👈 retornamos la clave también
    usados: c.usados,
    disponibles: Math.max(c.maximos - c.usados, 0),
    maximos: c.maximos
  }));
}


function generarResumenEstado(resumen) {
  if (resumen.length === 0) return "😐 No se encontraron cuentas para mostrar estado.";

  // 🔽 Ordenamos por `disponibles` de mayor a menor
  resumen.sort((a, b) => b.disponibles - a.disponibles);

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

    mensaje += `\n\n🔹 ${r.cuenta}:\n` +
      `👤 Usuario: *${r.usuario}*\n` +
      `🔑 Clave: *${r.clave}*\n` +
      `👥 Perfiles usados: ${r.usados}/${r.maximos}\n` +
      `📦 Disponibles: ${r.disponibles}\n` +
      `📊 Estado: ${estado}\n` +
      `────────────────────`;
  }

  return mensaje;
}




// async function enviarTodosLosMensajes() {
//   const hoy = DateTime.now().setZone("America/Bogota").startOf("day");
//   const clientes = await leerClientes();

//   const agrupados = agruparClientesPorNumero(clientes);

//   for (const numero in agrupados) {
//     if (numero !== "573114207673") continue; // Solo ese número
//     const cliente = agrupados[numero];
//     const cuentas = cliente.cuentas;
//     let vencenManana = [];
//     let vencenHoy = [];
//     let enMora = [];

//     for (const cuenta of cuentas) {
//       let fechaFinal;
//       const rawFecha = cuenta.fechaFinal;

//       if (typeof rawFecha === "string") {
//         const partes = rawFecha.split("/");
//         const dia = partes[0].padStart(2, "0");
//         const mes = partes[1].padStart(2, "0");
//         const anio = partes[2];
//         const fechaStr = `${dia}/${mes}/${anio}`;
//         fechaFinal = DateTime.fromFormat(fechaStr, "dd/MM/yyyy", { zone: "America/Bogota" });
//       } else if (typeof rawFecha === "number") {
//         fechaFinal = DateTime.fromJSDate(new Date(Math.round((rawFecha - 25569 + 1) * 86400 * 1000)))
//           .setZone("America/Bogota")
//           .startOf("day");

//       } else if (rawFecha instanceof Date) {
//         fechaFinal = DateTime.fromJSDate(rawFecha).setZone("America/Bogota");
//       } else {
//         fechaFinal = null;
//       }

//       if (!fechaFinal || !fechaFinal.isValid) continue;

//       // ✅ Compara solo fechas (sin horas)
//       const hoy = DateTime.now().setZone("America/Bogota").startOf("day");
//       const finalDia = fechaFinal.startOf("day");

//       // ✅ Esto garantiza que el diff sea exacto (0, 1 o negativo)
//       const diff = finalDia.diff(hoy, "days").days;

//       console.log(`[DEBUG FECHA] Cliente: ${cliente.nombre}, Excel: ${rawFecha}, Parseada: ${finalDia.toISODate()}, Hoy: ${hoy.toISODate()}, Diff: ${diff}`);

//       if (diff === 1) {
//         vencenManana.push(cuenta);
//       } else if (diff === 0) {
//         vencenHoy.push(cuenta);
//       } else if (diff < 0) {
//         console.log(`📆 Servicio en mora para ${cliente.nombre}: ${cuenta.cuenta} (${diff} días)`);
//         enMora.push({ ...cuenta, dias: Math.abs(Math.round(diff)) });
//       }
//     }


//     if (vencenManana.length > 0) {
//       await enviarMensajeVencimiento(numero, cliente.nombre, vencenManana, "MAÑANA");
//     }

//     if (vencenHoy.length > 0) {
//       await enviarMensajeVencimiento(numero, cliente.nombre, vencenHoy, "HOY");
//     }

//     for (const mora of enMora) {
//       await enviarMensajeMora(numero, cliente.nombre, mora);
//     }
//   }
// }




client.initialize();
