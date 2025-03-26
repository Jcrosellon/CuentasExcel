// ✅ index.js
const { actualizarRespuestaEnExcel } = require('./guardarRespuestas');
const { DateTime } = require("luxon");
const cron = require("node-cron");
const qrcode = require("qrcode-terminal");
const { Client, LocalAuth } = require("whatsapp-web.js");
const { leerClientes } = require("./utils");
const { validarComprobante } = require("./ocrValidator");
const fs = require("fs");
const { writeFile } = require("fs/promises");

const path = './respuestas.json';

const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: { headless: true }
});

client.on("qr", qr => {
  qrcode.generate(qr, { small: true });
  console.log("📲 Escanea el código QR con tu WhatsApp");
});

client.on("ready", async () => {
  console.log("✅ Bot listo. Enviando mensaje de prueba y esperando las 6:00 p.m...");

  const clientes = leerClientes();

  console.log("📄 Clientes leídos:", clientes);

  for (const cliente of clientes) {
    const numero = cliente["Número WhatsApp"].toString().split(".")[0].split("E")[0] + "@c.us";
    const fechaFinal = DateTime.fromJSDate(new Date((cliente["Fecha Final"] - 25569) * 86400 * 1000)).startOf("day");
    const mensaje = `Buenas tardes ${cliente.Nombre} 👋\nMañana se cumple tu servicio de ${cliente.Cuenta} con valor $${cliente.Valor}.\n\n¿Deseas continuar?\n\nResponde con:\n✅ Sí  o  ❌ No`;
    await client.sendMessage(numero, mensaje);
    console.log("📩 Mensaje de prueba enviado a:", cliente.Nombre);
    break; // Solo al primero para test
  }
});

client.on("message", async msg => {
  const texto = msg.body.trim().toLowerCase();
  const numero = msg.from.replace("@c.us", "");
  const fecha = DateTime.now().setZone("America/Bogota").toISODate();
  const clientes = leerClientes();


  const clienteData = clientes.find(c => c["Número WhatsApp"].toString().includes(numero));
  if (!clienteData) return;

  if (msg.hasMedia) {
    msg.reply("📸 Recibimos tu comprobante. Validando...");
    const media = await msg.downloadMedia();
    const buffer = Buffer.from(media.data, 'base64');
    const tempPath = `./temp-${numero}.jpg`;
    await writeFile(tempPath, buffer);

    const resultado = await validarComprobante(tempPath, clienteData.Valor.toString().replace(/\./g, ""));

    if (resultado.valido) {
      msg.reply("✅ Comprobante verificado correctamente. ¡Gracias por tu pago!");
      await actualizarRespuestaEnExcel(numero, "✅ Comprobante", fecha);

    } else {
      msg.reply("⚠️ No pudimos validar tu comprobante. Asegúrate de que se vea el valor, la fecha y el número de destino.");
    }
    return;
  }

  let respuestaTexto = "";
  if (["✅ sí", "sí", "si"].includes(texto)) {
    respuestaTexto = "✅ Sí";
  } else if (["❌ no", "no"].includes(texto)) {
    respuestaTexto = "❌ No";
  } else {
    return;
  }

  const respuesta = {
    nombre: clienteData.Nombre,
    numero,
    cuenta: clienteData.Cuenta,
    valor: clienteData.Valor,
    respuesta: respuestaTexto,
    fecha
  };

  let registros = [];
  if (fs.existsSync(path)) {
    registros = JSON.parse(fs.readFileSync(path));
  }
  registros.push(respuesta);
  fs.writeFileSync(path, JSON.stringify(registros, null, 2));
  await actualizarRespuestaEnExcel(numero, respuestaTexto, fecha);

  console.log(`📝 Respuesta registrada: ${numero} => ${respuestaTexto}`);

  if (respuestaTexto === "✅ Sí") {
    msg.reply("¡Gracias por tu respuesta! 🙌\n\nPara continuar, realiza el pago a Nequi o Daviplata: *3183192913* y envía el pantallazo por aquí 📸.");
  } else {
    msg.reply("Lo entendemos 😊. Si decides regresar más adelante, estaremos aquí para ayudarte. ¡Gracias por tu tiempo!");
  }
});

client.initialize();

cron.schedule("0 18 * * *", async () => {
  const ahora = DateTime.now().setZone("America/Bogota").startOf("day");
  const mañana = ahora.plus({ days: 1 });
  const clientes = leerClientes();


  for (const cliente of clientes) {
    const fechaFinal = DateTime.fromJSDate(new Date((cliente["Fecha Final"] - 25569) * 86400 * 1000)).startOf("day");
    const numero = cliente["Número WhatsApp"].toString().split(".")[0].split("E")[0] + "@c.us";

    if (fechaFinal.equals(mañana)) {
      const mensaje = `Buenas tardes ${cliente.Nombre} 👋\nMañana se cumple tu servicio de ${cliente.Cuenta} con valor $${cliente.Valor}.\n\n¿Deseas continuar?\n\nResponde con:\n✅ Sí  o  ❌ No`;
      await client.sendMessage(numero, mensaje);
      console.log("📩 Recordatorio enviado a:", cliente.Nombre);
    } else if (fechaFinal.equals(ahora)) {
      const mensaje = `Hola ${cliente.Nombre}, hoy se vence tu servicio de ${cliente.Cuenta}. Si tienes dudas, escríbenos. ¡Gracias!`;
      await client.sendMessage(numero, mensaje);
      console.log("📩 Notificación del día enviada a:", cliente.Nombre);
    }
  }
}, {
  timezone: "America/Bogota"
});