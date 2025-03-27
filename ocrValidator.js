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

  // 1) Detectar valor
  const valoresDetectados = [...textoPlano.matchAll(/\$?\s?([\d.,]+)/g)].map(match => {
    const v = match[1].replace(/\./g, "").replace(",", ".");
    return parseFloat(v);
  });
  const valorValido = valoresDetectados.some(v => v >= parseFloat(valorMinimo));

  // 2) Numero de destino (Si quieres mantenerlo obligatorio)
  const numeroValido = /3183192913/.test(textoPlano);

  // 3) Buscar la palabra "referencia" y capturar lo que venga después.
  //    Por ejemplo, si Tesseract lee algo como: "Referencia M7934504"
  //    este regex busca la palabra "referencia" seguida de espacio o dos puntos, y captura lo siguiente hasta el salto de linea o espacio.
  const refRegex = /referencia[:\s]+([a-z0-9\-]+)/i;
  // Asegúrate de que Tesseract reconozca la línea como "referencia m7934504".
  // [a-z0-9\-]+ -> Capturará algo como "M7934504" (en minúsculas, pues pasamos toLowerCase).
  // Si en tu imagen sale con mayúsculas, no importa, .toLowerCase() uniformiza.

  let referenciaDetectada = "";
  const refMatch = textoPlano.match(refRegex);
  if (refMatch) {
    referenciaDetectada = refMatch[1].trim();
  }

  console.log("🔎 valorValido:", valorValido, "numeroValido:", numeroValido, "referencia:", referenciaDetectada);

  // 4) Decide qué es obligatorio
  const valido = valorValido && numeroValido && !!referenciaDetectada;

  return {
    valido,
    coincidencias: {
      valor: valorValido,
      numero: numeroValido,
      referencia: !!referenciaDetectada
    },
    referenciaDetectada
  };
};

module.exports = { validarComprobante };
