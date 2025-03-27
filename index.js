// index.js
const qrcode = require("qrcode-terminal");
const { Client, LocalAuth } = require("whatsapp-web.js");
const { DateTime } = require("luxon");
const fs = require("fs");
const { writeFile } = require("fs/promises");
const ExcelJS = require("exceljs");
const cron = require("node-cron");

const config = require("./config.json");
const { leerClientes } = require("./utils");
const { validarComprobante } = require("./ocrValidator");
const { actualizarRespuestaEnExcel, actualizarComprobanteFila } = require("./guardarRespuestas");

const adminPhone = config.adminPhone + "@c.us";
const path = "./respuestas.json";
const rutaPendientes = "./pendientes.json";

const perfilMaximos = {
    "NETFLIX": 5,
    "TELE LATINO": 6,
    "DISNEY": 7,
    "AMAZON PRIME": 6,
    "MAX PLATINO": 5,
    "IPTV": 3,
};

const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: { headless: true },
});

client.on("qr", (qr) => {
    qrcode.generate(qr, { small: true });
    console.log("📲 Escanea el código QR con tu WhatsApp");
});

client.on("ready", async () => {
    console.log("✅ Bot listo. Enviando mensajes agrupados...");
    try {
        const clientes = leerClientes();
        const agrupados = agruparClientesPorNumero(clientes);

        for (const numero in agrupados) {
            const cliente = agrupados[numero];
            const numeroWhatsApp = numero + "@c.us";
            let mensaje = `🌙 Buenas noches ${cliente.nombre}, para recordarte que MAÑANA se vencen los siguientes servicios:\n\n`;
            let total = 0;
            for (const cuenta of cliente.cuentas) {
                const valorFormateado = formatearPesosColombianos(cuenta.valor);
                mensaje += `🔸 ${cuenta.cuenta} ( ${cuenta.dispositivo} ): $${valorFormateado}\n`;

                total += parseInt(cuenta.valor);
            }
            mensaje += `\n💰 *Total a pagar: $${formatearPesosColombianos(total)}*\n\n¿Deseas continuar? ✨\nResponde con *SI*✅ o *NO*❌`;


            console.log(`> Enviando mensaje a ${cliente.nombre} (${numeroWhatsApp})`);
            await client.sendMessage(numeroWhatsApp, mensaje);
        }
    } catch (err) {
        console.error("❌ Error durante envío agrupado:", err);
    }
});

