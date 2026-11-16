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
y sin build. No hace peticiones a terceros (tipografía incluida en el repo).

```
index.html                la página completa
assets/css/estilos.css    tokens (colores, radios, sombras, movimiento) y piezas base
assets/css/tacto.css      capa de respuesta al tocar (muelles, pulsado, cifras, segmentado)
assets/css/secciones.css  composición de cada sección
assets/css/prueba.css     la app para probar y la hoja imprimible
assets/js/tacto.js        sonido, háptica, muelles y cifras que ruedan
assets/js/app.js          titular, apariciones, pedido animado, calculadora, funciones, demo
assets/js/prueba.js       la app para probar: catálogo, cotización, asesor IA, seguimiento,
                          caja, y cotización / orden de compra / recibo para imprimir o WhatsApp
assets/fonts/             Geist y Geist Mono, con su licencia (SIL OFL 1.1)
assets/brand/             símbolo y logotipo de ProjectCode
```

## Diseño

Registro sereno con golpe, tomado de la carpeta «gusto» (la misma línea de DentiCode):
lienzo gris claro, tinta casi negra, botones en tinta, pasteles solo cuando significan
algo (cielo lo que prepara la app, menta vendido, durazno para retomar, lavanda negociando).
El espectro de la marca vive en el logo y en dos piezas de arte con grano: la portada,
con la P de vidrio, y la cápsula de la caja. Tipografía Geist; etiquetas en Geist Mono.

La sección «Pruébala» es la app en pequeño, con catálogo y clientes de ejemplo. Todo pasa
en el navegador. Lo que se hace en una vista se nota en las otras: la propuesta del asesor
IA pasa a la cotización, la cotización guardada aparece en Seguimiento y, al venderse, en
la Caja. Desde la cotización se genera también la orden de compra (abono, saldo, entrega)
y el recibo (forma de pago, garantía por producto), en hoja imprimible o texto para WhatsApp.

Respeta `prefers-reduced-motion`.

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
