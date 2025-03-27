// guardarRespuestas.js
const ExcelJS = require('exceljs');
const config = require("./config.json");

/**
 * Actualiza la fila que coincida con "numero" en la columna NUMERO WHATSAPP,
 * poniendo en RESPUESTA y FECHA RESPUESTA, y opcionalmente COMPROBANTE.
 *
 * @param {string} numero - El número sin @c.us (ej: "3112503929")
 * @param {string} respuesta - Ej: "✅ Comprobante"
 * @param {string} fecha - Ej: "2025-03-27"
 * @param {string} comprobante - (opcional) La referencia extraída
 */
const actualizarRespuestaEnExcel = async (numero, respuesta, fecha, comprobante="") => {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(config.excelPath);

  const hoja = workbook.getWorksheet(config.hojaExcel);
  if (!hoja) {
    throw new Error(`No se encontró la hoja: ${config.hojaExcel}`);
  }

  // Hallar índices de columna en la fila 1
  const headerRow = hoja.getRow(1).values; 
  const colNumero = headerRow.indexOf("NUMERO WHATSAPP");
  const colResp = headerRow.indexOf("RESPUESTA");
  const colFechaResp = headerRow.indexOf("FECHA RESPUESTA");
  const colComprobante = headerRow.indexOf("COMPROBANTE"); // Nueva columna

  if (colNumero === -1) {
    throw new Error("❌ No existe la columna 'NUMERO WHATSAPP'.");
  }
  if (colResp === -1) {
    throw new Error("❌ No existe la columna 'RESPUESTA'.");
  }
  if (colFechaResp === -1) {
    throw new Error("❌ No existe la columna 'FECHA RESPUESTA'.");
  }
  // colComprobante podría ser -1 si no la has creado en Excel. Si no la tienes, lo ignoramos.

  // Recorremos las filas en busca de la que coincida con 'numero'
  hoja.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return; // encabezado

    const celdaNumero = row.getCell(colNumero).value?.toString();
    if (celdaNumero && celdaNumero.includes(numero)) {
      row.getCell(colResp).value = respuesta;
      row.getCell(colFechaResp).value = fecha;

      // Si existe la columna COMPROBANTE y tienes referencia
      if (colComprobante !== -1 && comprobante) {
        row.getCell(colComprobante).value = comprobante;
      }
    }
  });

  await workbook.xlsx.writeFile(config.excelPath);
  console.log(`🟢 Excel actualizado con respuesta de ${numero}, comprobante: ${comprobante}`);
};

module.exports = { actualizarRespuestaEnExcel };
