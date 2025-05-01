const sharp = require("sharp");
const Tesseract = require("tesseract.js");
const fs = require("fs/promises");

async function preprocesarImagen(rutaOriginal, rutaProcesada) {
  await sharp(rutaOriginal)
    .resize({ width: 1000 })
    .grayscale()
    .threshold(150)
    .sharpen()
    .toFile(rutaProcesada);
}

function convertirValor(valorStr) {
  if (!valorStr) return 0;
  valorStr = valorStr.trim().replace(/[^\d.,]/g, "");

  const formatoUS = /^\d{1,3}(,\d{3})*(\.\d{2})?$/;
  if (formatoUS.test(valorStr)) {
    valorStr = valorStr.replace(/,/g, "");
  } else {
    valorStr = valorStr.replace(/\.(?=\d{3})/g, "").replace(",", ".");
  }

  const num = parseFloat(valorStr);
  return isNaN(num) ? 0 : Math.round(num);
}

function contieneNumeroDestino(texto) {
  const limpio = texto.replace(/\s+/g, "").toLowerCase();
  const patrones = [
    /3183192913/,
    /nequi/,
    /daviplata/,
    /rosellon/
  ];
  return patrones.some(p => p.test(limpio));
}

const validarComprobante = async (rutaImagen) => {
  console.log("🔍 Analizando imagen con OCR...");

  const rutaTemp = "temp_ocr.png";
  await preprocesarImagen(rutaImagen, rutaTemp);

  const { data: { text } } = await Tesseract.recognize(rutaTemp, "spa", {
    logger: m => console.log(m.status, m.progress)
  });

  await fs.unlink(rutaTemp).catch(() => {});
  const textoPlano = text.toLowerCase();
  console.log("📝 Texto detectado:", textoPlano);

  const lineas = textoPlano.split("\n").map(l => l.trim());
  let valorDetectado = 0;

  const patronesClave = [
    /¿cu[aá]nto/i,
    /valor de la transferencia/i,
    /valor transferido/i,
    /valor/i
  ];

 // Búsqueda directa por patrones exactos conocidos
for (let i = 0; i < lineas.length; i++) {
  const linea = lineas[i];

  // Caso 1: "Número Aprobación 58486" (todo en una línea)
  const matchNumAprob = linea.match(/número\s+aprobaci[oó]n[:\s\-#]*([0-9]{4,})/i);
  if (matchNumAprob) {
    referenciaDetectada = matchNumAprob[1].trim();
    break;
  }

  // Caso 2: "N° Aprobación:" en una línea y el valor en la siguiente
  if (/n[°º]?\s*aprobaci[oó]n[:\s\-]*$/i.test(linea) && lineas[i + 1]) {
    const matchSiguiente = lineas[i + 1].match(/([0-9]{4,})/);
    if (matchSiguiente) {
      referenciaDetectada = matchSiguiente[1].trim();
      break;
    }
  }
}


  if (valorDetectado === 0) {
    const posiblesValores = [...textoPlano.matchAll(/\$\s?([\d.,]+)/g)]
      .map(m => convertirValor(m[1]))
      .filter(v => v > 0 && v < 1000000);

    valorDetectado = posiblesValores.reduce((sum, v) => sum + v, 0);
  }

  const numeroValido = contieneNumeroDestino(textoPlano);
  if (!numeroValido) {
    console.warn("⚠️ Número o nombre de destino no encontrado");
  }

  let referenciaDetectada = "";

// ✅ Detección robusta de referencia (N° Aprobación, N* Aprobación, etc.)
for (let i = 0; i < lineas.length; i++) {
  const linea = lineas[i];

  // Ej: "N° Aprobación: 008857"
  const matchInline = linea.match(/n[°º\*]?\s*aprobaci[oó]n[:\s\-#]*([0-9]{4,8})/i);
  if (matchInline && matchInline[1]) {
    referenciaDetectada = matchInline[1].trim();
    break;
  }

  // Ej: "N° Aprobación:" en una línea y el número en la siguiente
  if (/n[°º\*]?\s*aprobaci[oó]n[:\s\-]*$/i.test(linea) && lineas[i + 1]) {
    const matchNext = lineas[i + 1].match(/([0-9]{4,8})/);
    if (matchNext && matchNext[1]) {
      referenciaDetectada = matchNext[1].trim();
      break;
    }
  }
}

// ✅ Fallback solo si aún no se detectó una referencia clara
if (!referenciaDetectada || referenciaDetectada.length < 5) {
  const posibles = textoPlano.match(/\b[a-z0-9]{5,}\b/gi);
  if (posibles) {
    const filtradas = posibles.filter(ref =>
      !["de", "no", "va", "para"].includes(ref.toLowerCase()) &&
      /^[a-z]*\d+[a-z\d]*$/i.test(ref)
    );

    const telefonoRegex = /^3\d{9}$/; // típico número colombiano
    const excluidos = ["3183192913", "3111234567", "3001234567"];

    const posiblesFiltradas = filtradas.filter(ref =>
      !telefonoRegex.test(ref) && !excluidos.includes(ref)
    );

    if (posiblesFiltradas.length) {
      referenciaDetectada = posiblesFiltradas[posiblesFiltradas.length - 1].trim();
    }
  }
}


  referenciaDetectada = referenciaDetectada.replace(/\s+/g, '');
  if (referenciaDetectada.length <= 2 || ["de", "no", "para"].includes(referenciaDetectada.toLowerCase())) {
    console.warn("⚠️ Referencia ambigua descartada:", referenciaDetectada);
    referenciaDetectada = "";
  }

  console.log("🔍 Resultado final:", { valorDetectado, numeroValido, referenciaDetectada });

  return {
    valido: !!referenciaDetectada, // ya no se requiere que el número también sea válido
    coincidencias: {
      numero: numeroValido,
      referencia: !!referenciaDetectada
    },
    valorDetectado,
    referenciaDetectada
  };
};

module.exports = { validarComprobante, preprocesarImagen };
