const ExcelJS = require("exceljs");
const { DateTime } = require("luxon");
const config = require("./config.json");

async function actualizarRespuestaEnExcel(numero, respuestaTexto, fechaActual, referencia) {
  // Tu lógica para actualizar Excel
}

// 👇 ESTA ES LA QUE NECESITAS EXPORTAR
async function actualizarComprobanteFila(numero, nuevaRef) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(config.excelPath);
  const hoja = workbook.getWorksheet(config.hojaExcel);
  if (!hoja) return false;

  const header = hoja.getRow(1).values;
  const colNumero = header.indexOf("NUMERO WHATSAPP");
  const colComprobante = header.indexOf("COMPROBANTE");
  const colFechaInicio = header.indexOf("FECHA INICIO");
  const colFechaFinal = header.indexOf("FECHA FINAL");

  let cambio = false;

  hoja.eachRow((row, i) => {
    if (i === 1) return;
    const celdaNumero = row.getCell(colNumero).value?.toString() || "";
    if (celdaNumero.includes(numero)) {
      const refActual = row.getCell(colComprobante).value?.toString().trim() || "";
      if (refActual.toLowerCase() !== nuevaRef.toLowerCase()) {
        row.getCell(colComprobante).value = nuevaRef;

        // Lógica de fechas
        if (colFechaInicio !== -1 && colFechaFinal !== -1) {
          const val = row.getCell(colFechaFinal).value;
          let dtFinal;
          if (val instanceof Date) {
            dtFinal = DateTime.fromJSDate(val).setZone("America/Bogota");
          } else if (typeof val === "number") {
            dtFinal = DateTime.fromJSDate(new Date((val - 25569) * 86400 * 1000)).setZone("America/Bogota");
          } else if (typeof val === "string") {
            dtFinal = DateTime.fromFormat(val, "dd/LL/yyyy", { zone: "America/Bogota" });
            if (!dtFinal.isValid) dtFinal = DateTime.fromFormat(val, "yyyy-MM-dd", { zone: "America/Bogota" });
          }

          if (dtFinal?.isValid) {
            row.getCell(colFechaInicio).value = dtFinal.toFormat("dd/MM/yyyy");
            const nueva = sumarMesClampeando(dtFinal);
            row.getCell(colFechaFinal).value = nueva.toFormat("dd/MM/yyyy");
          }
        }

        cambio = true;
      }
    }
  });

  if (cambio) {
    await workbook.xlsx.writeFile(config.excelPath);
    console.log("🟢 Excel actualizado con comprobante:", nuevaRef);
  }

  return cambio;
}

function sumarMesClampeando(dtOriginal) {
  let newMonth = dtOriginal.month + 1;
  let newYear = dtOriginal.year;
  if (newMonth > 12) {
    newMonth = 1;
    newYear++;
  }
  const temp = DateTime.local(newYear, newMonth, 1).setZone(dtOriginal.zone);
  const daysInNextMonth = temp.daysInMonth;
  const newDay = Math.min(dtOriginal.day, daysInNextMonth);

  return DateTime.local(newYear, newMonth, newDay).setZone(dtOriginal.zone).set({ hour: 12 });
}

module.exports = {
  actualizarRespuestaEnExcel,
  actualizarComprobanteFila // 👈 ASEGÚRATE DE QUE ESTA LÍNEA ESTÉ PRESENTE
};
