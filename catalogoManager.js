// Paso 1: Creamos un nuevo archivo llamado "catalogoManager.js"

const fs = require("fs");

let productos = [];

function cargarCatalogoNumerado(ruta = "./catalogo.txt") {
  try {
    const contenido = fs.readFileSync(ruta, "utf8");
    productos = contenido
      .split(/\r?\n/)
      .map(linea => linea.trim())
      .filter(linea => /^\d+\.\s/.test(linea));
    return productos;
  } catch (err) {
    console.error("❌ No se pudo cargar el catalogo numerado:", err.message);
    return [];
  }
}

function buscarProductoPorNumero(numero) {
  return productos.find(linea => linea.startsWith(`${numero}.`));
}

module.exports = {
  cargarCatalogoNumerado,
  buscarProductoPorNumero
};
