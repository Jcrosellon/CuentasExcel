// /utils/respuestasManager.js

const fs = require("fs");
const { DateTime } = require("luxon");
const config = require('../config/configLoader')();
const rutaRespuestas = "./respuestas.json";
const paths = require("../config/paths");
const rutaMensajesEnviados = paths.mensajesEnviados;

// Guarda el último mensaje enviado por número
function guardarHistorialMensaje(numero, mensaje) {
  let historial = {};
  if (fs.existsSync(rutaMensajesEnviados)) {
    try {
      const contenido = fs.readFileSync(rutaMensajesEnviados, "utf8");
      historial = contenido ? JSON.parse(contenido) : {};
    } catch (err) {
      const paths = require("../config/paths"); // o la ruta correcta
console.error(`⚠️ Error leyendo ${paths.mensajesEnviados}:`, err.message);
    }
  }
  historial[numero] = mensaje;
  fs.writeFileSync(rutaMensajesEnviados, JSON.stringify(historial, null, 2));
}

// Devuelve el último mensaje enviado
function obtenerMensajeAnterior(numero) {
  if (fs.existsSync(rutaMensajesEnviados)) {
    try {
      const contenido = fs.readFileSync(rutaMensajesEnviados, "utf8");
      const historial = contenido ? JSON.parse(contenido) : {};
      return historial[numero];
    } catch (err) {
      const paths = require("../config/paths"); // o la ruta correcta
console.error(`⚠️ Error leyendo ${paths.mensajesEnviados}:`, err.message);
    }
  }
  return null;
}

// Guarda respuesta en archivo local y, si aplica, en Google Sheets
async function guardarRespuesta(numero, clienteData, respuestaTexto, fechaActual, referencia = "") {
  let registros = [];
  if (fs.existsSync(rutaRespuestas)) {
    registros = JSON.parse(fs.readFileSync(rutaRespuestas));
  }

  registros.push({
    nombre: clienteData["NOMBRE"],
    numero,
    cuenta: clienteData["CUENTA"],
    valor: clienteData["VALOR"],
    respuesta: respuestaTexto,
    fecha: fechaActual
  });

  fs.writeFileSync(rutaRespuestas, JSON.stringify(registros, null, 2));

  if (config.useGoogleSheet) {
    const { actualizarRespuestaEnGoogle } = require("./utilsGoogle");
    await actualizarRespuestaEnGoogle(numero, respuestaTexto, fechaActual, referencia);
  }
  

  if (respuestaTexto !== "NO RECONOCIDO") {
    guardarHistorialMensaje(numero, respuestaTexto);
  }
}

// Verifica si el número ya fue confirmado
function yaFueConfirmado(numero) {
  let confirmados = [];

  try {
    if (fs.existsSync("paths.confirmados")) {
      const contenido = fs.readFileSync("paths.confirmados", "utf8");
      confirmados = JSON.parse(contenido);
      if (!Array.isArray(confirmados)) {
        confirmados = []; // 💥 Fallback seguro
      }
    }
  } catch (err) {
    console.error("⚠️ Error leyendo paths.confirmados:", err.message);
  }

  return confirmados.includes(numero);
}

// Verifica si ya se respondió a ese número (por historial)
function yaRespondido(numero) {
  if (!fs.existsSync(rutaMensajesEnviados)) return false;
  try {
    const historial = JSON.parse(fs.readFileSync(rutaMensajesEnviados, "utf8"));
    return historial.hasOwnProperty(numero);
  } catch (err) {
    console.error("⚠️ Error leyendo historial:", err.message);
    return false;
  }
}

// Marca un número como "RESPONDIDO"
function marcarRespondido(numero) {
  let historial = {};
  if (fs.existsSync(rutaMensajesEnviados)) {
    try {
      const contenido = fs.readFileSync(rutaMensajesEnviados, "utf8");
      historial = contenido ? JSON.parse(contenido) : {};
    } catch (err) {
      console.error("⚠️ Error leyendo historial:", err.message);
    }
  }
  historial[numero] = "RESPONDIDO";
  fs.writeFileSync(rutaMensajesEnviados, JSON.stringify(historial, null, 2));
}

module.exports = {
  guardarRespuesta,
  guardarHistorialMensaje,
  obtenerMensajeAnterior,
  yaFueConfirmado,
  yaRespondido,
  marcarRespondido
};
