const ExcelJS = require('exceljs');
const config = require("./config.json");

const actualizarRespuestaEnExcel = async (numero, respuesta, fecha) => {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(config.excelPath);
  const hoja = workbook.getWorksheet("miscuentas"); // ← nombre exacto


  // Asegurar que las columnas existen
  const colRespuesta = hoja.getRow(1).values.indexOf("Respuesta");
  const colFecha = hoja.getRow(1).values.indexOf("Fecha Respuesta");
  const colNumero = hoja.getRow(1).values.indexOf("Número WhatsApp");

  if (colRespuesta === -1 || colFecha === -1 || colNumero === -1) {
    throw new Error("❌ Columnas 'Número WhatsApp', 'Respuesta' o 'Fecha Respuesta' no encontradas");
  }

  hoja.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return; // Saltar encabezado
    const celdaNumero = row.getCell(colNumero).value?.toString();
    if (celdaNumero?.includes(numero)) {
      row.getCell(colRespuesta).value = respuesta;
      row.getCell(colFecha).value = fecha;
    }
  });

  await workbook.xlsx.writeFile(config.excelPath);

  console.log(`🟢 Excel actualizado con respuesta de ${numero}`);
};

module.exports = { actualizarRespuestaEnExcel };
