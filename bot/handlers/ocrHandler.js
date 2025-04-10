const fs = require("fs");
const { writeFile, unlink } = require("fs/promises");
const { validarComprobante } = require("../utils/ocrValidator");
const { leerClientesGoogle } = require("../utils/utilsGoogle");
const { obtenerCatalogoTexto } = require("../utils/catalogoUtils");
const { manejarRenovacion } = require("./ocrRenovacion");
const { manejarCompraNueva } = require("./ocrNuevaCompra");
const { limpiarTexto } = require("../utils/helpers");

const rutaPendienteActual = "./pendiente_actual.json";
const rutaPendientes = "./pendientes.json";

async function manejarMediaComprobante(client, msg, numero, media, cuentasUsuario, adminPhone) {
  console.log("📥 Recibiendo comprobante desde:", numero);

  const ext = media.mimetype === "image/png" ? "png" : "jpg";
  const tempPath = `./temp-${numero}.${ext}`;
  const buffer = Buffer.from(media.data, "base64");
  await writeFile(tempPath, buffer);
  console.log("🖼 Imagen guardada temporalmente:", tempPath);

  let resultado;
try {
  resultado = await validarComprobante(tempPath);
} catch (err) {
  await msg.reply("⚠️ No pudimos leer la imagen. Asegúrate que el pantallazo esté claro y vuelve a intentarlo.");
  await unlink(tempPath).catch(() => {});
  return;
}

const referenciaDetectada = resultado.referenciaDetectada?.trim();
if (!referenciaDetectada) {
  await msg.reply("⚠️ No se detectó ninguna referencia en tu comprobante.");
  await unlink(tempPath).catch(() => {});
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
  await msg.reply(`✅ Este comprobante ya fue confirmado el *${fechaConfirmacion}*.\nNo tienes servicios pendientes por renovar.`);
  await client.sendMessage(numero + "@c.us", "🎁 Aquí tienes nuestro catálogo actualizado por si deseas adquirir un nuevo servicio:");
  await client.sendMessage(numero + "@c.us", obtenerCatalogoTexto());
  await unlink(tempPath).catch(() => {});
  return; // 👈 Aquí se corta el flujo
}


  const pendientes = fs.existsSync(rutaPendientes) ? JSON.parse(fs.readFileSync(rutaPendientes)) : [];
  const pendienteRenovacion = pendientes.find(p => p.numero === numero && !p.confirmado);

  if (pendienteRenovacion) {
    console.log("♻️ Renovación detectada para:", numero);
    await manejarRenovacion({ client, msg, numero, media, resultado, referenciaDetectada, adminPhone, tempPath });
    return;
  }

  if (fs.existsSync(rutaPendienteActual)) {
    const pendienteActual = JSON.parse(fs.readFileSync(rutaPendienteActual));
    const mismoNumero = pendienteActual.numero === numero;
  
    if (mismoNumero && pendienteActual.confirmado) {
      console.log("⚠️ Comprobante ya confirmado en pendiente_actual. Ignorando reenvío.");
      await msg.reply(`✅ Ya procesamos tu pago anterior. Si deseas comprar otro servicio, revisa el catálogo 👇`);
      await client.sendMessage(numero + "@c.us", "🎁 Aquí tienes nuestro catálogo actualizado:");
      await client.sendMessage(numero + "@c.us", obtenerCatalogoTexto());
      await unlink(tempPath).catch(() => {});
      
      // 🔒 Protegido con existsSync por si el archivo ya no existe
      if (fs.existsSync(rutaPendienteActual)) {
        fs.unlinkSync(rutaPendienteActual); // ✅ limpia el archivo para evitar futuras confusiones
      }
  
      return;
    }
  }
  
  

  console.log("🛑 No se encontró registro previo para este comprobante.");
  await msg.reply("⚠️ No encontramos datos previos de tu compra. Escribe nuevamente el número del producto que deseas.");
  await unlink(tempPath).catch(() => {});
}

module.exports = {
  manejarMediaComprobante,
};
