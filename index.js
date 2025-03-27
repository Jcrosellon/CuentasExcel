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

const path = "./respuestas.json";

const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: { headless: true },
});

client.on("qr", (qr) => {
  qrcode.generate(qr, { small: true });
  console.log("📲 Escanea el código QR con tu WhatsApp");
});

client.on("ready", async () => {
  console.log("✅ Bot listo. Enviando mensajes...");

  try {
    const clientes = leerClientes();
    console.log(`Se encontraron ${clientes.length} filas en el Excel.`);

    for (const cliente of clientes) {
      const nombre = cliente["NOMBRE"] || "Sin Nombre";
      const cuenta = cliente["CUENTA"] || "";
      const dispositivo = cliente["DISPOSITIVO"] || "";
      const valor = cliente["VALOR"] || "0";

      const numeroRaw = cliente["NUMERO WHATSAPP"]?.toString() || "";
      let numeroLimpio = numeroRaw.split(".")[0].split("E")[0];
      const numeroWhatsApp = numeroLimpio + "@c.us";

      const mensaje = `🌙 Buenas noches ${nombre}, para recordarte que MAÑANA se vence tu servicio de ${cuenta}, para ${dispositivo}, por un valor de ${valor}.
¿Deseas continuar? ✨

Responde con *SI* o *NO* ✅❌`;

      console.log(`> Enviando mensaje a ${nombre} (${numeroWhatsApp})`);
      await client.sendMessage(numeroWhatsApp, mensaje);
      console.log(`📩 Mensaje enviado a: ${nombre}`);
    }
  } catch (error) {
    console.error("❌ Error durante el envío inicial:", error);
  }
});

