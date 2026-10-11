# ProjectCode

Página de venta de **ProjectCode**, suite empresarial para tiendas de tecnología.

El sistema toma la lista de precios que manda el proveedor —normalmente un PDF de
cientos de referencias—, la convierte en catálogo, calcula qué cambió contra la
lista anterior y deja al asesor cotizando en segundos. Incluye documento
corporativo A4, historial con seguimiento comercial, recogidas entre sedes,
cierre de caja y métricas por vendedor.

## Qué hay acá

Solo el sitio de presentación: HTML, CSS y JavaScript estáticos, sin dependencias
y sin build.

```
index.html                la página completa
assets/site.css           estilos
assets/site.js            barra, pestañas, aparición y las maquetas animadas
assets/hilos.js           los hilos de luz de fondo (imagen de marca)
assets/img/               cotizaciones de ejemplo generadas por la aplicación
assets/fonts/             tipografía Inter, con su licencia (SIL OFL 1.1)
favicon.svg               ícono de la pestaña
apple-touch-icon.png      ícono al agregar la página a la pantalla de inicio
og.jpg                    imagen que se ve al compartir el enlace por WhatsApp
```

## Diseño

- Fondo casi negro y un único acento violeta (`#8b5cff`), con azul en los hilos de
  fondo. Paneles de vidrio translúcido sobre el fondo.
- Titulares sans (Inter, peso 500) con una palabra en cursiva serif; etiquetas,
  cifras y tiempos en monoespaciada. Las dos tipografías extra son del sistema,
  no se descargan.
- La imagen de marca es un haz de hilos de luz (`assets/hilos.js`) que cruza la
  pantalla, se cierra en un nudo y se desplaza a medida que se baja por la página.
- El producto se muestra con **maquetas animadas** hechas en HTML, que imitan la
  aplicación (Total cotización, Catálogo, Copiar imagen, PDF). Las cotizaciones de
  `assets/img/` (la imagen para WhatsApp y la hoja A4) las genera la aplicación
  real, cargada con una tienda y productos ficticios ("Su Tienda S.A.S.", NIT
  900.000.000-0). Ninguna cifra ni producto sale de la lista de precios de un
  cliente.
- La sección «Cómo ahorra tiempo» corre, paso por paso, lo que hace el sistema
  cuando llega una lista nueva. Los tiempos son de ejemplo.
- **No hace ninguna petición a terceros**: sin analítica, sin cookies y sin
  tipografías externas.
- Respeta `prefers-reduced-motion`: los hilos quedan quietos, las maquetas se
  muestran ya terminadas y todo el texto aparece de una vez. El pie tiene además
  un botón para pausar todas las animaciones.
- Contraste AA en todo el texto: el gris más tenue (`--dim`) da 4,8:1 sobre los
  paneles, y los botones violeta usan un tono más oscuro (`--acc-btn`) para que
  el blanco encima pase 4,5:1.

## Cómo verlo local

```
python3 -m http.server 8000
```

y abrir http://localhost:8000.

## Cómo se publica

GitHub Pages sirve la rama `main` desde la raíz, y Vercel despliega la misma rama.
Cualquier cambio en `main` queda publicado al hacer push. Las rutas son relativas,
así que funciona igual en `/projectcode/` que en la raíz de un dominio propio. Si
se compra dominio, cambiar la dirección de `og:image` en `index.html`, que apunta
al de Vercel.

## Contacto

WhatsApp [304 621 7300](https://wa.me/573046217300)

---

Copyright © 2026 ProjectCode. Todos los derechos reservados.

El contenido de este repositorio —textos y diseño— es material comercial
propietario. No se concede licencia para reproducirlo, distribuirlo ni crear obras
derivadas. El software ProjectCode que describe la página se licencia por separado
y su código fuente no forma parte de este repositorio. La tipografía Inter se
distribuye bajo la licencia SIL Open Font License 1.1 (`assets/fonts/Inter-OFL.txt`).
