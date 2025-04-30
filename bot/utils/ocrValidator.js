const sharp = require("sharp");
const Tesseract = require("tesseract.js");
const fs = require("fs/promises");

async function preprocesarImagen(rutaOriginal, rutaProcesada) {
  await sharp(rutaOriginal)
    .resize({ width: 1000 })
    .grayscale()
    .threshold(150)
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
    /rosellon/,
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

  // Buscar primero basado en palabras clave
  for (let i = 0; i < lineas.length; i++) {
    const linea = lineas[i];

    if (patronesClave.some(p => p.test(linea))) {
      const matchMismaLinea = linea.match(/([\d.,]+)/);
      if (matchMismaLinea) {
        valorDetectado = convertirValor(matchMismaLinea[1]);
        break;
      }

      if (lineas[i + 1]) {
        const matchSiguiente = lineas[i + 1].match(/([\d.,]+)/);
        if (matchSiguiente) {
          valorDetectado = convertirValor(matchSiguiente[1]);
          break;
        }
      }
    }
  }

  // Si no encontramos con claves, usamos el método de los "$"
  if (valorDetectado === 0) {
    const posiblesValores = [...textoPlano.matchAll(/\$\s?([\d.,]+)/g)]
      .map(m => convertirValor(m[1]))
      .filter(v => v > 0 && v < 1000000);

    valorDetectado = posiblesValores.reduce((sum, v) => sum + v, 0);
  }

  // Validación de número destino
  const numeroValido = contieneNumeroDestino(textoPlano);
  if (!numeroValido) console.warn("⚠️ Número o nombre de destino no encontrado");

  // Detectar referencia
  let referenciaDetectada = "";
  const patronesReferencia = [
    /n[\u00fau]mero\s+de\s+comprobante[:\s\-]*([a-z0-9\-]+)/i,
    /n[\u00ba\u00b0o]\s*[:\-]?\s*([a-z0-9\-]{4,})/i,
    /referencia[:\s\-]*([a-z0-9\-]{4,})/i,
    /comprobante\s*no\.?\s*[:\-]?\s*([a-z0-9\-]+)/i,
    /aprobaci[\u00f3o]n[:\s\-#]*([a-z0-9\-]{4,})/i,
    /motivo[:\s\-]*([a-z0-9\s]{4,})/i
  ];

  for (let i = 0; i < lineas.length; i++) {
    const linea = lineas[i];

    for (const patron of patronesReferencia) {
      const match = linea.match(patron);
      if (match && match[1]) {
        referenciaDetectada = match[1].trim();
        break;
      }
    }

    if (!referenciaDetectada && /n[\u00fau]mero\s+de\s+comprobante/i.test(linea) && lineas[i + 1]) {
      const siguiente = lineas[i + 1].trim();
      const posibleNumero = siguiente.match(/\b[a-z0-9\-]{4,}\b/i);
      if (posibleNumero) {
        referenciaDetectada = posibleNumero[0].trim();
        break;
      }
    }

    if (referenciaDetectada) break;
  }

  if (!referenciaDetectada) {
    const posibles = textoPlano.match(/\b[a-z0-9]{5,}\b/gi);
    if (posibles) {
      const filtradas = posibles.filter(ref => !["de", "no", "va", "para"].includes(ref.toLowerCase()));
      referenciaDetectada = filtradas[filtradas.length - 1] || "";
    }
  }

  referenciaDetectada = referenciaDetectada.replace(/\s+/g, '');
  if (referenciaDetectada.length <= 2 || ["de", "no", "para"].includes(referenciaDetectada.toLowerCase())) {
    console.warn("⚠️ Referencia ambigua descartada:", referenciaDetectada);
    referenciaDetectada = "";
  }

  console.log("🔍 Resultado final:", { valorDetectado, numeroValido, referenciaDetectada });

  return {
    valido: numeroValido && !!referenciaDetectada,
    coincidencias: {
      numero: numeroValido,
      referencia: !!referenciaDetectada
    },
    valorDetectado,
    referenciaDetectada
  };
};

module.exports = { validarComprobante, preprocesarImagen };
