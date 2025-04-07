// /utils/respuestasManager.js

const fs = require("fs");
const { DateTime } = require("luxon");
const config = require('../config/configLoader')();
const rutaRespuestas = "./respuestas.json";
const rutaMensajesEnviados = "./mensajesEnviados.json";

// Guarda el último mensaje enviado por número
function guardarHistorialMensaje(numero, mensaje) {
  let historial = {};
  if (fs.existsSync(rutaMensajesEnviados)) {
    try {
      const contenido = fs.readFileSync(rutaMensajesEnviados, "utf8");
      historial = contenido ? JSON.parse(contenido) : {};
    } catch (err) {
      console.error("⚠️ Error leyendo mensajesEnviados.json:", err.message);
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
      console.error("⚠️ Error leyendo mensajesEnviados.json:", err.message);
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
  if (!fs.existsSync("confirmados.json")) return false;
  const confirmados = JSON.parse(fs.readFileSync("confirmados.json", "utf8"));
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
