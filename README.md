# Entrenamático — proyecto listo para publicar (v14)

Este proyecto convierte tu componente `entrenador-v14.jsx` (**Entrenamático**)
en un sitio web real que cualquiera puede abrir desde un navegador (celular o
computadora), con progreso guardado en el propio dispositivo (vía
`localStorage`).

**Qué trae esta versión (v14) sobre la v13:**
- Se corrigió una repetición sistemática detectada por el usuario: 81 de los 90 interactivos "Aprender" tenían un párrafo interno que casi calcaba el texto de la caja "¿Por qué funciona?" de arriba (el caso más notorio: "Descubrimiento de la célula" en CNEyT VI repetía el dato de Hooke/microscopio hasta 3 veces). Los 81 párrafos se reescribieron para aportar información nueva (lectura de un valor límite, error común, o extensión práctica) en vez de repetir el mismo concepto.
- Se diversificó también la pregunta de práctica de ese propósito (ya no repite Hooke por tercera vez).
- Verificado: los 90 "Aprender" abren sin errores; similitud de texto entre caja e interior bajó de ~100% a menos de 50% en 80 de 81 casos.

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

De ahora en adelante, cuando tengas una versión nueva del Entrenador (v9, v10...),
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



1. Crea un repositorio nuevo en https://github.com/new (puede ser público o privado).
2. En tu computadora, dentro de esta carpeta (`deploy-entrenador/`), corre:
   ```bash
   git init
   git add .
   git commit -m "Entrenador MCCEMS listo para publicar"
   git branch -M main
   git remote add origin https://github.com/TU-USUARIO/TU-REPO.git
   git push -u origin main
   ```
   (Reemplaza `TU-USUARIO/TU-REPO` por los tuyos — GitHub te los muestra
   justo después de crear el repositorio, en el botón "…or push an existing
   repository from the command line".)

## Paso 2 — Conéctalo a Cloudflare Pages

1. Entra a https://dash.cloudflare.com → **Workers & Pages** → **Create** →
   pestaña **Pages** → **Connect to Git**.
2. Autoriza a Cloudflare a leer tu cuenta de GitHub (si es la primera vez) y
   selecciona el repositorio que acabas de crear.
3. En la pantalla de configuración de build, pon exactamente esto:

   | Campo | Valor |
   |---|---|
   | **Framework preset** | Vite |
   | **Build command** | `npm run build` |
   | **Build output directory** | `dist` |

4. Dale a **Save and Deploy**. Cloudflare instala las dependencias (ahí sí
   tiene acceso completo a npm, a diferencia de este entorno) y publica el
   sitio en un dominio tipo `tu-proyecto.pages.dev`.
5. Cada vez que hagas `git push` a `main`, Cloudflare vuelve a construir y
   publicar automáticamente — no hay que repetir el Paso 2.

## Paso 3 — Probarlo en tu celular

Abre la URL `https://tu-proyecto.pages.dev` desde el navegador de tu celular
(no necesita ser una app: es una página web normal). Todo el progreso
(diagnósticos, propósitos dominados, XP) se guarda ahí mismo con
`localStorage`.

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
└── src/
    ├── main.jsx              arranca la app y carga el polyfill primero
    ├── storage-polyfill.js   reemplaza window.storage con localStorage
    └── Entrenador.jsx        tu componente completo, sin modificar
```

## Si más adelante quieres progreso compartido real (backend)

Cuando quieras que el progreso de un alumno se vea igual en su celular y en
la computadora del salón (o que el profesor vea el avance de todo el grupo),
la forma más simple con Cloudflare es usar **Cloudflare Workers + KV**: un
Worker gratuito que expone `get/set` por HTTP, y cambiar las 4 funciones de
`storage-polyfill.js` para que hagan `fetch()` a ese Worker en vez de usar
`localStorage`. El componente `Entrenador.jsx` no necesitaría ningún cambio.
