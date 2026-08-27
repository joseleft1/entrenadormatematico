# entrenamatico-app — sitio estático

**Una sola app, un solo archivo. Sin `npm`, sin Vite, sin build.**

## Qué hay aquí

```
wrangler.jsonc      la configuración: publica la carpeta sitio/
sitio/index.html    la app (Entrenamatico-v96.html, 1053 KB)
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
y dentro **`index.html` con 1053 KB**. Si el tamaño no coincide, el archivo no
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

## 🛑 Antes de publicarlo

**La licencia de esta aplicación no está declarada.** `LICENCIA_DE_SALIDA.md` §4
del proyecto Cuadernillos deja explícitamente pendiente la licencia de las dos
apps —Entrenamático y ExamLab—, mientras que los cuadernillos y sus derivados sí
salen bajo `CC BY-NC-SA 4.0`.

**Desplegar en internet es distribuir.** Conviene decidir la licencia antes, o al
menos saber que se está publicando sin ella.

---

*Empaquetado el 2026-08-26 con `empaqueta_sitio_estatico.py`.*