client.on("message", async (msg) => {
    const texto = msg.body.trim().toLowerCase();
    const numero = msg.from.replace("@c.us", "");
    const fechaActual = DateTime.now().setZone("America/Bogota").toISODate();

    if (msg.from === adminPhone) {
        let pendientes = fs.existsSync(rutaPendientes) ? JSON.parse(fs.readFileSync(rutaPendientes)) : [];
        const pendiente = pendientes.shift();
        fs.writeFileSync(rutaPendientes, JSON.stringify(pendientes, null, 2));

        if (pendiente) {
            const clientes = leerClientes();
            const relacionados = clientes.filter(c => (c["NUMERO WHATSAPP"]?.toString() || "").includes(pendiente.numero));

            for (const cliente of relacionados) {
                await actualizarComprobanteFila(cliente["NUMERO WHATSAPP"], pendiente.referencia);
                await actualizarRespuestaEnExcel(cliente["NUMERO WHATSAPP"], "✅ Comprobante", DateTime.now().toISODate(), pendiente.referencia);
            }

            if (texto === "confirmado" || texto === "✅") {
                await client.sendMessage(pendiente.numero + "@c.us", "✅ Tu pago ha sido confirmado. ¡Gracias por continuar con nosotros! 🎉");
            } else if (texto === "rechazado" || texto === "❌") {
                await client.sendMessage(pendiente.numero + "@c.us", "❌ Tu pago fue rechazado. Verifica que el pantallazo sea correcto y vuelve a intentarlo.");
            }
        } else {
            msg.reply("⚠️ No hay pagos pendientes para confirmar o rechazar.");
        }
        return;
    }

    const clientes = leerClientes();
    const cuentasUsuario = clientes.filter(c => (c["NUMERO WHATSAPP"]?.toString() || "").includes(numero));
    if (cuentasUsuario.length === 0) return;

    if (msg.hasMedia) {
        msg.reply("📸 Recibimos tu comprobante. Validando...");
        const media = await msg.downloadMedia();
        const buffer = Buffer.from(media.data, "base64");
        const tempPath = `./temp-${numero}.jpg`;
        await writeFile(tempPath, buffer);

        const clienteData = cuentasUsuario[0];
        const valorEsperado = clienteData["VALOR"]?.toString().replace(/\./g, "") || "20000";
        const resultado = await validarComprobante(tempPath, valorEsperado);

        if (!resultado.valido) {
            msg.reply("⚠️ No pudimos validar tu comprobante. Asegúrate de que se vea el valor, la fecha y el número de destino (3183192913).");
            return;
        }

        const nuevaReferencia = (resultado.referenciaDetectada || "").trim();
        let pendientes = fs.existsSync(rutaPendientes) ? JSON.parse(fs.readFileSync(rutaPendientes)) : [];
        const yaExiste = pendientes.some(p => p.referencia === nuevaReferencia);

        //if (yaExiste) {
        //msg.reply(`❌ Este comprobante ya está registrado (Ref: ${nuevaReferencia}).\nPago rechazado.`);
        //return;
        //}

        const valorFormateado = resultado.valor ? formatearPesosColombianos(Math.round(resultado.valor)) : "No detectado";

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
            usuario: clienteData["USUARIO"]
        });
        fs.writeFileSync(rutaPendientes, JSON.stringify(pendientes, null, 2));
        return;
    }

    if (["si", "sí", "✅ si"].includes(texto)) {
        msg.reply("👍 ¡Perfecto! Para continuar, realiza el pago a *Nequi o DaviPlata: 3183192913* y adjunta el pantallazo por aquí. Yo me encargaré de validarlo. 🧐📲");
        for (const cliente of cuentasUsuario) {
            await guardarRespuesta(numero, cliente, "SI", fechaActual);
        }
    } else if (["no", "❌ no"].includes(texto)) {
        const catalogo = fs.readFileSync("./catalogo.txt", "utf8");
        const mensaje = `☹️ Siento que hayas tenido algún inconveniente. Si decides regresar, estaré aquí para ayudarte. 🌟\n\nMientras tanto, te comparto nuestro catálogo de precios actualizados:\n\n${catalogo}`;
        msg.reply(mensaje);
        for (const cliente of cuentasUsuario) {
            await guardarRespuesta(numero, cliente, "NO", fechaActual);
        }
    }
});

function formatearPesosColombianos(valor) {
    return Math.round(valor).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}



function agruparClientesPorNumero(clientes) {
    const mapa = {};
    for (const c of clientes) {
        const numero = c["NUMERO WHATSAPP"]?.toString().split(".")[0] || "";
        const clave = numero;
        if (!mapa[clave]) {
            mapa[clave] = {
                nombre: c["NOMBRE"] || "",
                numero: clave,
                cuentas: [],
            };
        }
        mapa[clave].cuentas.push({
            cuenta: c["CUENTA"] || "",
            dispositivo: c["DISPOSITIVO"] || "",
            valor: c["VALOR"] || "0",
        });
    }
    return mapa;
}

async function guardarRespuesta(numero, clienteData, respuestaTexto, fechaActual) {
    let registros = [];
    if (fs.existsSync(path)) {
        registros = JSON.parse(fs.readFileSync(path));
    }
    registros.push({
        nombre: clienteData["NOMBRE"],
        numero,
        cuenta: clienteData["CUENTA"],
        valor: clienteData["VALOR"],
        respuesta: respuestaTexto,
        fecha: fechaActual
    });
    fs.writeFileSync(path, JSON.stringify(registros, null, 2));
    await actualizarRespuestaEnExcel(numero, respuestaTexto, fechaActual, "");
    console.log(`📝 Respuesta registrada: ${numero} => ${respuestaTexto}`);
}




client.initialize();
