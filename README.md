# Entrenamático — proyecto listo para publicar (v18)

Este proyecto convierte tu componente `Entrenador.jsx` (**Entrenamático v18**)
en un sitio web real que cualquiera puede abrir desde un navegador (celular o
computadora), con progreso guardado en el propio dispositivo (vía
`localStorage`).

**Qué trae la v18 sobre la v17 (Resolvedor: señalización + cobertura PM I-VI):**
- **Títulos de paso**: cada paso del desglose ahora tiene nombre pedagógico visible ("Calcular el discriminante", "Juntar los términos con x", "Comprobar la solución").
- **Doble resaltado**: rojo = lo que se está operando o lo que sigue; dorado = el resultado recién calculado (principio de señalización, mismo recurso que usa Photomath).
- **Nueva familia en el Resolvedor**: Derivada (regla de la potencia) — 10 tipos de problema en total.
- **Desglose inline extendido a los 6 semestres de Pensamiento Matemático** (antes solo 3 propósitos de PM I y PM III): ahora 17 propósitos mapeados en PM I-VI, incluyendo enteros, potencias/raíces, notación científica, ecuaciones, sistemas, cuadráticas, distancia entre puntos, límites, derivadas, conjuntos y permutaciones. Los propósitos genuinamente conceptuales (simetría, muestreo, cónicas…) quedan fuera a propósito — no hay algoritmo que desglosar ahí.
- El botón de desglose se decide **por pregunta**, no por propósito: si la variante generada no es desglosable, no aparece nada — comportamiento aditivo, no rompe lo demás.
- Verificación previa a esta integración: auditoría de código (13 bloques curriculares de la v17 byte por byte idénticos en la v18, `STORAGE_KEY` intacto, sin dependencias nuevas, sin `eval()`) + prueba en navegador real en los 6 semestres + regresión de lo existente (diagnóstico, práctica, Aprender, casos reales, calculadora, graficador, Resolvedor) — **todo pasa, 0 errores de consola**.

**Rollback:** si algo falla en producción, `rollback/Entrenador-v17.jsx` en este
mismo zip es la versión anterior exacta (la que ya tenías en producción). Para
revertir: reemplaza `src/Entrenador.jsx` con ese archivo en GitHub y haz commit
— Cloudflare redeploya solo. El progreso de los alumnos no se pierde (`STORAGE_KEY`
no ha cambiado nunca).

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

Como ya tienes el repositorio conectado, solo reemplaza `src/Entrenador.jsx`
y `README.md` con los de este zip (ver los 4 pasos de arriba). Si es un
repositorio nuevo:
```bash
git init
git add .
git commit -m "Entrenamático v18 — señalización y cobertura PM I-VI"
git branch -M main
git remote add origin https://github.com/TU-USUARIO/TU-REPO.git
git push -u origin main
```

## Paso 2 — Conéctalo a Cloudflare Pages

(Solo la primera vez; si ya está conectado, el push del Paso 1 basta.)
1. https://dash.cloudflare.com → **Workers & Pages** → **Create** → **Pages** → **Connect to Git**.
2. Selecciona el repositorio.
3. Configuración de build:

   | Campo | Valor |
   |---|---|
   | **Framework preset** | Vite |
   | **Build command** | `npm run build` |
   | **Build output directory** | `dist` |

4. **Save and Deploy**. Cada `git push` a `main` redeploya automáticamente.

## Paso 3 — Probarlo en tu celular

Abre tu URL desde el navegador del celular. En Herramientas → 🧩 Resolvedor
verás la nueva familia "Derivada (potencia)". Al practicar cualquier semestre
de PM y responder, busca el botón "Ver este ejercicio paso a paso" — ahora
aparece en 17 propósitos distintos, con el paso resaltado en rojo/dorado.

---

## Probarlo en tu computadora ANTES de subirlo (opcional)

```bash
npm install
npm run dev
```

## Estructura del proyecto

```
deploy-entrenador/
├── index.html
├── package.json
├── vite.config.js
├── rollback/
│   └── Entrenador-v17.jsx   versión anterior exacta, por si hay que revertir
└── src/
    ├── main.jsx
    ├── storage-polyfill.js
    └── Entrenador.jsx        Entrenamático v18 completo
```

## Si más adelante quieres progreso compartido real (backend)

La forma más simple con Cloudflare es **Workers + KV**: un Worker gratuito que
expone `get/set` por HTTP, cambiando las 4 funciones de `storage-polyfill.js`
para que hagan `fetch()` en vez de usar `localStorage`. El componente
`Entrenador.jsx` no necesitaría ningún cambio.
