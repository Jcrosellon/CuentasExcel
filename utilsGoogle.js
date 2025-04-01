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
    const clientes = await leerClientesGoogle();

    const index = clientes.findIndex(row => {
      const celNum = (row["NUMERO WHATSAPP"] || row["NÚMERO WHATSAPP"] || "").replace(/\D/g, "");
      const ref = (row["REFERENCIA"] || "").trim();
      return referencia
        ? celNum.includes(numero) && ref === referencia
        : celNum.includes(numero);
    });

    if (index === -1) {
      console.warn("⚠️ No se encontró fila para actualizar respuesta en Google Sheets:", numero);
      return false;
    }

    const fila = index + 2;
    const values = [[respuesta, fecha, referencia]];

    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `${config.hojaExcel}!K${fila}:M${fila}`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values },
    });

    console.log(`✅ Respuesta actualizada en Google Sheets (fila ${fila})`);
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
