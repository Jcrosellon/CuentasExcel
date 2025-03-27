const xlsx = require("xlsx");
const config = require("./config.json");

function leerClientes() {
  try {
    console.log("Intentando leer Excel:", config.excelPath);
    const workbook = xlsx.readFile(config.excelPath);
    console.log("Hojas en el archivo:", workbook.SheetNames);

    console.log(`-> Buscando hoja: "${config.hojaExcel}"...`);
    const hoja = workbook.Sheets[config.hojaExcel];
    if (!hoja) {
      console.log("❌ No existe la hoja con ese nombre en el Excel.");
      return [];
    }

    // Convertimos la hoja a JSON
    const data = xlsx.utils.sheet_to_json(hoja);
    console.log("Leídas", data.length, "filas de Excel.");
    return data;
  } catch (error) {
    console.error("Error leyendo el Excel:", error);
    return [];
  }
}

module.exports = { leerClientes };
