const fs = require("fs");
const { DateTime } = require("luxon");
const paths = require('../config/paths');
const rutaRespuestas = paths.respuestas;

async function enviarRecordatorios(client) {
  console.log("📦 Iniciando ejecución de enviarRecordatorios.js...");

  if (!fs.existsSync(rutaRespuestas)) {
    console.log("❌ No existe el archivo respuestas.json");
    return;
  }

  const contenido = fs.readFileSync(rutaRespuestas, "utf8").trim();

  if (!contenido) {
    console.log("⚠️ El archivo respuestas.json está vacío.");
    return;
  }

  let respuestas = [];
  try {
    respuestas = contenido ? normalizarRespuestas(JSON.parse(contenido)) : [];
  } catch (err) {
    console.error("⚠️ Error leyendo respuestas.json:", err.message);
    respuestas = [];
  }

  const ahora = DateTime.now().setZone("America/Bogota");
  let encontrados = 0;

  let nuevasRespuestas = [];

for (const p of respuestas) {
  const numero = p.numero;

  if (
    p.respuesta?.toLowerCase() === "si" &&
    p.fecha &&
    !p.confirmado
  ) {
    const fechaRespuesta = DateTime.fromISO(p.fecha).setZone("America/Bogota");
    const horasPasadas = ahora.diff(fechaRespuesta, "hours").hours;

    if (horasPasadas >= 0) {
      const mensaje = `🔔 *Recordatorio de pago*

Hola, hace un momento respondiste que *sí continuabas*, pero aún no hemos recibido tu comprobante de pago.

💳 Puedes realizar el pago a *Nequi o Daviplata: 3183192913* y enviarlo por aquí para procesarlo. Estoy atento. 🙌`;

      await client.sendMessage(numero + "@c.us", mensaje);
      console.log(`✅ Recordatorio enviado a ${numero}`);
      encontrados++;
      continue; // <- lo excluye del nuevo array
    }
  }

  // Si no se envió, mantenerlo en la lista
  nuevasRespuestas.push(p);
}

// Guardar los que aún quedan pendientes
fs.writeFileSync(rutaRespuestas, JSON.stringify(nuevasRespuestas, null, 2));


  if (encontrados === 0) {
    console.log("📭 No se encontraron clientes para enviar recordatorios.");
  } else {
    console.log(`📨 Recordatorios enviados a ${encontrados} cliente(s).`);
  }
}

function normalizarRespuestas(respuestas) {
  if (Array.isArray(respuestas)) {
    return respuestas;
  }
  return Object.keys(respuestas).map(numero => ({
    numero,
    ...respuestas[numero]
  }));
}

// Si se ejecuta directamente
if (require.main === module) {
  const client = require("../clientConfig");

  client.on("ready", async () => {
    console.log("✅ Cliente conectado. Ejecutando recordatorios...");
    await enviarRecordatorios(client);
    process.exit();
  });

  client.initialize();
}

module.exports = { enviarRecordatorios };
