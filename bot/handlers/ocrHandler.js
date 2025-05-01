const fs = require("fs");
const { writeFile, unlink } = require("fs/promises");
const { v4: uuidv4 } = require("uuid");
const { DateTime } = require("luxon");
const { MessageMedia } = require('whatsapp-web.js'); // 👈 << AGREGA ESTO AQUÍ
const { validarComprobante } = require("../utils/ocrValidator");
const { leerClientesGoogle } = require("../utils/utilsGoogle");
const { obtenerCatalogoTexto } = require("../utils/catalogoUtils");
const { manejarRenovacion } = require("./ocrRenovacion");
const { manejarCompraNueva } = require("./ocrNuevaCompra");
const { limpiarTexto } = require("../utils/helpers");
const { moverFilaOrdenadaPorFechaFinal } = require("../utils/utilsGoogle");
const paths = require("../config/paths");
const rutaPendienteActual = paths.pendienteActual;
const rutaPendienteNuevo = paths.pendienteNuevo;
const rutaPendientes = paths.pendientes;

function formatearNumeroWhatsapp(numero) {
  return (numero || "").replace(/\D/g, "") + "@c.us";
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function manejarMediaComprobante(client, msg, numero, media, cuentasUsuario, adminPhone) {
  console.log("📥 Recibiendo comprobante desde:", numero);

  const ext = media.mimetype === "image/png" ? "png" : "jpg";
  const uniqueId = uuidv4();
  const tempPath = `./temp-${numero}-${uniqueId}.${ext}`;
  const buffer = Buffer.from(media.data, "base64");
  await writeFile(tempPath, buffer);
  console.log("🖼 Imagen guardada temporalmente:", tempPath);

  let resultado;

  try {
    resultado = await validarComprobante(tempPath);

    // Verificación de referencia
    const referenciaDetectada = resultado.referenciaDetectada?.trim();
    if (!referenciaDetectada || referenciaDetectada.length < 3) {
      await msg.reply("⚠️ No se detectó ninguna referencia válida en tu comprobante.");
      return;
    }

    // Verificación de valor
    if (!resultado.valorDetectado || resultado.valorDetectado < 1000) {
      await msg.reply("⚠️ El valor detectado es muy bajo o inválido. Asegúrate de que el monto sea legible.");
      return;
    }

    const refLimpia = limpiarTexto(referenciaDetectada);
    console.log("🔍 Referencia limpia detectada:", refLimpia);

    const clientesSheet = await leerClientesGoogle();
    console.log("📄 Total de filas cargadas desde Google Sheets:", clientesSheet.length);

    const filaCoincidente = clientesSheet.find(c => {
      const refDoc = limpiarTexto(c["COMPROBANTE"]);
      const numDoc = (c["NUMERO WHATSAPP"] || "").replace(/\D/g, "");
      const numCliente = numero.replace(/\D/g, "");
      return refDoc === refLimpia && numDoc.includes(numCliente);
    });

    if (filaCoincidente) {
      const fechaConfirmacion = filaCoincidente["FECHA RESPUESTA"] || "fecha desconocida";
      console.log("✅ Comprobante ya confirmado el:", fechaConfirmacion);
      await msg.reply(`✅ Este comprobante ya fue confirmado el *${fechaConfirmacion}*.`);
      await client.sendMessage(numero + "@c.us", "🎁 Aquí tienes nuestro catálogo actualizado por si deseas adquirir un nuevo servicio:");
      await client.sendMessage(numero + "@c.us", obtenerCatalogoTexto());
      return;
    }

    const { cargarJsonSeguro } = require("../utils/helpers"); 
const pendientes = cargarJsonSeguro(rutaPendientes);

const pendienteRenovacion = pendientes.find(p => p.numero === numero && !p.confirmado);
console.log("🧪 Buscando renovación en pendientes para:", numero);
if (pendienteRenovacion && referenciaDetectada) {
  const refActual = (pendienteRenovacion.referencia || "").toLowerCase();
  const esProvisional = 
    refActual.startsWith("auto-") ||
    refActual.length < 5 ||
    ["logy", "test", "none", "error", "pendiente"].includes(refActual);

  if (esProvisional) {
    console.log("🛠 Actualizando referencia provisional:", refActual, "→", referenciaDetectada);
    pendienteRenovacion.referencia = referenciaDetectada;
    fs.writeFileSync(paths.pendientes, JSON.stringify(pendientes, null, 2));
  }
}


console.log("🔍 Total pendientes:", pendientes.length);
console.log("📋 Coincidencia encontrada:", pendienteRenovacion);
    
if (pendienteRenovacion) {
  console.log("♻️ Renovación detectada para:", numero);

  const valorPendiente = Number((pendienteRenovacion.valor || "0").replace(/\./g, "").replace(/,/g, ""));

  const valorDetectado = resultado.valorDetectado || 0;

  const diferencia = Math.abs(valorPendiente - valorDetectado);

  // 🔥 AQUÍ declaras correctamente valorValido
  const valorValido = diferencia <= 100; // tolerancia de 100 pesos (opcional)

  console.log(`💰 Valor pendiente: ${valorPendiente}, valor detectado: ${valorDetectado}, diferencia: ${diferencia}, válido: ${valorValido}`);

  if (valorDetectado < valorPendiente) {
    await msg.reply(`⚠️ El valor del comprobante no coincide.\n\nEsperábamos: $${valorPendiente.toLocaleString()}\nDetectamos: $${valorDetectado.toLocaleString()}\n\nPor favor revisa el pago y vuelve a enviar el comprobante. 🙏`);
    return;
 }
 

  const nombreCliente = pendienteRenovacion.nombre || "Cliente desconocido";
  const cuentaCliente = pendienteRenovacion.cuenta || "Cuenta desconocida";
  const usuarioCliente = pendienteRenovacion.usuario || "-";
  const referenciaCliente = referenciaDetectada || "Referencia desconocida";
  const tipoOperacion = "Renovación"; // 🚀 Aquí puede ser Renovación o Compra, según tu flujo
  
  const numeroAdmin = formatearNumeroWhatsapp(adminPhone);

// 1. Primero, mandas el mensaje de texto
await client.sendMessage(numeroAdmin, 
  `🧾 *Pago recibido de ${nombreCliente}*\n\n` +
  `🆔 *Referencia:* ${referenciaCliente}\n` +
  `📌 *Cuenta:* ${cuentaCliente} (usuario: ${usuarioCliente})\n` +
  `🔁 *Tipo:* ${tipoOperacion}`
);

await delay(700); // 🔥 Pequeño delay para asegurar envío ordenado

// 2. Luego, mandas la imagen del comprobante
const media = MessageMedia.fromFilePath(tempPath);
await client.sendMessage(numeroAdmin, media);

await delay(1000); // 🔥 Otro pequeño delay para cargar bien la imagen

await client.sendMessage(numeroAdmin, `CONFIRMADO ${referenciaCliente}`);
await delay(500); // Pequeño delay para que no los envíe juntos
await client.sendMessage(numeroAdmin, `RECHAZADO ${referenciaCliente}`);

await msg.reply("✅ Hemos recibido tu comprobante. Estamos validándolo, pronto recibirás la confirmación. ⏳");

return;
}

    // Validación de compra nueva en pendiente_actual
    if (fs.existsSync(rutaPendienteActual)) {
      let pendienteActual = {};
try {
  const contenidoActual = fs.readFileSync(paths.pendienteActual, "utf8").trim();
  pendienteActual = contenidoActual ? JSON.parse(contenidoActual) : {};
} catch (err) {
  console.error("⚠️ Error leyendo pendiente_actual.json:", err.message);
  pendienteActual = {};
}


      const mismoNumero = pendienteActual.numero === numero;

      if (mismoNumero && pendienteActual.confirmado) {
        console.log("⚠️ Comprobante ya confirmado en pendiente_actual. Ignorando reenvío.");
        await msg.reply(`✅ Ya procesamos tu pago anterior. Si deseas comprar otro servicio, revisa el catálogo 👇`);
        await client.sendMessage(numero + "@c.us", "🎁 Aquí tienes nuestro catálogo actualizado:");
        await client.sendMessage(numero + "@c.us", obtenerCatalogoTexto());
        fs.unlinkSync(rutaPendienteActual);
        return;
      }

      if (mismoNumero && !pendienteActual.confirmado) {
        console.log("🆕 Se detectó compra nueva activa en pendiente_actual para:", numero);
        await manejarCompraNueva({ client, msg, numero, media, resultado, referenciaDetectada, adminPhone, tempPath });
        return;
      }
    }

    // Validación de compra nueva en pendiente_nuevo
    if (fs.existsSync(rutaPendienteNuevo)) {
      let pendienteNuevo = {};
try {
  const contenidoNuevo = fs.readFileSync(paths.pendienteNuevo, "utf8").trim();
  pendienteNuevo = contenidoNuevo ? JSON.parse(contenidoNuevo) : {};
} catch (err) {
  console.error("⚠️ Error leyendo pendiente_nuevo.json:", err.message);
  pendienteNuevo = {};
}


      const mismoNumeroNuevo = pendienteNuevo.numero === numero;

      if (mismoNumeroNuevo && !pendienteNuevo.confirmado) {
        console.log("🆕 Se detectó compra nueva activa en pendiente_nuevo para:", numero);
        await manejarCompraNueva({ client, msg, numero, media, resultado, referenciaDetectada, adminPhone, tempPath });
        return;
      }
    }

    console.log("🛑 No se encontró registro previo para este comprobante.");
    await msg.reply("⚠️ No encontramos datos previos de tu compra. Escribe nuevamente el número del producto que deseas.");
  } catch (err) {
    console.error("❌ Error al procesar comprobante:", err.message);
    await msg.reply("⚠️ Ocurrió un error al procesar tu comprobante. Inténtalo nuevamente.");
  } finally {
    await unlink(tempPath).catch(() => {});
  }

  
}



module.exports = {
  manejarMediaComprobante,
  delay,
};
