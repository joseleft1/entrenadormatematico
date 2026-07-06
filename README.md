# Entrenador MCCEMS — proyecto listo para publicar (v8)

Este proyecto convierte tu componente `entrenador-v8.jsx` en un sitio web real
que cualquiera puede abrir desde un navegador (celular o computadora), con
progreso guardado en el propio dispositivo (vía `localStorage`).

**Qué trae esta versión (v8):**
- Las 12 materias completas: Pensamiento Matemático I-VI y CNEyT I-VI, 100% Modelo Educativo 2025 (propósitos formativos, sin nada del Modelo 2023).
- 90/90 propósitos con módulo "Aprender" interactivo en vivo.
- 13 "Casos reales" interactivos repartidos en las 12 materias, cada uno con 3 capas: planteamiento (piensa antes de ver la respuesta), interactivo para probar con tus propios números, y una pregunta de auto-verificación con retroalimentación.
- Selector de dos niveles: primero elige área (Matemáticas / CNEyT), luego el semestre (I-VI).

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

## Paso 1 — Súbelo a GitHub

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
