# ProjectCode

Página de venta de **ProjectCode**, suite empresarial para tiendas de tecnología.

El sistema toma la lista de precios que manda el proveedor —normalmente un PDF de
cientos de referencias—, la convierte en catálogo, calcula qué cambió contra la
lista anterior y deja al asesor cotizando en segundos. Incluye documento
corporativo A4, historial con seguimiento comercial, cierre de caja y métricas
por vendedor.

## Qué hay acá

Solo el sitio de presentación. Es HTML, CSS y JavaScript estáticos, sin
dependencias ni proceso de build.

```
index.html              página principal con selector de versión (por defecto Codex o última elegida)
live.html               versión original (LIVE) con diseño SF Pro / Apple minimalista
codex.html              versión nueva (Codex) con diseño Space Grotesk / modo oscuro
comparar.html           comparador lado a lado con scroll sincronizado (split view)
version-switcher.css    estilos de la barra flotante conmutadora
version-switcher.js     lógica del conmutador, sincronización de posición y persistencia
styles.css              estilos de la versión Codex
script.js               interactividad de la versión Codex
img/                    capturas de la aplicación y diseño de Labs
video/                  demostraciones y sus imágenes de portada
fonts/                  Space Grotesk local y su licencia SIL OFL
```

Las capturas muestran la aplicación; Labs es un diseño en desarrollo, identificado
como tal en la página. Los datos de clientes que aparecen son ficticios.

Los videos se reproducen únicamente cuando el visitante lo decide. El inicial
usa una velocidad de 0,65× con una guía de atención sincronizada. Las capturas
se pueden ampliar, también a tamaño original. Las pestañas admiten flechas,
Inicio y Fin; Escape cierra la imagen ampliada. Sin JavaScript, se muestran
todas las funciones y las capturas siguen siendo enlaces a los archivos.

## Cómo se publica

GitHub Pages sirve la rama `main` desde la raíz. Cualquier cambio en `index.html`
o en los estilos, scripts y recursos queda publicado al hacer push.

Para verlo local, basta con abrir `index.html` en el navegador — no necesita
servidor.

## Contacto

WhatsApp [304 621 7300](https://wa.me/573046217300)

---

Copyright © 2026 ProjectCode. Todos los derechos reservados.

El contenido de este repositorio —textos, diseño e imágenes— es material
comercial propietario. No se concede licencia para reproducirlo, distribuirlo ni
crear obras derivadas. El software ProjectCode que aparece en las capturas se
licencia por separado y su código fuente no forma parte de este repositorio.
