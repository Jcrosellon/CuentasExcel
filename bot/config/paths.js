const path = require("path");

const ROOT = path.resolve(__dirname, "../.."); // carpeta raíz del proyecto

module.exports = {
  ROOT,
  catalogo: path.join(ROOT, "bot", "catalogo.txt"),
  config: path.join(ROOT, "bot", "config", "config.json"),
  credentials: path.join(ROOT, "bot", "config", "credentials.json"),

  // Todos estos van ahora en /data/
  confirmados: path.join(ROOT, "bot", "data", "confirmados.json"),
  mensajesEnviados: path.join(ROOT, "bot", "data", "mensajesEnviados.json"),
  pendienteActual: path.join(ROOT, "bot", "data", "pendiente_actual.json"),
  pendientes: path.join(ROOT, "bot", "data", "pendientes.json"),
  pendienteNuevo: path.join(ROOT, "bot", "data", "pendiente_nuevo.json"),
  pendientesSI: path.join(ROOT, "bot", "data", "pendientes_si.json"),   // 👈 nuevo
  respuestas: path.join(ROOT, "bot", "data", "respuestas.json"),         // 👈 nuevo
  comprobantesPendientes: path.join(ROOT, "bot", "data", "comprobantes_pendientes.json"), // 👈 nuevo
};
