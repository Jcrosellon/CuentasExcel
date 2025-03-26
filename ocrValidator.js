// ocrValidator.js
const Tesseract = require("tesseract.js");
const { DateTime } = require("luxon");

const validarComprobante = async (rutaImagen, valorMinimo = 20000) => {
  console.log("🔍 Analizando imagen con OCR...");

  const { data: { text } } = await Tesseract.recognize(rutaImagen, "spa", {
    logger: m => console.log(m.status, m.progress)
  });

  const textoPlano = text.toLowerCase();
  console.log("📝 Texto detectado:", textoPlano);

  // 1. Buscar valores monetarios como $ 1.000,00 o 20000
  const valoresDetectados = [...textoPlano.matchAll(/\$?\s?([\d.,]+)/g)].map(match => {
    const valor = match[1].replace(/\./g, "").replace(",", ".");
    return parseFloat(valor);
  });

  const valorValido = valoresDetectados.some(v => v >= valorMinimo);

  // 2. Fecha actual en español
  const hoy = DateTime.now().setZone("America/Bogota");
  const mesLetras = hoy.setLocale("es").toFormat("LLLL");
  const fechaEsperada = new RegExp(`${hoy.day} de ${mesLetras} de ${hoy.year}`, "i");
  const fechaValida = fechaEsperada.test(textoPlano);

  // 3. Número de destino (Nequi o Daviplata)
  const numerosValidos = [/3183192913/];
  const numeroValido = numerosValidos.some(rx => rx.test(textoPlano));

  const coincidencias = {
    valor: valorValido,
    fecha: fechaValida,
    numero: numeroValido
  };

  const valido = coincidencias.valor && coincidencias.fecha && coincidencias.numero;

  return { valido, coincidencias };
};

module.exports = { validarComprobante };
