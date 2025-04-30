const fs = require("fs");
const path = require("path");
const { DateTime } = require("luxon");
const paths = require("../config/paths");
const rutaConfirmados = paths.confirmados;
const duracionConfirmacionHoras = 24;

function cargarConfirmados() {
  if (!fs.existsSync(rutaConfirmados)) return {};
  try {
    const data = fs.readFileSync(rutaConfirmados, "utf8");
    return data ? JSON.parse(data) : {};
  } catch (err) {
    console.error("❌ Error leyendo confirmados.json:", err.message);
    return {};
  }
}

function yaFueConfirmado(numero) {
  const confirmados = cargarConfirmados();
  const data = confirmados[numero];
  if (!data) return false;

  const fechaConfirmacion = DateTime.fromISO(data.fecha);
  const expiracion = fechaConfirmacion.plus({ hours: duracionConfirmacionHoras });
  const ahora = DateTime.now();

  if (ahora > expiracion) {
    delete confirmados[numero];
    fs.writeFileSync(rutaConfirmados, JSON.stringify(confirmados, null, 2));
    console.log(`⌛ Confirmación expirada para ${numero}`);
    return false;
  }

  return true;
}

function marcarRespondido(numero) {
  const confirmados = cargarConfirmados();
  if (confirmados[numero]) {
    confirmados[numero].respondido = true;
    fs.writeFileSync(rutaConfirmados, JSON.stringify(confirmados, null, 2));
  }
}

function yaRespondido(numero) {
  const confirmados = cargarConfirmados();
  return confirmados[numero]?.respondido === true;
}

module.exports = {
  yaFueConfirmado,
  marcarRespondido,
  yaRespondido,
};
