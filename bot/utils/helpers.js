// /bot/utils/helpers.js

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

module.exports = {
  formatearPesosColombianos,
  esNumeroValido,
  limpiarTexto
};