client.on("message", async (msg) => {
  if (msg.fromMe) return;

  const texto = msg.body.trim().toLowerCase();
  const numero = msg.from.replace("@c.us", "");
  const fechaActual = DateTime.now().setZone("America/Bogota").toISODate();

  const clientes = leerClientes();
  const clienteData = clientes.find((c) => {
    const col = c["NUMERO WHATSAPP"]?.toString() || "";
    return col.includes(numero);
  });
  if (!clienteData) return;

  if (msg.hasMedia) {
    msg.reply("📸 Recibimos tu comprobante. Validando...");
    const media = await msg.downloadMedia();
    const buffer = Buffer.from(media.data, "base64");
    const tempPath = `./temp-${numero}.jpg`;
    await writeFile(tempPath, buffer);

    const valorEsperado = clienteData["VALOR"]
      ? clienteData["VALOR"].toString().replace(/\./g, "")
      : "20000";

    const resultado = await validarComprobante(tempPath, valorEsperado);
    if (!resultado.valido) {
      msg.reply("⚠️ No pudimos validar tu comprobante. Asegúrate de que se vea el valor, la fecha y el número de destino (3183192913).");
      return;
    }

    const nuevaReferencia = (resultado.referenciaDetectada || "").trim();
    const cambioExitoso = await actualizarComprobanteFila(numero, nuevaReferencia);

    if (!cambioExitoso) {
      msg.reply(`❌ Este comprobante ya está registrado (Ref: ${nuevaReferencia}).\nPago rechazado.`);
      return;
    }

    msg.reply(`✅ Comprobante verificado. Referencia: ${nuevaReferencia}\n¡Gracias por tu pago! 🙌`);
    await actualizarRespuestaEnExcel(numero, "SI", fechaActual, nuevaReferencia);
    return;
  }

  if (["si", "sí", "✅ si"].includes(texto)) {
    msg.reply("👍 ¡Perfecto! Para continuar, realiza el pago a *Nequi o Daviplata: 3183192913* y adjunta el pantallazo por aquí. Yo me encargaré de validarlo. 🧐📲");
    await guardarRespuesta(numero, clienteData, "SI", fechaActual);
  } else if (["no", "❌ no"].includes(texto)) {
    const catalogo = fs.readFileSync("./catalogo.txt", "utf8");
    const mensaje = `☹️ Siento que hayas tenido algún inconveniente. Si decides regresar, estaré aquí para ayudarte. 🌟\n\nMientras tanto, te comparto nuestro catálogo de precios actualizados:\n\n${catalogo}`;
    msg.reply(mensaje);
    await guardarRespuesta(numero, clienteData, "NO", fechaActual);
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

  return DateTime.local(newYear, newMonth, newDay)
    .setZone(dtOriginal.zone)
    .set({ hour: 12, minute: 0, second: 0 });
}

async function guardarRespuesta(numero, clienteData, respuestaTexto, fechaActual) {
  let registros = [];
  if (fs.existsSync(path)) {
    registros = JSON.parse(fs.readFileSync(path));
  }

  const nuevaRespuesta = {
    nombre: clienteData["NOMBRE"],
    numero,
    cuenta: clienteData["CUENTA"],
    valor: clienteData["VALOR"],
    respuesta: respuestaTexto,
    fecha: fechaActual
  };

  registros.push(nuevaRespuesta);
  fs.writeFileSync(path, JSON.stringify(registros, null, 2));

  await actualizarRespuestaEnExcel(numero, respuestaTexto, fechaActual, "");
  console.log(`📝 Respuesta registrada: ${numero} => ${respuestaTexto}`);
}

async function actualizarComprobanteFila(numero, nuevaRef) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(config.excelPath);
  const hoja = workbook.getWorksheet(config.hojaExcel);
  if (!hoja) return false;

  const headerRow = hoja.getRow(1).values;
  const colNumero = headerRow.indexOf("NUMERO WHATSAPP");
  const colComprobante = headerRow.indexOf("COMPROBANTE");
  const colFechaInicio = headerRow.indexOf("FECHA INICIO");
  const colFechaFinal = headerRow.indexOf("FECHA FINAL");

  if (colNumero === -1 || colComprobante === -1) return false;

  let cambioHecho = false;

  hoja.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const celdaNumero = row.getCell(colNumero).value?.toString() || "";
    if (celdaNumero.includes(numero)) {
      const refActual = row.getCell(colComprobante).value?.toString().trim() || "";

      if (refActual.toLowerCase() === nuevaRef.toLowerCase() && refActual !== "") {
        cambioHecho = false;
      } else {
        row.getCell(colComprobante).value = nuevaRef;

        if (colFechaInicio !== -1 && colFechaFinal !== -1) {
          let valorFechaFinal = row.getCell(colFechaFinal).value;
          let dtFinal;

          if (valorFechaFinal instanceof Date) {
            dtFinal = DateTime.fromJSDate(valorFechaFinal).setZone("America/Bogota");
          } else if (typeof valorFechaFinal === "number") {
            dtFinal = DateTime.fromJSDate(new Date((valorFechaFinal - 25569) * 86400 * 1000)).setZone("America/Bogota");
          } else if (typeof valorFechaFinal === "string") {
            dtFinal = DateTime.fromFormat(valorFechaFinal, "dd/LL/yyyy", { zone: "America/Bogota" });
            if (!dtFinal.isValid) {
              dtFinal = DateTime.fromFormat(valorFechaFinal, "yyyy-MM-dd", { zone: "America/Bogota" });
            }
          }

          if (dtFinal && dtFinal.isValid) {
            row.getCell(colFechaInicio).value = dtFinal.toFormat("dd/MM/yyyy");
            const dtNuevoFinal = sumarMesClampeando(dtFinal);
            row.getCell(colFechaFinal).value = dtNuevoFinal.toFormat("dd/MM/yyyy");
          }
        }

        cambioHecho = true;
      }
    }
  });

  if (cambioHecho) {
    await workbook.xlsx.writeFile(config.excelPath);
  }
  return cambioHecho;
}

client.initialize();
