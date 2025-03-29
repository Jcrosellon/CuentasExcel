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
const { actualizarComprobanteFila } = require("./guardarRespuestas");


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

// Agrega esto después de definir tu client.on("ready"):
client.on("ready", async () => {
    console.log("✅ Bot listo. Programando envíos automáticos...");
  
    // Enviar a las 6:00pm todos los días
    cron.schedule("31 12 * * *", async () => {
        //await enviarTodosLosMensajes();
      const hoy = DateTime.now().setZone("America/Bogota").startOf("day");
      const clientes = leerClientes();
      const agrupados = agruparClientesPorNumero(clientes);
  
      for (const numero in agrupados) {
        if (numero !== "573114207673") continue; // 👈 Solo ese número
        const cliente = agrupados[numero];
        const cuentas = cliente.cuentas;
        let vencenManana = [];
        let vencenHoy = [];
        let enMora = [];
  
        for (const cuenta of cuentas) {
            let fechaFinal;
            const rawFecha = cuenta.fechaFinal;
            
            if (typeof rawFecha === "string") {
              fechaFinal = DateTime.fromFormat(rawFecha, "dd/MM/yyyy", { zone: "America/Bogota" });
            } else if (typeof rawFecha === "number") {
              // Excel date serial
              fechaFinal = DateTime.fromJSDate(new Date((rawFecha - 25569) * 86400 * 1000)).setZone("America/Bogota");
            } else if (rawFecha instanceof Date) {
              fechaFinal = DateTime.fromJSDate(rawFecha).setZone("America/Bogota");
            } else {
              fechaFinal = null;
            }
            
            if (!fechaFinal || !fechaFinal.isValid) continue;
            
          if (!fechaFinal.isValid) continue;
          const diff = Math.floor(fechaFinal.diff(hoy, "days").days);

  
          if (diff === 1) vencenManana.push(cuenta);
          else if (diff === 0) vencenHoy.push(cuenta);
          else if (diff < 0) {
            console.log(`📆 Servicio en mora para ${cliente.nombre}: ${cuenta.cuenta} (${diff} días)`);
            enMora.push({ ...cuenta, dias: Math.abs(diff) });
          }
          
        }
  
        if (vencenManana.length > 0) {
          await enviarMensajeVencimiento(numero, cliente.nombre, vencenManana, "MAÑANA");
        }
  
        if (vencenHoy.length > 0) {
          await enviarMensajeVencimiento(numero, cliente.nombre, vencenHoy, "HOY");
        }
  
        for (const mora of enMora) {
          await enviarMensajeMora(numero, cliente.nombre, mora);
        }
      }
    });
  
    // ⚡ Enviar al instante solo para pruebas (comenta esto en producción)
    //  await enviarTodosLosMensajes();
  });
  

