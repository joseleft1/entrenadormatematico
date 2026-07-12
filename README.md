# Entrenamático — proyecto listo para publicar (v17)

Este proyecto convierte tu componente `Entrenador.jsx` (**Entrenamático v17**)
en un sitio web real que cualquiera puede abrir desde un navegador (celular o
computadora), con progreso guardado en el propio dispositivo (vía
`localStorage`).

**Qué trae la v17 (Resolvedor paso a paso completo, fases 1-3) sobre la v14:**
- Nueva herramienta **"🧩 Resolvedor"** (tercera pestaña de Herramientas, junto a la calculadora y el graficador): el alumno elige el tipo de problema, lo teclea, y ve el desglose paso a paso animado — navegador de pasos ← →, resaltado de lo que cambió en cada paso, y mini-visual donde aplica.
- **9 familias de problemas**, agrupadas por área. Matemáticas: jerarquía de operaciones, ecuación lineal, regla de tres, sistema 2×2, ecuación cuadrática. Ciencias: densidad, pH, ley de Ohm (voltaje), energía cinética.
- **4 mini-visuales por paso**: balanza en equilibrio (lineales), tabla de proporción (regla de tres), gráfica de las dos rectas con su intersección (sistemas), parábola con raíces marcadas (cuadráticas) y escala de color de pH.
- **Desglose inline en los ejercicios**: tras responder una pregunta en los propósitos operables (jerarquía PM I·PF7, ecuaciones lineales PM III·P1, cuadráticas PM III·P4), aparece el botón "🧩 Ver este ejercicio paso a paso", que resuelve la instancia exacta que el alumno acaba de ver. En los demás propósitos no aparece nada — el cambio es puramente aditivo.
- El motor **genera** los pasos desde el núcleo de cálculo propio (parser recursivo, sin `mathjs`, sin `eval()`, sin CAS): cobertura infinita dentro de cada familia, no ejemplos escritos a mano.
- Verificación previa a esta integración: auditoría de código (contenido curricular de la v14 byte por byte idéntico, cero identificadores perdidos, `STORAGE_KEY` intacto, sin dependencias nuevas) + batería de regresión de 20 pruebas en navegador real (diagnóstico, práctica, Aprender, casos reales, calculadora, graficador, las 9 familias del Resolvedor, el desglose inline en las 3 familias y el caso negativo) — **20/20 pasan, 0 errores de consola**.

**Rollback:** si algo falla en producción, el archivo `rollback/Entrenador-v14.jsx`
de este mismo zip es la versión anterior exacta. Para revertir: reemplaza
`src/Entrenador.jsx` con ese archivo en GitHub y haz commit — Cloudflare
redeploya solo. El progreso de los alumnos NO se pierde en ningún sentido
(`STORAGE_KEY` no ha cambiado nunca).

## ⚠️ Qué se adaptó respecto al archivo original

El archivo que traías de Claude.ai usa `window.storage`, una API que **solo
existe dentro de los artifacts de Claude.ai**. Fuera de ahí no existe, así
que se agregó `src/storage-polyfill.js`, que reconstruye esa misma API usando
`localStorage` del navegador. **No se tocó ni una línea de la lógica del
Entrenador** — el polyfill se carga antes y ya.

Limitación real a tener en cuenta: `localStorage` guarda el progreso *solo en
ese navegador y dispositivo*. Si un alumno entra desde el celular y luego
desde una computadora, verá progreso distinto en cada uno (no se sincroniza
solo). Para progreso compartido entre dispositivos haría falta un backend
real — hay una nota de cómo extenderlo al final de `storage-polyfill.js`.

---

## Para actualizaciones futuras — NO hay que repetir todo esto

Este zip ya trae corregido el problema de versión de Vite (6.3.0) que causaba el
error `"cannot be automatically configured"` en Cloudflare. **Ese fix es de una
sola vez** — vive en `package.json`, y una vez que esté bien en tu repositorio
de GitHub, no se vuelve a tocar.

