const { google } = require("googleapis");
const config = require("./config.json");
const fs = require("fs");
const path = require("path");

const CREDENTIALS_PATH = path.join(__dirname, "credentials.json");
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
            range: `${hoja}!L${rowIndex}`, // RESPUESTA
            values: [[respuesta]],
          },
          {
            range: `${hoja}!M${rowIndex}`, // FECHA RESPUESTA
            values: [[fecha]],
          },
          {
            range: `${hoja}!N${rowIndex}`, // COMPROBANTE o REFERENCIA
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



module.exports = {
  leerClientesGoogle,
  actualizarRespuestaEnGoogle,
};
