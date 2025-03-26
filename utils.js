const xlsx = require("xlsx");
const config = require("./config.json");

function leerClientes() {
  const workbook = xlsx.readFile(config.excelPath);
  const hoja = workbook.Sheets[config.hojaExcel]; // Usa la hoja "miscuentas"
  return xlsx.utils.sheet_to_json(hoja);
}

module.exports = { leerClientes };
