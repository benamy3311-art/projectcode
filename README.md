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
assets/site.js            barra superior, pestañas y aparición al hacer scroll
assets/constelacion.js    la constelación de partículas (imagen de marca)
assets/fonts/             tipografía Inter, con su licencia (SIL OFL 1.1)
favicon.svg               ícono de la pestaña
apple-touch-icon.png      ícono al agregar la página a la pantalla de inicio
og.jpg                    imagen que se ve al compartir el enlace por WhatsApp
```

## Diseño

- Fondo negro puro, un único acento violeta (`#8052ff`) reservado para el botón
  principal, ámbar (`#ffb829`) para las etiquetas y verde para lo que baja. Sin
  tarjetas, bordes ni sombras: todo flota sobre el negro.
- Titulares livianos (peso 400) a tamaños enormes; el cuerpo, en peso 200.
- La imagen de marca es una nube de miles de triángulos que hace de fondo de toda
  la página y **cambia de forma según la sección** que se está leyendo (un chip,
  una lista de precios, tres sedes conectadas, un candado...). Cada forma es una
  función en `SCENES`, dentro de `assets/constelacion.js`.
- **No hace ninguna petición a terceros**: sin analítica, sin cookies y sin
  tipografías externas. Toda la página pesa unos 175 KB.
- No hay capturas del producto. Las cifras y los productos de las ilustraciones
  son de ejemplo; ninguno sale de la lista de precios de un cliente.
- Respeta `prefers-reduced-motion`: la constelación queda quieta y todo el texto
  aparece de una vez.

## Cómo verlo local

```
python3 -m http.server 8000
```

y abrir http://localhost:8000. Para depurar la constelación, la página acepta
parámetros en la dirección: `?estatica=1` (sin animación), `?escena=lock&lado=left`
(fuerza una forma) y `?escala=1.4` (la agranda).

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
