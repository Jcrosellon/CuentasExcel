const Tesseract = require("tesseract.js");

// ✅ Convierte "$40.000,00" o "40,000.00" en 40000
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

// 🔍 Detecta si el número o el nombre está presente
function contieneNumeroDestino(texto, numeroEsperado = "3183192913") {
  const limpio = texto.replace(/\s+/g, '').toLowerCase();

  const patronesNumeros = [
    /3\s*1\s*8\s*3\s*1\s*9\s*2\s*9\s*1\s*3/,
    /318\s*319\s*2913/,
    /31\s*83\s*19\s*29\s*13/,
    /s185192013/, // error típico
  ];

  const patronesNombre = [
    "jose carlos rosellon",     // nombre completo
    "rosellon lozano",          // apellido completo
    "rosellon l",               // ofuscado
    "jc rosellon",              // iniciales
    "jose c rosellon",          // común
  ];

  const coincideNumero = patronesNumeros.some(r => r.test(limpio));
  const coincideNombre = patronesNombre.some(n => limpio.includes(n.replace(/\s+/g, '')));

  return coincideNumero || coincideNombre;
}

const validarComprobante = async (rutaImagen, valorMinimo = 20000) => {
  console.log("🔍 Analizando imagen con OCR...");

  const { data: { text } } = await Tesseract.recognize(rutaImagen, "spa", {
    logger: m => console.log(m.status, m.progress)
  });

  const textoPlano = text.toLowerCase();
  console.log("📝 Texto detectado:", textoPlano);

  const posiblesValores = [...textoPlano.matchAll(/\$\s?([\d.,]+)/g)]
    .map(match => convertirValor(match[1]))
    .filter(v => v > 0 && v < 1000000);

  const valorDetectado = Math.max(...posiblesValores, 0);
  console.log("💵 Valores detectados:", posiblesValores);
  console.log("💵 Valor detectado específicamente:", valorDetectado);

  const valorValido = valorDetectado >= parseFloat(valorMinimo);
  if (!valorValido) {
    console.warn("⚠️ Valor detectado es insuficiente:", valorDetectado);
  }

  const numeroValido = contieneNumeroDestino(textoPlano);
  if (!numeroValido) {
    console.warn("⚠️ No se encontró número ni nombre esperado.");
  }

  let referenciaDetectada = "";

  // 🧠 Buscamos líneas que contengan la palabra "referencia" y extraemos lo que sigue
  const referenciaLinea = textoPlano
    .split("\n")
    .map(l => l.trim())
    .find(l => l.includes("referencia"));
  
  if (referenciaLinea) {
    const matchRef = referenciaLinea.match(/referencia\s*[:\-]?\s*([a-z0-9\-]+)/i);
    if (matchRef && matchRef[1]) {
      referenciaDetectada = matchRef[1].trim();
    }
  }
  
  // 🔍 Fallback si no encontramos nada
  if (!referenciaDetectada) {
    const posiblesRefs = textoPlano.match(/\b[a-z0-9]{6,}\b/g);
    if (posiblesRefs && posiblesRefs.length > 0) {
      referenciaDetectada = posiblesRefs[posiblesRefs.length - 1];
    }
  }
  

  referenciaDetectada = referenciaDetectada.replace(/\s+/g, '');
  const valido = valorValido && numeroValido && !!referenciaDetectada;

  console.log("🔎 valorValido:", valorValido, "numeroValido:", numeroValido, "referencia:", referenciaDetectada);

  return {
    valido,
    coincidencias: {
      valor: valorValido,
      numero: numeroValido,
      referencia: !!referenciaDetectada
    },
    valorDetectado,
    referenciaDetectada
  };
};

module.exports = { validarComprobante };
