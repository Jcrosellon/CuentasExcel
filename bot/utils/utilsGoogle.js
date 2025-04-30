// utilsGoogle.js
const { google } = require("googleapis");
const fs = require("fs");
const path = require("path");
const { DateTime } = require("luxon");
const paths = require("../config/paths");
const config = require(paths.config);


const CREDENTIALS_PATH = paths.credentials;
if (!fs.existsSync(CREDENTIALS_PATH)) {
  console.error("❌ ERROR: No se encontró el archivo paths.credentials");
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
    const hoja = config.hojaExcel;

    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${hoja}!A2:N`,
    });

    const rows = res.data.values || [];
    const numeroLimpio = numero.replace(/\D/g, "");
    let rowIndex = -1;

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const celdaNumero = (row[10] || "").replace(/\D/g, ""); // Columna K
      if (celdaNumero.includes(numeroLimpio)) {
        rowIndex = i + 1; // SIN el +2 porque ahora usamos A1 notation (0-indexado)
        break;
      }
    }

    if (rowIndex === -1) {
      console.warn("⚠️ No se encontró fila para actualizar respuesta en Google Sheets:", numero);
      return false;
    }

    // ⬇️ Actualizar valores normalmente
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      requestBody: {
        data: [
          { range: `${hoja}!L${rowIndex + 1}`, values: [[respuesta]] },
          { range: `${hoja}!M${rowIndex + 1}`, values: [[fecha]] },
          { range: `${hoja}!N${rowIndex + 1}`, values: [[referencia]] }
        ],
        valueInputOption: "USER_ENTERED",
      },
    });

    // 🟥 Si respondió NO, colorear celda de nombre
    if (respuesta.trim().toUpperCase() === "NO") {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: SPREADSHEET_ID,
        requestBody: {
          requests: [
            {
              repeatCell: {
                range: {
                  sheetId: await obtenerSheetIdPorNombre(hoja),
                  startRowIndex: rowIndex,
                  endRowIndex: rowIndex + 1,
                  startColumnIndex: 0,
                  endColumnIndex: 1
                },
                cell: {
                  userEnteredFormat: {
                    backgroundColor: { red: 1, green: 0.8, blue: 0.8 },
                    textFormat: { bold: true }
                  }
                },
                fields: "userEnteredFormat(backgroundColor,textFormat)"
              }
            }
          ]
        }
      });

      console.log(`🟥 Nombre marcado en rojo para ${numero}`);
    }

    console.log(`✅ Respuesta actualizada en Google Sheets (fila ${rowIndex + 1})`);
    return true;
  } catch (error) {
    console.error("❌ Error actualizando respuesta en Google Sheets:", error.message);
    return false;
  }
}


async function actualizarFilaExistenteEnGoogleSheets(datos) {
  try {
    const sheets = await getSheet();
    const hoja = config.hojaExcel;

    // Leer todas las filas actuales
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${hoja}!A2:N`,
    });

    let rows = res.data.values || [];
    const numeroLimpio = datos.numero.replace(/\D/g, "");
    let rowIndex = -1;

    for (let i = 0; i < rows.length; i++) {
      const celdaNumero = (rows[i][10] || "").replace(/\D/g, "");
      const celdaCuenta = (rows[i][6] || "").toUpperCase();
      if (celdaNumero.includes(numeroLimpio) && celdaCuenta === datos.cuenta.toUpperCase()) {
        rowIndex = i + 2; // +2 porque empezamos desde A2
        break;
      }
    }

    if (rowIndex === -1) {
      console.warn("⚠️ No se encontró la fila para actualizar renovación:", datos.numero, datos.cuenta);
      return false;
    }

    const filaOriginal = rows[rowIndex - 2]; // -2 porque A2 es índice 0
    const nuevaFila = [...filaOriginal];

    nuevaFila[2] = datos.fechaInicio;     // FECHA INICIO
    nuevaFila[3] = datos.fechaFinal;      // FECHA FINAL
    nuevaFila[11] = datos.respuesta;      // RESPUESTA
    nuevaFila[12] = datos.fechaRespuesta; // FECHA RESPUESTA
    nuevaFila[13] = datos.referencia;     // COMPROBANTE

    // Primero: eliminar la fila original
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      requestBody: {
        requests: [
          {
            deleteDimension: {
              range: {
                sheetId: await obtenerSheetIdPorNombre(hoja),
                dimension: "ROWS",
                startIndex: rowIndex - 1, // -1 porque Google empieza en 0
                endIndex: rowIndex
              }
            }
          }
        ]
      }
    });

    // Segundo: volver a leer TODAS las filas actualizadas
    const res2 = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${hoja}!A2:N`,
    });
    const filasActualizadas = res2.data.values || [];

    // Calcular dónde insertar basado en nueva fecha final
    const fechaNueva = DateTime.fromFormat(nuevaFila[3], "dd/LL/yyyy");

    let insertIndex = 0;
    for (let i = 0; i < filasActualizadas.length; i++) {
      const fechaFila = DateTime.fromFormat(filasActualizadas[i][3] || "01/01/1900", "dd/LL/yyyy");
      if (fechaNueva < fechaFila) {
        insertIndex = i;
        break;
      }
      insertIndex = i + 1;
    }

    // Insertar en la posición correcta
    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: `${hoja}!A${insertIndex + 2}`,
      valueInputOption: "USER_ENTERED",
      insertDataOption: "INSERT_ROWS",
      requestBody: {
        values: [nuevaFila]
      }
    });

    console.log(`✅ Fila actualizada y reinsertada ordenadamente en la posición ${insertIndex + 2}`);
    return true;
  } catch (error) {
    console.error("❌ Error en actualizarFilaExistenteEnGoogleSheets:", error.message);
    return false;
  }
}


async function moverFilaOrdenadaPorFechaFinal(datosActualizados) {
  const sheets = await getSheet();
  const hoja = config.hojaExcel;

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${hoja}!A2:N`,
  });

  const rows = res.data.values || [];

  // Cabecera que necesitamos para mapear las filas
  const headers = [
    "NOMBRE", "ALIAS", "FECHA INICIO", "FECHA FINAL", "USUARIO", "CLAVE",
    "CUENTA", "DISPOSITIVO", "PERFIL", "VALOR", "NUMERO WHATSAPP",
    "RESPUESTA", "FECHA RESPUESTA", "COMPROBANTE"
  ];

  // Reconstruir objetos
  const objetos = rows.map((row) => {
    const obj = {};
    headers.forEach((h, i) => {
      obj[h] = row[i] || "";
    });
    return obj;
  });

  // Reemplazar el que tenga el mismo número y cuenta
  const actual = objetos.find(o =>
    o["NUMERO WHATSAPP"].replace(/\D/g, "") === datosActualizados.numero.replace(/\D/g, "") &&
    o["CUENTA"].toUpperCase() === datosActualizados.cuenta.toUpperCase()
  );

  if (actual) {
    actual["FECHA INICIO"] = datosActualizados.fechaInicio;
    actual["FECHA FINAL"] = datosActualizados.fechaFinal;
    actual["RESPUESTA"] = datosActualizados.respuesta;
    actual["FECHA RESPUESTA"] = datosActualizados.fechaRespuesta;
    actual["COMPROBANTE"] = datosActualizados.referencia;
  }

  // Ordenar por fecha final (dd/mm/yyyy)
  objetos.sort((a, b) => {
    const parse = (f) => {
      const [d, m, y] = f.split("/");
      return new Date(`${y}-${m}-${d}`);
    };

    const fechaA = parse(a["FECHA FINAL"]);
    const fechaB = parse(b["FECHA FINAL"]);
    return fechaA - fechaB;
  });

  // Convertimos de nuevo a array de arrays
  const nuevasFilas = objetos.map(obj => headers.map(h => obj[h] || ""));

  // Reescribimos TODA la hoja (desde A2)
  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: `${hoja}!A2`,
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values: nuevasFilas
    }
  });

  console.log(`📦 Fila movida ordenadamente por FECHA FINAL para ${datosActualizados.numero}`);
}

