// /utils/respuestasManager.js

const fs = require("fs");
const { DateTime } = require("luxon");
const config = require('../config/configLoader')();
const { leerJsonSeguro } = require("../utils/helpers");  // Importamos la función

// Aquí ya está el archivo de rutas
const paths = require('../config/paths');
const rutaRespuestas = paths.respuestas;
const rutaMensajesEnviados = paths.mensajesEnviados;  

// Guarda el último mensaje enviado por número
function guardarHistorialMensaje(numero, mensaje) {
  let historial = {};
  if (fs.existsSync(rutaMensajesEnviados)) {
    try {
      const contenido = fs.readFileSync(paths.mensajesEnviados, "utf8");

      // Usamos la función segura
      historial = leerJsonSeguro(paths.mensajesEnviados);
    } catch (err) {
      console.error(`⚠️ Error leyendo ${paths.mensajesEnviados}:`, err.message);
    }
  }
  historial[numero] = mensaje;
  fs.writeFileSync(paths.mensajesEnviados, JSON.stringify(historial, null, 2));
}

// Devuelve el último mensaje enviado
function obtenerMensajeAnterior(numero) {
  if (fs.existsSync(rutaMensajesEnviados)) {
    try {
      const contenido = fs.readFileSync(paths.mensajesEnviados, "utf8");

      // Usamos la función segura
      const historial = leerJsonSeguro(paths.mensajesEnviados);

      return historial[numero];
    } catch (err) {
      console.error(`⚠️ Error leyendo ${paths.mensajesEnviados}:`, err.message);
    }
  }
  return null;
}

// Guarda respuesta en archivo local y, si aplica, en Google Sheets
async function guardarRespuesta(numero, clienteData, respuestaTexto, fechaActual, referencia = "") {
  let registros = [];
  if (fs.existsSync(rutaRespuestas)) {
    registros = leerJsonSeguro(paths.respuestas);  // Usamos la función segura
  }

  registros.push({
    nombre: clienteData["NOMBRE"],
    numero,
    cuenta: clienteData["CUENTA"],
    valor: clienteData["VALOR"],
    respuesta: respuestaTexto,
    fecha: fechaActual
  });

  fs.writeFileSync(paths.respuestas, JSON.stringify(registros, null, 2));

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
      const contenido = fs.readFileSync(paths.confirmados, "utf8");

      confirmados = leerJsonSeguro(paths.confirmados);  // Usamos la función segura
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
    const historial = leerJsonSeguro(paths.mensajesEnviados);  // Usamos la función segura

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
      const contenido = fs.readFileSync(paths.mensajesEnviados, "utf8");

      historial = leerJsonSeguro(paths.mensajesEnviados);  // Usamos la función segura
    } catch (err) {
      console.error("⚠️ Error leyendo historial:", err.message);
    }
  }
  historial[numero] = "RESPONDIDO";
  fs.writeFileSync(paths.mensajesEnviados, JSON.stringify(historial, null, 2));
}

module.exports = {
  guardarRespuesta,
  guardarHistorialMensaje,
  obtenerMensajeAnterior,
  yaFueConfirmado,
  yaRespondido,
  marcarRespondido
};
