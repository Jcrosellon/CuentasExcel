
// /bot/utils/helpers.js
const paths = require('../config/paths');
const fs = require("fs");
function formatearPesosColombianos(valor) {
  valor = parseInt(valor);
  if (valor > 0 && valor < 1000) valor *= 1000;
  return Math.round(valor).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

function esNumeroValido(numero) {
  return /^\d{11,15}$/.test(numero); // Ejemplo válido: 573001234567
}

function limpiarTexto(texto) {
  return (texto || "").trim().toUpperCase().replace(/^AUTO-/, "");
}

async function enviarMensajeSeguro(client, numero, mensaje) {
  const chatId = numero + "@c.us";
  try {
    const isValid = await client.isRegisteredUser(chatId);
    if (!isValid) {
      console.warn(`⚠️ ${chatId} no es válido, omitiendo mensaje.`);
      return;
    }
    if (typeof mensaje !== 'string') {
      console.warn(`⚠️ Mensaje inválido para ${chatId}. Debe ser string.`);
      return;
    }
    await client.sendMessage(chatId, mensaje);
  } catch (err) {
    console.error("❌ Error enviando mensaje a", chatId, ":", err.message);
  }
}

// Función para leer archivos JSON de forma segura
function leerJsonSeguro(ruta) {
  try {
    const contenido = fs.readFileSync(ruta, "utf8").trim();
    
    // Si el archivo está vacío, devolvemos un array vacío
    if (!contenido) {
      console.error(`⚠️ El archivo ${ruta} está vacío.`);
      return [];
    }

    return JSON.parse(contenido);
  } catch (err) {
    console.error(`⚠️ Error leyendo o parseando ${ruta}:`, err.message);
    return [];  // Si ocurre un error, devolvemos un array vacío
  }
}

// Leer 'pendientes.json' de manera segura
let pendientes = leerJsonSeguro(paths.pendientes);  // Usamos la función segura para leer el archivo JSON



function cargarJsonSeguro(ruta, porDefecto = []) {
  try {
    return leerJsonSeguro(ruta);  // ✅ ahora sí le pasa una ruta real
  } catch (err) {
    console.warn(`⚠️ Error leyendo ${ruta}. Usando valor por defecto.`);
    return porDefecto;
  }
}


module.exports = {
  formatearPesosColombianos,
  esNumeroValido,
  limpiarTexto,
  enviarMensajeSeguro,
  cargarJsonSeguro,
  leerJsonSeguro
};
