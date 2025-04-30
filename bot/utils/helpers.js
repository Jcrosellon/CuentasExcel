const paths = require('../config/paths');

// /bot/utils/helpers.js
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


function cargarJsonSeguro(ruta, porDefecto = []) {
  try {
    if (!fs.existsSync(ruta)) return porDefecto;
    const texto = fs.readFileSync(paths.archivo, "utf8");

    return JSON.parse(texto || "[]");
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
  cargarJsonSeguro 
};
