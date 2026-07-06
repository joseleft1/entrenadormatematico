// ============================================================================
// Polyfill de window.storage para fuera de Claude.ai
// La API window.storage (get/set/delete/list) solo existe dentro de los
// artifacts de Claude.ai. Fuera de ahí (GitHub Pages, Cloudflare Pages,
// tu propio servidor, etc.) no existe -- así que la reconstruimos aquí
// usando localStorage del navegador, con la misma forma de respuesta.
//
// Nota: localStorage es SOLO de este navegador/dispositivo (no se sincroniza
// entre alumnos ni dispositivos). Para progreso compartido entre varios
// dispositivos haría falta un backend real (ver notas al final de este
// archivo).
// ============================================================================

const PREFIX = "entrenador:"; // evita colisionar con otras apps en el mismo dominio

function fullKey(key, shared) {
  return `${PREFIX}${shared ? "shared:" : "solo:"}${key}`;
}

window.storage = {
  async get(key, shared = false) {
    const raw = localStorage.getItem(fullKey(key, shared));
    if (raw === null) return null;
    return { key, value: raw, shared };
  },

  async set(key, value, shared = false) {
    localStorage.setItem(fullKey(key, shared), value);
    return { key, value, shared };
  },

  async delete(key, shared = false) {
    const existed = localStorage.getItem(fullKey(key, shared)) !== null;
    localStorage.removeItem(fullKey(key, shared));
    return { key, deleted: existed, shared };
  },

  async list(prefix = "", shared = false) {
    const marker = fullKey(prefix, shared);
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(marker)) keys.push(k.slice(fullKey("", shared).length));
    }
    return { keys, prefix, shared };
  },
};

// ----------------------------------------------------------------------------
// Si más adelante quieres progreso compartido de verdad (un maestro viendo el
// avance de todo el grupo desde cualquier dispositivo), esta misma interfaz
// se puede apuntar a un backend real sin tocar el componente Entrenador:
// por ejemplo Supabase, Firebase, o un Worker de Cloudflare con KV storage.
// Bastaría con reemplazar las 4 funciones de arriba por llamadas fetch().
// ----------------------------------------------------------------------------