De ahora en adelante, cuando tengas una versión nueva del Entrenamático,
**solo necesitas reemplazar un archivo**: `src/Entrenador.jsx`. Todo lo demás
(`package.json`, `vite.config.js`, `index.html`, `storage-polyfill.js`,
`main.jsx`) se queda igual, porque no depende de qué contenido tenga el
Entrenador — son la "tubería" del sitio, no el contenido.

Para reemplazarlo en GitHub (sin terminal):
1. Entra a tu repositorio → carpeta `src/` → abre `Entrenador.jsx`
2. Botón de basura 🗑️ o los tres puntos → **Delete file** (o edítalo directo si el archivo nuevo no es enorme)
3. **Add file → Upload files** → arrastra el `Entrenador.jsx` nuevo
4. Commit changes → Cloudflare redeploya solo, sin volver a pedir configuración

---

## Paso 1 — Subirlo a GitHub

1. Crea un repositorio nuevo en https://github.com/new (puede ser público o privado) — **o usa el que ya tienes**: en ese caso solo reemplaza `src/Entrenador.jsx` y `README.md` con los de este zip.
2. En tu computadora, dentro de esta carpeta (`deploy-entrenador/`), corre:
   ```bash
   git init
   git add .
   git commit -m "Entrenamático v17 — Resolvedor paso a paso"
   git branch -M main
   git remote add origin https://github.com/TU-USUARIO/TU-REPO.git
   git push -u origin main
   ```

## Paso 2 — Conéctalo a Cloudflare Pages

(Solo la primera vez; si ya está conectado, el push del Paso 1 basta.)
1. Entra a https://dash.cloudflare.com → **Workers & Pages** → **Create** →
   pestaña **Pages** → **Connect to Git**.
2. Autoriza a Cloudflare y selecciona el repositorio.
3. Configuración de build:

   | Campo | Valor |
   |---|---|
   | **Framework preset** | Vite |
   | **Build command** | `npm run build` |
   | **Build output directory** | `dist` |

4. **Save and Deploy**. Cada `git push` a `main` redeploya automáticamente.

## Paso 3 — Probarlo en tu celular

Abre la URL `https://tu-proyecto.pages.dev` (o tu dominio de Workers) desde el
navegador del celular. Al entrar a Herramientas verás la nueva pestaña
🧩 Resolvedor, y al practicar jerarquía (PM I), ecuaciones lineales o
cuadráticas (PM III), el botón "Ver este ejercicio paso a paso" tras responder.

---

## Probarlo en tu computadora ANTES de subirlo (opcional)

Si tienes Node.js instalado (18 o más reciente):
```bash
npm install
npm run dev
```
Abre lo que te indique la terminal (normalmente `http://localhost:5173`).

## Estructura del proyecto

```
deploy-entrenador/
├── index.html              punto de entrada HTML
├── package.json             dependencias (React + Vite)
├── vite.config.js           configuración de build
├── rollback/
│   └── Entrenador-v14.jsx   versión anterior exacta, por si hay que revertir
└── src/
    ├── main.jsx              arranca la app y carga el polyfill primero
    ├── storage-polyfill.js   reemplaza window.storage con localStorage
    └── Entrenador.jsx        Entrenamático v17 completo
```

## Si más adelante quieres progreso compartido real (backend)

Cuando quieras que el progreso de un alumno se vea igual en su celular y en
la computadora del salón (o que el profesor vea el avance de todo el grupo),
la forma más simple con Cloudflare es usar **Cloudflare Workers + KV**: un
Worker gratuito que expone `get/set` por HTTP, y cambiar las 4 funciones de
`storage-polyfill.js` para que hagan `fetch()` a ese Worker en vez de usar
`localStorage`. El componente `Entrenador.jsx` no necesitaría ningún cambio.
