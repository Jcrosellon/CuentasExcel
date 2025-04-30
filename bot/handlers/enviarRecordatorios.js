const fs = require("fs");
const { DateTime } = require("luxon");

const paths = require('../config/paths');
const rutaPendientesSI = paths.pendientesSI;


async function enviarRecordatorios(client) {
  console.log("📦 Iniciando ejecución de enviarRecordatorios.js...");

  if (!fs.existsSync(rutaPendientesSI)) {
    console.log("❌ No existe el archivo pendientes_si.json");
    return;
  }

  const contenido = fs.readFileSync(paths.pendientesSI, "utf8").trim();


  if (!contenido) {
    console.log("⚠️ El archivo pendientes_si.json está vacío.");
    return;
  }

  let pendientesSI = {};
  try {
    pendientesSI = JSON.parse(contenido);
    console.log("✅ pendientes_si.json cargado correctamente.");
  } catch (err) {
    console.error("❌ Error al parsear pendientes_si.json:", err.message);
    return;
  }

  const ahora = DateTime.now().setZone("America/Bogota");

  let encontrados = 0;

  for (const numero in pendientesSI) {
    const p = pendientesSI[numero];

    console.log(`🔍 Revisando número: ${numero}`);
    console.log(`   👉 Intención: ${p.intencion}, Enviado: ${p.enviado}, Confirmado: ${p.confirmado || false}, Fecha: ${p.fecha}`);

    if (p.intencion === "si" && p.enviado && p.fecha && !p.confirmado) {
      const fechaRespuesta = DateTime.fromISO(p.fecha).setZone("America/Bogota");
      const horasPasadas = ahora.diff(fechaRespuesta, "hours").hours;

      console.log(`   ⏱ Han pasado ${horasPasadas.toFixed(2)} horas desde la respuesta.`);

      if (horasPasadas >= 0) {
        const mensaje = `🔔 *Recordatorio de pago*
      
      Hola, hace un momento respondiste que *sí continuabas*, pero aún no hemos recibido tu comprobante de pago.
      
      💳 Puedes realizar el pago a *Nequi o Daviplata: 3183192913* y enviarlo por aquí para procesarlo. Estoy atento. 🙌`;
      
        await client.sendMessage(numero + "@c.us", mensaje);
        console.log(`✅ Recordatorio enviado a ${numero}`);
        enviados++;
      }
      
    }
  }

  if (encontrados === 0) {
    console.log("📭 No se encontraron clientes para enviar recordatorios.");
  } else {
    console.log(`📨 Recordatorios enviados a ${encontrados} cliente(s).`);
  }
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
