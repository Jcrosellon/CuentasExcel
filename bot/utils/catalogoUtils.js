// /utils/catalogoUtils.js
const fs = require("fs");

const rutaCatalogo = "./catalogo.txt";

let catalogoNumerado = [];

function cargarCatalogoNumerado() {
  try {
    const contenido = fs.readFileSync(rutaCatalogoNumerado, "utf8");
    catalogoNumerado = contenido
      .split(/\r?\n/)
      .map(l => l.trim())
      .filter(Boolean);
  } catch (err) {
    console.error("❌ Error cargando catálogo numerado:", err.message);
    catalogoNumerado = [];
  }
}

function buscarProductoPorNumero(numero) {
  const catalogo = fs.readFileSync("./catalogo.txt", "utf8").split("\n");
  const linea = catalogo.find(linea => linea.trim().startsWith(`${numero}.`));
  return linea || null;
}

function obtenerValorProductoPorNumero(numero) {
  const linea = catalogoNumerado[numero - 1];
  if (!linea) return null;
  const match = linea.match(/\$(\d+[\d\.]*)/);
  return match ? match[1].replace(/\./g, "") : null;
}

function obtenerCatalogoTexto() {
  try {
    return fs.readFileSync(rutaCatalogo, "utf8");
  } catch (err) {
    console.error("❌ No se pudo leer el archivo catalogo.txt:", err.message);
    return "🛍️ Consulta nuestro catálogo más adelante. ¡Estamos actualizándolo!";
  }
}

module.exports = {
  cargarCatalogoNumerado,
  buscarProductoPorNumero,
  obtenerValorProductoPorNumero,
  obtenerCatalogoTexto
};
