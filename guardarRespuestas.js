// guardarRespuestas.js
const ExcelJS = require('exceljs');
const config = require("./config.json");

/**
 * Actualiza la fila que coincida con "numero" en la columna NUMERO WHATSAPP,
 * poniendo en RESPUESTA y FECHA RESPUESTA, y opcionalmente COMPROBANTE.
 * Guarda "✅ Sí" o "❌ No" como respuesta. Si viene otro valor (como "✅ Comprobante"), no lo guarda.
 *
 * @param {string} numero - El número sin @c.us (ej: "3112503929")
 * @param {string} respuesta - Ej: "✅ Sí" o "❌ No"
 * @param {string} fecha - Ej: "2025-03-27"
 * @param {string} comprobante - (opcional) La referencia extraída
 */
const actualizarRespuestaEnExcel = async (numero, respuesta, fecha, comprobante = "") => {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(config.excelPath);

  const hoja = workbook.getWorksheet(config.hojaExcel);
  if (!hoja) {
    throw new Error(`No se encontró la hoja: ${config.hojaExcel}`);
  }

  // Columnas
  const headerRow = hoja.getRow(1).values;
  const colNumero = headerRow.indexOf("NUMERO WHATSAPP");
  const colResp = headerRow.indexOf("RESPUESTA");
  const colFechaResp = headerRow.indexOf("FECHA RESPUESTA");
  const colComprobante = headerRow.indexOf("COMPROBANTE");

  if (colNumero === -1 || colResp === -1 || colFechaResp === -1) {
    throw new Error("❌ Faltan columnas obligatorias en el Excel.");
  }

  hoja.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;

    const celdaNumero = row.getCell(colNumero).value?.toString();
    if (celdaNumero && celdaNumero.includes(numero)) {
      // Guardamos solo SI o NO como respuesta
      if (respuesta === "✅ Sí" || respuesta === "❌ No") {
        row.getCell(colResp).value = respuesta;
        row.getCell(colFechaResp).value = fecha;
      }

      // Comprobante va aparte si viene como parámetro
      if (colComprobante !== -1 && comprobante) {
        row.getCell(colComprobante).value = comprobante;
      }
    }
  });

  await workbook.xlsx.writeFile(config.excelPath);
  console.log(`🟢 Excel actualizado con respuesta de ${numero}, comprobante: ${comprobante}`);
};

module.exports = { actualizarRespuestaEnExcel };
