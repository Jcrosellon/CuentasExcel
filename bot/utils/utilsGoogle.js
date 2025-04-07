// utilsGoogle.js
const { google } = require("googleapis");
const config = require("../config/config.json");
const fs = require("fs");
const path = require("path");
const { DateTime } = require("luxon");

const CREDENTIALS_PATH = path.join(__dirname, "../config/credentials.json");
if (!fs.existsSync(CREDENTIALS_PATH)) {
  console.error("❌ ERROR: No se encontró el archivo credentials.json");
  process.exit(1);
}

const clavesObligatorias = ["googleSheetId", "hojaExcel"];
const faltantes = clavesObligatorias.filter(k => !config[k]);
if (faltantes.length > 0) {
  console.error("❌ ERROR: Faltan claves en config.json:", faltantes.join(", "));
  process.exit(1);
}

const auth = new google.auth.GoogleAuth({
  keyFile: CREDENTIALS_PATH,
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});

const SPREADSHEET_ID = config.googleSheetId;

async function getSheet() {
  const client = await auth.getClient();
  return google.sheets({ version: "v4", auth: client });
}

async function leerClientesGoogle() {
  try {
    const sheets = await getSheet();
    const range = `${config.hojaExcel}!A2:M`;

    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range,
    });

    const rows = res.data.values || [];
    const headers = [
      "NOMBRE", "ALIAS", "FECHA INICIO", "FECHA FINAL", "USUARIO", "CLAVE",
      "CUENTA", "DISPOSITIVO", "PERFIL", "VALOR", "NUMERO WHATSAPP",
      "RESPUESTA", "FECHA RESPUESTA", "COMPROBANTE"
    ];

    return rows.map(row => {
      const obj = {};
      headers.forEach((h, i) => {
        obj[h] = row[i] || "";
      });
      return obj;
    });
  } catch (error) {
    console.error("❌ Error leyendo Google Sheets:", error.message);
    return [];
  }
}

async function actualizarRespuestaEnGoogle(numero, respuesta, fecha, referencia = "") {
  try {
    const sheets = await getSheet();
    const sheetId = config.googleSheetId;
    const hoja = config.hojaExcel;

    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: `${hoja}!A2:N`,
    });

    const rows = res.data.values || [];
    const numeroLimpio = numero.replace(/\D/g, "");
    let rowIndex = -1;

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const celdaNumero = (row[10] || "").replace(/\D/g, ""); // Columna K
      if (celdaNumero.includes(numeroLimpio)) {
        rowIndex = i + 2; // Ajustamos por cabecera
        break;
      }
    }

    if (rowIndex === -1) {
      console.warn("⚠️ No se encontró fila para actualizar respuesta en Google Sheets:", numero);
      return false;
    }

    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: sheetId,
      requestBody: {
        data: [
          {
            range: `${hoja}!L${rowIndex}`,
            values: [[respuesta]],
          },
          {
            range: `${hoja}!M${rowIndex}`,
            values: [[fecha]],
          },
          {
            range: `${hoja}!N${rowIndex}`,
            values: [[referencia]],
          }
        ],
        valueInputOption: "USER_ENTERED",
      },
    });

    console.log(`✅ Respuesta actualizada en Google Sheets (fila ${rowIndex})`);
    return true;
  } catch (error) {
    console.error("❌ Error actualizando respuesta en Google Sheets:", error.message);
    return false;
  }
}

async function agregarNuevaFilaEnGoogleSheets(pendiente) {
  try {
    const sheets = await getSheet();
    const fechaActual = DateTime.now().setZone("America/Bogota").toFormat("dd/LL/yyyy");
    const fechaFinal = DateTime.now().plus({ days: 30 }).setZone("America/Bogota").toFormat("dd/LL/yyyy");

    const nuevaFila = [
      pendiente.nombre || "",        // NOMBRE
      "",                             // ALIAS
      fechaActual,                   // FECHA INICIO
      fechaFinal,                    // FECHA FINAL
      pendiente.usuario || "",      // USUARIO
      "",                             // CLAVE
      pendiente.cuenta || "",       // CUENTA
      "",                             // DISPOSITIVO
      "1",                            // PERFIL (por defecto)
      "",                             // VALOR (puedes completarlo si tienes precio en texto del producto)
      pendiente.numero || "",        // NUMERO WHATSAPP
      "✅ Comprobante",            // RESPUESTA
      fechaActual,                   // FECHA RESPUESTA
      pendiente.referencia || ""     // COMPROBANTE
    ];

    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: `${config.hojaExcel}!A1`,
      valueInputOption: "USER_ENTERED",
      insertDataOption: "INSERT_ROWS",
      requestBody: {
        values: [nuevaFila]
      }
    });

    console.log("✅ Nueva venta registrada en Google Sheets:", pendiente);
  } catch (error) {
    console.error("❌ Error al agregar nueva fila en Google Sheets:", error.message);
  }
}

module.exports = {
  leerClientesGoogle,
  actualizarRespuestaEnGoogle,
  agregarNuevaFilaEnGoogleSheets,
};