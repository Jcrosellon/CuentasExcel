// index.js
const qrcode = require("qrcode-terminal");
const { Client, LocalAuth } = require("whatsapp-web.js");
const { DateTime } = require("luxon");
const fs = require("fs");
const { writeFile } = require("fs/promises");

const ExcelJS = require("exceljs");
const config = require("./config.json");

const { leerClientes } = require("./utils");             // Lee filas del Excel
const { validarComprobante } = require("./ocrValidator"); // OCR
const { actualizarRespuestaEnExcel } = require("./guardarRespuestas"); // Actualiza RESPUESTA/FECHA

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
      // Si hace falta prefijo país:
      // numeroLimpio = "57" + numeroLimpio;

      const numeroWhatsApp = numeroLimpio + "@c.us";

      const mensaje = `Buenas noches ${nombre}, para recordarle que MAÑANA se cumple su servicio de ${cuenta}, cuenta para ${dispositivo}, con valor de ${valor}.\n¿Desea continuar?\n\nResponda SI o NO`;

      console.log(`> Enviando mensaje a ${nombre} (${numeroWhatsApp})`);
      await client.sendMessage(numeroWhatsApp, mensaje);
      console.log(`📩 Mensaje enviado a: ${nombre}`);
    }
  } catch (error) {
    console.error("❌ Error durante el envío inicial:", error);
  }
});

// Manejo de mensajes
client.on("message", async (msg) => {
  if (msg.fromMe) return; // evitar bucle

  const texto = msg.body.trim().toLowerCase();
  const numero = msg.from.replace("@c.us", "");
  const fechaActual = DateTime.now().setZone("America/Bogota").toISODate();

  // Encontrar el cliente en Excel
  const clientes = leerClientes();
  const clienteData = clientes.find((c) => {
    const col = c["NUMERO WHATSAPP"]?.toString() || "";
    return col.includes(numero);
  });
  if (!clienteData) return; // no está en Excel

  // Si llega un comprobante (imagen)
  if (msg.hasMedia) {
    msg.reply("📸 Recibimos tu comprobante. Validando...");

    // Descargamos la imagen a buffer
    const media = await msg.downloadMedia();
    const buffer = Buffer.from(media.data, "base64");
    const tempPath = `./temp-${numero}.jpg`;
    await writeFile(tempPath, buffer);

    // Valor esperado
    const valorEsperado = clienteData["VALOR"]
      ? clienteData["VALOR"].toString().replace(/\./g, "")
      : "20000";

    const resultado = await validarComprobante(tempPath, valorEsperado);
    if (!resultado.valido) {
      msg.reply("⚠️ No pudimos validar tu comprobante. Revisa que se vea el valor, la fecha y el número de destino (3183192913).");
      return;
    }

    const nuevaReferencia = (resultado.referenciaDetectada || "").trim();
    // Ve a la fila de este usuario y haz la lógica de “mismo/diferente comprobante”
    const cambioExitoso = await actualizarComprobanteFila(numero, nuevaReferencia);

    if (!cambioExitoso) {
      // Si la función nos dice que es “el mismo comprobante”, rechazamos
      msg.reply(`❌ Este comprobante ya está registrado (Ref: ${nuevaReferencia}).\nPago rechazado.`);
      return;
    }

    // Si todo bien (era distinto), confirmamos
    msg.reply(`✅ Comprobante verificado. Referencia: ${nuevaReferencia}\n¡Gracias por tu pago!`);
    // Además, actualizamos RESPUESTA = "✅ Comprobante" en Excel
    await actualizarRespuestaEnExcel(numero, "✅ Comprobante", fechaActual, nuevaReferencia);
    return;
  }

  // Manejo de SI/NO
  if (["si", "sí", "✅ si"].includes(texto)) {
    msg.reply("¡Perfecto! Para continuar, realiza el pago a Nequi o Daviplata: 3183192913 y adjunta el pantallazo por aquí. Yo me encargaré de validarlo. 🙌");
    await guardarRespuesta(numero, clienteData, "✅ Sí", fechaActual);

  } else if (["no", "❌ no"].includes(texto)) {
    msg.reply("Siento que hayas tenido algún inconveniente con el servicio. Aquí estaré si decides regresar más adelante. ¡Un saludo!");
    await guardarRespuesta(numero, clienteData, "❌ No", fechaActual);
  }
});

// Guarda la respuesta (SI/NO) en JSON + Excel
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

  // Actualiza Excel con la respuesta (sin referencia)
  await actualizarRespuestaEnExcel(numero, respuestaTexto, fechaActual, "");
  console.log(`📝 Respuesta registrada: ${numero} => ${respuestaTexto}`);
}

/**
 * Actualiza la columna COMPROBANTE de la fila del usuario (según NUMERO WHATSAPP).
 *  - Si es la misma referencia, retorna false (rechaza).
 *  - Si es distinta, la sobreescribe (limpia la vieja) y retorna true.
 */
async function actualizarComprobanteFila(numero, nuevaRef) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(config.excelPath);

  const hoja = workbook.getWorksheet(config.hojaExcel);
  if (!hoja) return false;

  // Columnas
  const headerRow = hoja.getRow(1).values; 
  const colNumero = headerRow.indexOf("NUMERO WHATSAPP");
  const colComprobante = headerRow.indexOf("COMPROBANTE");

  if (colNumero === -1 || colComprobante === -1) {
    // Sin columna, no hacemos nada
    return false;
  }

  // Recorremos filas en busca de la que coincida con 'numero'
  let cambioHecho = false;

  hoja.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return; // encabezado
    const celdaNumero = row.getCell(colNumero).value?.toString() || "";
    if (celdaNumero.includes(numero)) {
      // Fila del cliente
      const refActual = row.getCell(colComprobante).value?.toString().trim() || "";
      // Si la nueva = actual -> rechazamos
      if (refActual.toLowerCase() === nuevaRef.toLowerCase()) {
        cambioHecho = false; // No aprobamos
      } else {
        // Sobrescribimos con la nueva
        row.getCell(colComprobante).value = nuevaRef;
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
