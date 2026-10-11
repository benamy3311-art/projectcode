# ProjectCode

Página de venta de **ProjectCode**, suite empresarial para tiendas de tecnología.

El sitio presenta el valor para vendedores y dueños: preparar cotizaciones con
menos trabajo, retomar clientes y consultar el estado de las oportunidades.
El recorrido se concentra en seis secciones: portada, seguimiento comercial,
funciones, puesta en marcha, datos y demo. Las demostraciones de cotización, IA,
catálogo, sedes y caja están agrupadas en pestañas. Los textos de privacidad y
condiciones se conservan en desplegables.

## Qué hay acá

Solo el sitio de presentación: HTML, CSS y JavaScript estáticos, sin dependencias
y sin build.

```
index.html                la página completa
assets/site.css           estilos
assets/site.js            barra, pestañas, aparición y las maquetas animadas
assets/hilos.js           los hilos de luz de fondo (imagen de marca)
assets/img/               cotizaciones de ejemplo generadas por la aplicación
assets/brand/             símbolo original, variantes y logotipo de ProjectCode
assets/fonts/             tipografía Inter, con su licencia (SIL OFL 1.1)
favicon.svg               ícono de la pestaña
apple-touch-icon.png      ícono al agregar la página a la pantalla de inicio
og.jpg                    imagen que se ve al compartir el enlace por WhatsApp
```

## Diseño

- Fondo carbón (`#18181b`) y símbolo original: una P de contorno suave con un
  corte diagonal que alude al código. El degradado va de azul y violeta a coral
  y amarillo. Versión vectorial y monocroma en `assets/brand/`.
- Wordmark en minúsculas y titulares Inter de peso 660; los énfasis usan tonos
  suaves del degradado. Los botones principales son amarillo pálido con texto
  oscuro. Los colores de estado conservan su función informativa.
- Hilos de luz animados con la paleta de la marca; paneles translúcidos y radios
  suaves. No se agregan secciones al recorrido comercial.
- El producto se muestra con **maquetas animadas** hechas en HTML, que imitan la
  aplicación (Total cotización, Catálogo, Copiar imagen, PDF). Las cotizaciones de
  `assets/img/` (la imagen para WhatsApp y la hoja A4) las genera la aplicación
  real, cargada con una tienda y productos ficticios ("Su Tienda S.A.S.", NIT
  900.000.000-0). Ninguna cifra ni producto sale de la lista de precios de un
  cliente.
- La pestaña «Catálogo» conserva la importación animada, con tiempos de ejemplo.
  La sección de seguimiento destaca estados y notas ficticios: no simula envíos
  automáticos ni acredita contactos que la aplicación no registra.
- **No hace ninguna petición a terceros**: sin analítica, sin cookies y sin
  tipografías externas.
- Respeta `prefers-reduced-motion`: los hilos quedan quietos, las maquetas se
  muestran ya terminadas y todo el texto aparece de una vez. El pie tiene además
  un botón para pausar todas las animaciones.
- El texto secundario es gris claro sobre carbón. Los botones amarillos usan
  texto oscuro; los controles internos de las maquetas conservan el violeta.

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


## Dirección comercial y visual — octubre de 2026

Portada carbón sobrio, marca multicolor y demostración de seguimiento legible desde el inicio. Las notas se seleccionan manualmente y los formatos de documento cambian a petición del visitante. Se conservan las demostraciones de catálogo y recogidas, con pausa y movimiento reducido.

Planes mensuales por empresa: Esencial COP 99.000; Equipo + IA COP 299.000; Adaptado + IA COP 499.000. La implementación personalizada se cotiza por separado. La propuesta comercial debe definir usuarios, sedes, cuota de IA e impuestos antes de contratar. No se prometen porcentajes de productividad sin medición.


## Auditoría de movimiento y uso — 11 de octubre de 2026

Se recuperó la demostración animada de cotización y la rotación del seguimiento. `assets/site.js` coordina los ejemplos con un reloj compartido que se detiene fuera de pantalla, con la pestaña oculta, durante la pausa y con movimiento reducido. La selección manual conserva su estado; cada demostración principal permite reanudar. `assets/motion.css` contiene los ajustes visuales y de navegación de esta auditoría.

Validación y pendientes comerciales: [AUDIT-2026-10-11.md](AUDIT-2026-10-11.md).