client.on("message", async (msg) => {
    const texto = msg.body.trim().toLowerCase();
    const numero = msg.from.replace("@c.us", "");
    const fechaActual = DateTime.now().setZone("America/Bogota").toISODate();

    if (msg.from === adminPhone) {
        let pendientes = fs.existsSync(rutaPendientes) ? JSON.parse(fs.readFileSync(rutaPendientes)) : [];
        const pendiente = pendientes.shift();
        fs.writeFileSync(rutaPendientes, JSON.stringify(pendientes, null, 2));

// ⚠️ Detectar "estado" ANTES que cualquier otra lógica (incluso admin)
if (texto === "estado") {
    const clientes = leerClientes();
    const resumen = obtenerEstadoDeCuentas(clientes);
    const mensaje = generarResumenEstado(resumen);
    await client.sendMessage(msg.from, mensaje);
    const texto = msg.body.trim().toLowerCase();
  const numero = msg.from.replace("@c.us", "");
  const fechaActual = DateTime.now().setZone("America/Bogota").toISODate();

    return;
  }
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
      
        // Si ya existe, no permitir duplicado
        if (yaExiste) {
          msg.reply(`❌ Este comprobante ya está registrado (Ref: ${nuevaReferencia}).\nPago rechazado.`);
          return;
        }
      
        // Formatear valor para mostrar (opcional si decides incluirlo después)
        const valorFormateado = resultado.valor ? formatearPesosColombianos(Math.round(resultado.valor)) : "No detectado";
      
        // Crear mensaje para admin
        const mensajeAdmin = `🧾 *Pago recibido de ${clienteData["NOMBRE"]}*\n` +
          `🧩 Referencia: ${nuevaReferencia}\n` +
          `📌 Cuenta: ${clienteData["CUENTA"]} (usuario: ${clienteData["USUARIO"]})\n\n` +
          `✅ Para *confirmar* este pago responde: *CONFIRMADO* o ✅\n❌ Para *rechazarlo* responde: *RECHAZADO* o ❌`;
      
        // Enviar al admin
        await client.sendMessage(adminPhone, mensajeAdmin);
        await client.sendMessage(adminPhone, media, { caption: "🖼 Comprobante adjunto" });
        msg.reply("🕓 Comprobante enviado para validación. Te notificaremos pronto. 🙌");
      
        // Guardar pendiente para revisión manual
        pendientes.push({
          numero,
          referencia: nuevaReferencia,
          fecha: DateTime.now().toISO(),
          nombre: clienteData["NOMBRE"],
          cuenta: clienteData["CUENTA"],
          usuario: clienteData["USUARIO"]
        });
        fs.writeFileSync(rutaPendientes, JSON.stringify(pendientes, null, 2));
        console.log("📩 Pendiente agregado para revisión:", nuevaReferencia);
      
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

async function enviarMensajeVencimiento(numero, nombre, cuentas, cuando) {
    let mensaje = `🌙 Buenas tardes ${nombre}, para recordarte que ${cuando} se vencen los siguientes servicios:\n\n`;
    let total = 0;
    for (const cuenta of cuentas) {
      mensaje += `🔸 ${cuenta.cuenta} ( ${cuenta.dispositivo} ): $${formatearPesosColombianos(cuenta.valor)}\n`;
      total += parseInt(cuenta.valor);
    }
    mensaje += `\n💰 Total a pagar: $${formatearPesosColombianos(total)}\n\n¿Deseas continuar? ✨\nResponde con *SI*✅ o *NO*❌`;
  
    await client.sendMessage(numero + "@c.us", mensaje);
    console.log(`📨 Enviado mensaje de vencimiento a ${nombre} (${cuando})`);
  }

  async function enviarMensajeMora(numero, nombre, cuenta) {
    const mensaje = `📢 Hola ${nombre}, recuerda que tus servicios:\n\n` +
      `🔸 ${cuenta.cuenta} ( ${cuenta.dispositivo} ): $${formatearPesosColombianos(cuenta.valor)}\n\n` +
      `💰 Total a pagar: $${formatearPesosColombianos(cuenta.valor)}\n\n` +
      `¡TIENEN ${cuenta.dias} DÍA${cuenta.dias > 1 ? "S" : ""} EN MORA!\n\n¿Si deseas continuar? ✨\nResponde con *SI*✅ o *NO*❌`;
  
    await client.sendMessage(numero + "@c.us", mensaje);
    console.log(`📨 Enviado mensaje de mora a ${nombre} (${cuenta.dias} días)`);
  }

// ✅ Asegúrate de que cada cuenta en agruparClientesPorNumero incluya `fechaFinal` correctamente:
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
        fechaFinal: c["FECHA FINAL"] || "",
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
  
    // Pasamos "" como referencia cuando no hay comprobante aún
    await actualizarRespuestaEnExcel(numero, respuestaTexto, fechaActual, "");
    console.log(`📝 Respuesta registrada: ${numero} => ${respuestaTexto}`);
  }
  
  async function actualizarRespuestaEnExcel(numero, respuesta, fecha, referencia = "") {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile("C:/Users/JoseRosellon/OneDrive - LOGISTICA FERRETERA/CUENTASEXCEL.xlsx");
    const worksheet = workbook.getWorksheet("Hoja1");
  
    for (let i = 2; i <= worksheet.rowCount; i++) {
      const row = worksheet.getRow(i);
      const celNumero = row.getCell("J").value?.toString().replace(/\D/g, "") || "";
      const celRef = row.getCell("M").value?.toString().trim() || "";
  
      const coincide = referencia
        ? celNumero.includes(numero) && celRef === referencia
        : celNumero.includes(numero);
  
      if (coincide) {
        row.getCell("K").value = respuesta; // RESPUESTA
        row.getCell("L").value = fecha;     // FECHA RESPUESTA
  
        if (respuesta.toLowerCase() === "no") {
          row.getCell("M").value = "XXXXXXXX"; // COMPROBANTE
        }
  
        row.commit(); // Necesario para guardar la fila
        await workbook.xlsx.writeFile("C:/Users/JoseRosellon/OneDrive - LOGISTICA FERRETERA/CUENTASEXCEL.xlsx");
        console.log("📗 Respuesta actualizada en Excel:", numero);
        return true;
      }
    }
  
    console.log("⚠️ No se encontró coincidencia para:", numero, referencia);
    return false;
  }
  
  


function obtenerEstadoDeCuentas(clientes) {
    const cuentas = {};
    for (const cliente of clientes) {
      const cuenta = (cliente["CUENTA"] || "").toUpperCase().trim();
      const usuario = (cliente["USUARIO"] || "").trim();
      const clave = (cliente["CLAVE"] || "").trim(); // 👈 obtenemos la clave
      const perfiles = parseInt(cliente["PERFIL"] || 1);
      if (!cuenta || !usuario || isNaN(perfiles)) continue;
  
      const claveCuenta = `${cuenta}|${usuario}`;
      if (!cuentas[claveCuenta]) {
        cuentas[claveCuenta] = {
          cuenta,
          usuario,
          clave, // 👈 la guardamos
          usados: 0,
          maximos: perfilMaximos[cuenta] || 1
        };
      }
      cuentas[claveCuenta].usados += perfiles;
    }
  
    return Object.values(cuentas).map(c => ({
      cuenta: c.cuenta,
      usuario: c.usuario,
      clave: c.clave, // 👈 retornamos la clave también
      usados: c.usados,
      disponibles: Math.max(c.maximos - c.usados, 0),
      maximos: c.maximos
    }));
  }
  
  
  function generarResumenEstado(resumen) {
    if (resumen.length === 0) return "😐 No se encontraron cuentas para mostrar estado.";
  
    // 🔽 Ordenamos por `disponibles` de mayor a menor
    resumen.sort((a, b) => b.disponibles - a.disponibles);
  
    let mensaje = "📊 *Estado de Cuentas y Perfiles:*";
    for (const r of resumen) {
      let estado = "";
      if (r.usados >= r.maximos) {
        estado = "❌ ¡LLENA!";
      } else if (r.usados >= r.maximos - 1) {
        estado = "⚠️ Casi llena";
      } else {
        estado = "✅ Disponible";
      }
  
      mensaje += `\n\n🔹 ${r.cuenta}:\n` +
                 `👤 Usuario: *${r.usuario}*\n` +
                 `🔑 Clave: *${r.clave}*\n` +
                 `👥 Perfiles usados: ${r.usados}/${r.maximos}\n` +
                 `📦 Disponibles: ${r.disponibles}\n` +
                 `📊 Estado: ${estado}\n` +
                 `────────────────────`;
    }
  
    return mensaje;
  }
  
  
  
//   async function enviarTodosLosMensajes() {
//     const hoy = DateTime.now().setZone("America/Bogota").startOf("day");
//     const clientes = leerClientes();
//     const agrupados = agruparClientesPorNumero(clientes);
  
//     for (const numero in agrupados) {
//       if (numero !== "573114207673") continue; // Solo ese número
//       const cliente = agrupados[numero];
//       const cuentas = cliente.cuentas;
//       let vencenManana = [];
//       let vencenHoy = [];
//       let enMora = [];
  
//       for (const cuenta of cuentas) {
//         let fechaFinal;
// const rawFecha = cuenta.fechaFinal;

// if (typeof rawFecha === "string") {
//   fechaFinal = DateTime.fromFormat(rawFecha, "dd/MM/yyyy", { zone: "America/Bogota" });
// } else if (typeof rawFecha === "number") {
//   // Excel date serial
//   fechaFinal = DateTime.fromJSDate(new Date((rawFecha - 25569) * 86400 * 1000)).setZone("America/Bogota");
// } else if (rawFecha instanceof Date) {
//   fechaFinal = DateTime.fromJSDate(rawFecha).setZone("America/Bogota");
// } else {
//   fechaFinal = null;
// }

// if (!fechaFinal || !fechaFinal.isValid) continue;

//         if (!fechaFinal.isValid) continue;
//         const diff = Math.floor(fechaFinal.diff(hoy, "days").days);

  
//         if (diff === 1) vencenManana.push(cuenta);
//         else if (diff === 0) vencenHoy.push(cuenta);
//         else if (diff < 0) enMora.push({ ...cuenta, dias: Math.abs(diff) });
//       }
  
//       if (vencenManana.length > 0) {
//         await enviarMensajeVencimiento(numero, cliente.nombre, vencenManana, "MAÑANA");
//       }
  
//       if (vencenHoy.length > 0) {
//         await enviarMensajeVencimiento(numero, cliente.nombre, vencenHoy, "HOY");
//       }
  
//       for (const mora of enMora) {
//         await enviarMensajeMora(numero, cliente.nombre, mora);
//       }
//     }
//   }
  
  


client.initialize();
