// configLoader.js
const fs = require("fs");

function cargarConfig() {
  try {
    const config = require("./config.json");

    if (config.useGoogleSheet) {
      if (!config.googleSheetId || typeof config.googleSheetId !== "string") {
        throw new Error("Falta 'googleSheetId' o no es válido en config.json.");
      }
    } else {
      if (!fs.existsSync(config.excelPath)) {
        throw new Error(`La ruta del Excel local no existe: ${config.excelPath}`);
      }
    }

    if (!config.adminPhone) {
      throw new Error("Falta 'adminPhone' en config.json.");
    }

    if (!config.hojaExcel) {
      throw new Error("Falta 'hojaExcel' en config.json.");
    }

    return config;
  } catch (err) {
    console.error("❌ Error cargando configuración:", err.message);
    process.exit(1);
  }
}

module.exports = cargarConfig;
