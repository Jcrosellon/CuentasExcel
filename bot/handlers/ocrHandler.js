// /bot/handlers/ocrHandler.js
const fs = require("fs");
const { writeFile } = require("fs/promises");
const { DateTime } = require("luxon");
const { validarComprobante } = require("../utils/ocrValidator");


const { MessageMedia } = require("whatsapp-web.js");
const { formatearPesosColombianos } = require("../utils/helpers");
const { leerClientesGoogle  } = require("../utils/utilsGoogle")

const rutaPendientes = "./pendientes.json";
const rutaMensajesEnviados = "./mensajesEnviados.json";

async function manejarMediaComprobante(client, msg, numero, media, cuentasUsuario, adminPhone) {
  const ext = media.mimetype === "image/png" ? "png" : "jpg";
  const tempPath = `./temp-${numero}.${ext}`;
  const buffer = Buffer.from(media.data, "base64");
  await writeFile(tempPath, buffer);

  let clienteData = cuentasUsuario[0];

  if (!clienteData) {
    const pendientes = fs.existsSync(rutaPendientes) ? JSON.parse(fs.readFileSync(rutaPendientes)) : [];
    const pendienteCliente = pendientes.find(p => p.numero === numero && !p.confirmado);

    if (pendienteCliente) {
      clienteData = {
        NOMBRE: pendienteCliente.nombre || "Nuevo Cliente",
        CUENTA: pendienteCliente.cuenta || "DESCONOCIDA",
        USUARIO: pendienteCliente.usuario || "",
        VALOR: pendienteCliente.valor || "20000"
      };
    } else {
      await msg.reply("⚠️ No encontramos datos previos de tu compra. Escribe nuevamente el número del producto que deseas.");
      return;
    }
  }

  const valorEsperado = (clienteData["VALOR"] || clienteData.valor || "20000").toString().replace(/\./g, "");

  let resultado;
  try {
    resultado = await validarComprobante(tempPath, valorEsperado);

    const valorEsperadoNum = parseFloat(valorEsperado);
    const valorDetectado = resultado.valorDetectado || 0;

    if (valorDetectado === 0 || isNaN(valorDetectado)) {
      await msg.reply("⚠️ No pudimos detectar un valor de pago en el comprobante. Asegúrate de que el monto esté visible.");
      await fs.promises.unlink(tempPath).catch(() => {});
      return;
    }

    if (valorDetectado < valorEsperadoNum) {
      await msg.reply(`❌ Pago rechazado, tu pago es: *${formatearPesosColombianos(valorEsperadoNum)}*.`);
      await fs.promises.unlink(tempPath).catch(() => {});
      return;
    }
  } catch (err) {
    await msg.reply("⚠️ No pudimos leer la imagen. Asegúrate que el pantallazo esté claro y vuelve a intentarlo.");
    await fs.promises.unlink(tempPath).catch(() => {});
    return;
  }

  await fs.promises.unlink(tempPath).catch(() => {});

  if (!resultado.valido) {
    msg.reply("⚠️ No pudimos validar tu comprobante. Asegúrate que el pantallazo esté claro y vuelve a intentarlo.");
    return;
  }

  const nuevaReferencia = (resultado.referenciaDetectada || "").trim();
  let pendientes = fs.existsSync(rutaPendientes) ? JSON.parse(fs.readFileSync(rutaPendientes)) : [];
  if (pendientes.some(p => p.referencia === nuevaReferencia)) {
    msg.reply(`❌ Este comprobante no es válido (Ref: ${nuevaReferencia}).\nPago rechazado.`);
    return;
  }

  const mensajeAdmin = `🧾 *Pago recibido de ${clienteData["NOMBRE"]}*\n` +
    `🧩 Referencia: ${nuevaReferencia}\n` +
    `📌 Cuenta: ${clienteData["CUENTA"]} (usuario: ${clienteData["USUARIO"]})\n\n` +
    `✅ Para *confirmar* este pago responde: *CONFIRMADO* o ✅\n❌ Para *rechazarlo* responde: *RECHAZADO* o ❌`;

  await client.sendMessage(adminPhone, mensajeAdmin);
  await client.sendMessage(adminPhone, media, { caption: "🖼 Comprobante adjunto" });
  msg.reply("🕓 Comprobante enviado para validación. Te notificaremos pronto. 🙌");

  pendientes.push({
    numero,
    referencia: nuevaReferencia,
    fecha: DateTime.now().toISO(),
    nombre: clienteData["NOMBRE"],
    cuenta: clienteData["CUENTA"],
    usuario: clienteData["USUARIO"],
    imagen: tempPath,
    esNuevo: false
  });
  fs.writeFileSync(rutaPendientes, JSON.stringify(pendientes, null, 2));
  console.log("📩 Pendiente agregado para revisión:", nuevaReferencia);
}

async function reanalizarUltimoPendiente(client, adminPhone) {
    const rutaPendientes = "./pendientes.json";
    const { validarComprobante } = require("../utils/ocrValidator");


    const { leerClientesGoogle  } = require("../utils/utilsGoogle")
    const fs = require("fs");
    const { MessageMedia } = require("whatsapp-web.js");
    const { DateTime } = require("luxon");
  
    const pendientes = fs.existsSync(rutaPendientes)
      ? JSON.parse(fs.readFileSync(rutaPendientes))
      : [];
  
    if (pendientes.length === 0) {
      await client.sendMessage(adminPhone, "⚠️ No hay pendientes guardados para analizar.");
      return;
    }
  
    const ultimo = pendientes[pendientes.length - 1];
    if (!ultimo.imagen || !fs.existsSync(ultimo.imagen)) {
      await client.sendMessage(adminPhone, "⚠️ No se encontró la imagen del último pendiente.");
      return;
    }
  
    await client.sendMessage(adminPhone, "🔁 Reanalizando el último pantallazo...");
  
    try {
      const clientes = await leerClientes();
      const clienteRelacionado = clientes.find(c =>
        (c["NUMERO WHATSAPP"]?.toString() || "").includes(ultimo.numero)
      );
  
      const valorEsperado = clienteRelacionado
        ? clienteRelacionado["VALOR"]?.toString().replace(/\./g, "")
        : ultimo.valor || "20000";
  
      const resultado = await validarComprobante(ultimo.imagen, valorEsperado);
  
      if (!resultado.valido) {
        await client.sendMessage(adminPhone, "❌ OCR no logró validar el comprobante nuevamente.");
        return;
      }
  
      await client.sendMessage(adminPhone, `🧾 Referencia: ${resultado.referenciaDetectada}\n💵 Valor: ${resultado.valorDetectado}`);
      const media = new MessageMedia("image/jpeg", fs.readFileSync(ultimo.imagen).toString("base64"));
      await client.sendMessage(adminPhone, media, {
        caption: "🖼 Comprobante reanalizado"
      });
    } catch (err) {
      console.error("❌ Error reanalizando pantallazo:", err);
      await client.sendMessage(adminPhone, "❌ Hubo un error al analizar el pantallazo.");
    }
  }
  

  module.exports = {
    manejarMediaComprobante,
    reanalizarUltimoPendiente
  };
  