function parseFecha(fechaStr) {
  const { DateTime } = require("luxon");
  const [d, m, y] = (fechaStr || "").split("/");
  return DateTime.fromFormat(`${d}/${m}/${y}`, "dd/MM/yyyy");
}




async function agregarNuevaFilaEnGoogleSheets(pendiente) {
  try {
    const sheets = await getSheet();
    const fechaActual = DateTime.now().setZone("America/Bogota").toFormat("dd/LL/yyyy");
    const fechaFinal = DateTime.now().plus({ days: 30 }).setZone("America/Bogota").toFormat("dd/LL/yyyy");

    const nuevaFila = [
      pendiente.nombre || "",        // NOMBRE
      "",                             // ALIAS
      fechaActual,                   // FECHA INICIO
      fechaFinal,                    // FECHA FINAL
      pendiente.usuario || "",      // USUARIO
      "",                             // CLAVE
      pendiente.cuenta || "",       // CUENTA
      "",                             // DISPOSITIVO
      "1",                            // PERFIL (por defecto)
      "",                             // VALOR (puedes completarlo si tienes precio en texto del producto)
      pendiente.numero || "",        // NUMERO WHATSAPP
      "✅ Comprobante",            // RESPUESTA
      fechaActual,                   // FECHA RESPUESTA
      pendiente.referencia || ""     // COMPROBANTE
    ];

    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: `${config.hojaExcel}!A1`,
      valueInputOption: "USER_ENTERED",
      insertDataOption: "INSERT_ROWS",
      requestBody: {
        values: [nuevaFila]
      }
    });

    console.log("✅ Nueva venta registrada en Google Sheets:", pendiente);
  } catch (error) {
    console.error("❌ Error al agregar nueva fila en Google Sheets:", error.message);
  }
}

async function obtenerSheetIdPorNombre(nombreHoja) {
  const sheets = await getSheet();
  const metadata = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
  const hoja = metadata.data.sheets.find(s => s.properties.title === nombreHoja);
  return hoja?.properties.sheetId;
}


module.exports = {
  leerClientesGoogle,
  actualizarRespuestaEnGoogle,
  agregarNuevaFilaEnGoogleSheets,
  actualizarFilaExistenteEnGoogleSheets,
  moverFilaOrdenadaPorFechaFinal
};
