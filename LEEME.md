# entrenadormatematico — sitio estático

**Una sola app, un solo archivo. Sin `npm`, sin Vite, sin build.**

## Qué hay aquí

```
wrangler.jsonc      la configuración: publica la carpeta sitio/
sitio/index.html    la app (Entrenamatico-v96.html, 1053 KB)
```

## Cómo se despliega

```
npx wrangler deploy
```

**Y eso es todo.** No hay comando de build porque no hay nada que construir.

### Si lo conectas a Cloudflare desde Git

En **Workers & Pages → Settings → Build**:

| Campo | Valor |
|---|---|
| **Root directory** | *(la raíz del repo, o la carpeta que contiene `wrangler.jsonc`)* |
| **Build command** | **déjalo vacío** |
| **Deploy command** | `npx wrangler deploy` |

> 🛑 **Si dejas un comando de build, vuelve a fallar.** El error anterior
> —*«Could not detect a directory containing static files»*— venía de que la
> configuración apuntaba a `dist/`, que solo existe después de compilar con Vite.
> **Aquí no hay `dist/`: hay `sitio/`, y ya está lleno.**

## ⚠️ Lo que este camino cuesta, dicho antes y no después

**Esto publica una foto, no el proyecto.** El repositorio **no trae el código
fuente**, así que:

- Cada versión nueva **se sube a mano**, reemplazando `sitio/index.html`
- Nadie puede modificar la app desde este repositorio
- Si el fuente y esta foto se separan, **gana la foto** — y nadie se entera

**El camino largo** —subir el proyecto Vite y compilar en cada despliegue— evita
eso, pero exige que el fuente del repositorio esté al día. **Hoy no lo está**, y
por eso el camino corto es el correcto por ahora.

## 🛑 Antes de publicarlo

**La licencia de esta aplicación no está declarada.** `LICENCIA_DE_SALIDA.md` §4
del proyecto Cuadernillos deja explícitamente pendiente la licencia de las dos
apps —Entrenamático y ExamLab—, mientras que los cuadernillos y sus derivados sí
salen bajo `CC BY-NC-SA 4.0`.

**Desplegar en internet es distribuir.** Conviene decidir la licencia antes, o al
menos saber que se está publicando sin ella.

---

*Empaquetado el 2026-08-26 con `empaqueta_sitio_estatico.py`.*

## 🛑 Sin carpetas, a propósito

**Los cinco archivos van en la RAÍZ del repositorio.** No hay que crear ninguna
carpeta — que es lo que GitHub por web no siempre deja hacer.

**Arrastra los archivos, no la carpeta.** Y después **comprueba que `index.html`
diga 1053 KB**: el archivo grande es el que se pierde en las subidas por
navegador, y es exactamente lo que hizo fallar el despliegue anterior.

Si no ves `.assetsignore` ni `.gitignore`, empiezan con punto y Windows los
esconde: **Vista → Mostrar → Elementos ocultos**. Omitir `.gitignore` no afecta;
omitir `.assetsignore` deja tu configuración accesible en la URL pública — no es
peligroso, es feo.
