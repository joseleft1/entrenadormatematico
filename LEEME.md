# entrenamatico-app — sitio estático

**Una sola app, un solo archivo. Sin `npm`, sin Vite, sin build.**

## Qué hay aquí

```
wrangler.jsonc      la configuración: publica la carpeta sitio/
sitio/index.html    la app (Entrenamatico-v109.html, 1253 KB)
```

## Cómo subirlo a GitHub — **arrastrando**

GitHub **sí acepta carpetas con subcarpetas**, pero solo si las *arrastras*. El
botón «choose your files» toma archivos sueltos y por eso parece que no se puede.

**1.** `github.com/new` → nombre **`entrenamatico-app`** → 🛑 **no marques el README** → *Create*

**2.** En la página que sale, clic en **«uploading an existing file»**

**3.** Abre esta carpeta, `Ctrl+A` para seleccionar **lo de adentro**, y arrastra a
la ventana del navegador. La carpeta `sitio` sube entera con su `index.html`.

**4.** *Commit changes*

> **Arrastra el contenido, no la carpeta `entrenamatico-app`.** Si arrastras la carpeta
> entera queda todo un nivel más abajo, y entonces hay que escribir `entrenamatico-app`
> en el campo **Root directory** de Cloudflare. Funciona igual, pero es un enredo
> de más.

**5. Compruébalo con los ojos:** en el repo tiene que verse la carpeta **`sitio`**,
y dentro **`index.html` con 1253 KB**. Si el tamaño no coincide, el archivo no
subió completo y nada más va a funcionar.

## Y en Cloudflare

**Workers & Pages → Create → Import a repository**

| Campo | Valor |
|---|---|
| **Root directory** | *(vacío)* |
| **Build command** | 🛑 **VACÍO — bórralo si Cloudflare lo rellenó solo** |
| **Deploy command** | `npx wrangler deploy` |

> 🛑 **El «Build command» es lo que tumba estos despliegues.** Cloudflare a veces
> escribe `npm run build` por su cuenta. **Aquí no hay nada que compilar**: el HTML
> ya está hecho. Si queda algo en ese campo, falla.

### Si prefieres la terminal

```
git init && git add . && git commit -m "entrenamatico-app"
git remote add origin https://github.com/TU-USUARIO/entrenamatico-app.git
git branch -M main && git push -u origin main
```

## ⚠️ Lo que este camino cuesta, dicho antes y no después

**Esto publica una foto, no el proyecto.** El repositorio **no trae el código
fuente**, así que:

- Cada versión nueva **se sube a mano**, reemplazando `sitio/index.html`
- Nadie puede modificar la app desde este repositorio
- Si el fuente y esta foto se separan, **gana la foto** — y nadie se entera

**El camino largo** —subir el proyecto Vite y compilar en cada despliegue— evita
eso, pero exige que el fuente del repositorio esté al día. **Hoy no lo está**, y
por eso el camino corto es el correcto por ahora.

## Licencia

**`CC BY-NC-SA 4.0`**, declarada el 28 ago 2026 para las dos apps
(`LICENCIA_DE_SALIDA.md` §6 del proyecto Cuadernillos). Va dentro del propio
archivo: encabezado, `<meta>`, datos estructurados y pie visible.

✎ *Hasta la v106 este LEEME decía que la licencia no estaba declarada. Copiaba el
§4 de ese documento, que quedó viejo cuando el §6 la declaró.*

**Los componentes de terceros conservan la suya.** La app trae al pie una tabla con
cada uno y el aviso copiado de su propio archivo. 🛑 **Uno sigue pendiente de
decisión del autor:** GSAP, que la propia tabla marca como licencia no permisiva.
Se usa sólo para animar y la app funciona sin él. **Publicar esta versión no lo
agrega** —ya estaba dentro de la v106—: lo que agrega es **decirlo**.

---

*Empaquetado el 2026-09-27 con `empaqueta_sitio_estatico.py`.*
