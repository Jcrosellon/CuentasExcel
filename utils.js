// utils.js
const xlsx = require("xlsx");
const path = require("path");
const fs = require("fs");

// ✅ Cargar y validar configuración
let config;
try {
  config = require("./config.json");
  if (config.useGoogleSheet && !config.googleSheetId) {
    throw new Error("Falta 'googleSheetId' en config.json.");
  }
  if (!config.hojaExcel || !config.adminPhone) {
    throw new Error("Faltan claves obligatorias: 'hojaExcel' o 'adminPhone'.");
  }
  if (!config.useGoogleSheet && (!config.excelPath || !fs.existsSync(config.excelPath))) {
    throw new Error(`Excel local no encontrado en: ${config.excelPath}`);
  }
} catch (err) {
  console.error("❌ Error en configuración:", err.message);
  process.exit(1);
}

const CREDENTIALS_PATH = path.join(__dirname, "credentials.json");
if (!fs.existsSync(CREDENTIALS_PATH)) {
  console.error("❌ No se encontró el archivo credentials.json");
  process.exit(1);
}

async function leerClientes() {
  return config.useGoogleSheet
    ? await leerDesdeGoogleSheets()
    : leerDesdeExcelLocal();
}

function leerDesdeExcelLocal() {
  try {
    const workbook = xlsx.readFile(config.excelPath);
    const hoja = workbook.Sheets[config.hojaExcel];
    if (!hoja) {
      console.warn("❌ No se encontró la hoja:", config.hojaExcel);
      return [];
    }
    const data = xlsx.utils.sheet_to_json(hoja);
    console.log("📄 Filas leídas desde Excel:", data.length);
    return data;
  } catch (error) {
    console.error("❌ Error leyendo Excel local:", error.message);
    return [];
  }
}

async function leerDesdeGoogleSheets() {
  try {
    const { google } = require("googleapis");
    const auth = new google.auth.GoogleAuth({
      keyFile: CREDENTIALS_PATH,
      scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
    });

    const sheets = google.sheets({ version: "v4", auth: await auth.getClient() });
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: config.googleSheetId,
      range: `${config.hojaExcel}!A1:Z1000`,
    });

    const valores = response.data.values || [];
    const [headers, ...filas] = valores;

    return filas.map(fila => {
      const obj = {};
      headers.forEach((col, i) => {
        obj[col.trim()] = fila[i] || "";
      });
      return obj;
    });
  } catch (error) {
    console.error("❌ Error leyendo Google Sheet:", error.message);
    return [];
  }
}

module.exports = { leerClientes };
