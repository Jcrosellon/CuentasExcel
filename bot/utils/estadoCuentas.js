// /utils/estadoCuentas.js

const perfilMaximos = {
    "NETFLIX": 5,
    "TELE LATINO": 6,
    "DISNEY": 7,
    "AMAZON PRIME": 6,
    "MAX PLATINO": 5,
    "IPTV": 3,
  };
  
  function obtenerEstadoDeCuentas(clientes) {
    const cuentas = {};
    for (const cliente of clientes) {
      const cuenta = (cliente["CUENTA"] || "").toUpperCase().trim();
      const usuario = (cliente["USUARIO"] || "").trim();
      const clave = (cliente["CLAVE"] || "").trim();
      const perfiles = parseInt(cliente["PERFIL"] || 1);
      if (!cuenta || !usuario || isNaN(perfiles)) continue;
  
      const claveCuenta = `${cuenta}|${usuario}`;
      if (!cuentas[claveCuenta]) {
        cuentas[claveCuenta] = {
          cuenta,
          usuario,
          clave,
          usados: 0,
          maximos: perfilMaximos[cuenta] || 1,
        };
      }
      cuentas[claveCuenta].usados += perfiles;
    }
  
    return Object.values(cuentas).map(c => ({
      cuenta: c.cuenta,
      usuario: c.usuario,
      clave: c.clave,
      usados: c.usados,
      disponibles: Math.max(c.maximos - c.usados, 0),
      maximos: c.maximos,
    }));
  }
  
  function generarResumenEstado(resumen) {
    if (resumen.length === 0) return "😐 No se encontraron cuentas para mostrar estado.";
  
    resumen.sort((a, b) => b.disponibles - a.disponibles);
  
    let mensaje = "📊 *Estado de Cuentas y Perfiles:*";
    for (const r of resumen) {
      let estado = "";
      if (r.usados >= r.maximos) {
        estado = "❌ ¡LLENA!";
      } else if (r.usados >= r.maximos - 1) {
        estado = "⚠️ Casi llena";
      } else {
        estado = "✅ Disponible";
      }
  
      mensaje += `\n\n🔹 ${r.cuenta}:\n` +
        `👤 Usuario: *${r.usuario}*\n` +
        `🔑 Clave: *${r.clave}*\n` +
        `👥 Perfiles usados: ${r.usados}/${r.maximos}\n` +
        `📦 Disponibles: ${r.disponibles}\n` +
        `📊 Estado: ${estado}\n` +
        `────────────────────`;
    }
  
    return mensaje;
  }
  
  module.exports = {
    obtenerEstadoDeCuentas,
    generarResumenEstado,
  };