// guardarRespuestas.js
const ExcelJS = require("exceljs");
const { DateTime } = require("luxon");
const config = require("./config.json");
const fs = require("fs");
const path = require("path");

const CREDENTIALS_PATH = path.join(__dirname, "credentials.json");
if (!fs.existsSync(CREDENTIALS_PATH)) {
  console.error("❌ ERROR: No se encontró el archivo credentials.json");
  process.exit(1);
}

const clavesObligatorias = ["hojaExcel", "googleSheetId"];
const faltantes = clavesObligatorias.filter(k => !config[k]);
if (faltantes.length > 0) {
  console.error("❌ ERROR: Faltan claves en config.json:", faltantes.join(", "));
  process.exit(1);
}

const { google } = require("googleapis");
const auth = new google.auth.GoogleAuth({
  keyFile: CREDENTIALS_PATH,
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});

async function getSheet() {
  const client = await auth.getClient();
  return google.sheets({ version: "v4", auth: client });
}

async function actualizarRespuestaEnExcel(numero, respuestaTexto, fechaActual, referencia) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(config.excelPath);
  const hoja = workbook.getWorksheet(config.hojaExcel);
  if (!hoja) return false;

  const header = hoja.getRow(1).values;
  const colNumero = header.indexOf("NUMERO WHATSAPP");
  const colRespuesta = header.indexOf("RESPUESTA");
  const colFecha = header.indexOf("FECHA RESPUESTA");
  const colReferencia = header.indexOf("REFERENCIA");

  let cambio = false;

  hoja.eachRow((row, i) => {
    if (i === 1) return;
    const celdaNumero = row.getCell(colNumero).value?.toString() || "";
    const celRef = row.getCell(colReferencia).value?.toString().trim() || "";
    const coincide = referencia
      ? celdaNumero.includes(numero) && celRef === referencia
      : celdaNumero.includes(numero);

    if (coincide) {
      row.getCell(colRespuesta).value = respuestaTexto;
      row.getCell(colFecha).value = fechaActual;
      if (respuestaTexto.toLowerCase() === "no") {
        row.getCell(colReferencia).value = "XXXXXXXX";
        row.getCell(1).font = { color: { argb: "FFFF0000" } };
        console.log(`🔴 Nombre en rojo para ${numero} (respuesta NO)`);
      }
      row.commit();
      cambio = true;
    }
  });

  if (cambio) {
    await workbook.xlsx.writeFile(config.excelPath);
    console.log("📗 Respuesta actualizada en Excel:", numero);
  }

  return cambio;
}

async function actualizarComprobanteFila(numero, nuevaRef) {
  if (config.useGoogleSheet) {
    return await actualizarComprobanteGoogleSheet(numero, nuevaRef);
  } else {
    return await actualizarComprobanteExcelLocal(numero, nuevaRef);
  }
}

async function actualizarComprobanteGoogleSheet(numero, nuevaRef) {
  try {
    const client = await auth.getClient();
    const sheets = google.sheets({ version: "v4", auth: client });
    const sheetId = config.googleSheetId;
    const hoja = config.hojaExcel;

    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: `${hoja}!A2:N`,
    });

    const rows = res.data.values || [];
    const numeroLimpio = numero.replace(/\D/g, "");
    let rowIndex = -1;
    let fechaFinalOriginal = null;

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const posibleNumero = (row[10] || "").replace(/\D/g, "");
      if (posibleNumero && posibleNumero.includes(numeroLimpio)) {
        rowIndex = i + 2;
        fechaFinalOriginal = row[3];
        break;
      }
    }

    if (rowIndex === -1 || !fechaFinalOriginal) {
      console.warn("⚠️ No se encontró fila para actualizar comprobante (Google):", numeroLimpio);
      return false;
    }

    const fechaInicio = DateTime.fromFormat(fechaFinalOriginal, "d/M/yyyy", { zone: "America/Bogota" });
    const nuevaFechaFinal = sumarMesClampeando(fechaInicio);

    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: sheetId,
      requestBody: {
        data: [
          {
            range: `${hoja}!C${rowIndex}:D${rowIndex}`,
            values: [[fechaInicio.toFormat("dd/MM/yyyy"), nuevaFechaFinal.toFormat("dd/MM/yyyy")]],
          },
          {
            range: `${hoja}!L${rowIndex}:N${rowIndex}`,
            values: [["✅ Comprobante", DateTime.now().toFormat("dd/MM/yyyy"), nuevaRef]],
          }
        ],
        valueInputOption: "USER_ENTERED",
      },
    });

    console.log(`🟢 Comprobante actualizado en Google Sheets. Fila ${rowIndex}, Ref: ${nuevaRef}`);
    return true;
  } catch (err) {
    console.error("❌ Error actualizando comprobante en Google Sheets:", err.message);
    return false;
  }
}

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

async function actualizarComprobanteExcelLocal(numero, nuevaRef) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(config.excelPath);
  const hoja = workbook.getWorksheet(config.hojaExcel);
  if (!hoja) return false;

  const header = hoja.getRow(1).values;
  const colNumero = header.indexOf("NUMERO WHATSAPP");
  const colComprobante = header.indexOf("COMPROBANTE");
  const colFechaInicio = header.indexOf("FECHA INICIO");
  const colFechaFinal = header.indexOf("FECHA FINAL");

  let cambio = false;

  hoja.eachRow((row, i) => {
    if (i === 1) return;
    const celdaNumero = row.getCell(colNumero).value?.toString() || "";
    if (celdaNumero.includes(numero)) {
      const fechaFinalRaw = row.getCell(colFechaFinal).value;
      const fechaInicio = DateTime.fromFormat(fechaFinalRaw.toString(), "d/M/yyyy", { zone: "America/Bogota" });
      const nuevaFinal = sumarMesClampeando(fechaInicio);
      row.getCell(colFechaInicio).value = fechaInicio.toFormat("dd/MM/yyyy");
      row.getCell(colFechaFinal).value = nuevaFinal.toFormat("dd/MM/yyyy");
      row.getCell(colComprobante).value = nuevaRef;
      cambio = true;
    }
  });

  if (cambio) {
    await workbook.xlsx.writeFile(config.excelPath);
    console.log("🟢 Excel actualizado con comprobante:", nuevaRef);
  }

  return cambio;
}

module.exports = {
  actualizarRespuestaEnExcel,
  actualizarComprobanteFila
};
