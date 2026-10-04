# Reserva_Salones_Infra

Página de disponibilidad y reserva de las cuatro salas de reunión del piso 9 del
CAM La Alpujarra (Unidad Administrativa). Desde ella se consulta el calendario
publicado de cada sala y se abre el formulario de Microsoft Forms que dispara el
flujo de reservas del buzón sal9.

Es una página estática sin librerías por CDN: se abre directo con `index.html`,
también en la red institucional.

## Estructura

| Archivo | Qué contiene |
| --- | --- |
| `index.html` | Contenido de la página: encabezado, salas, pasos, reglas y contacto. |
| `styles.css` | Estilos, variables del tema claro y oscuro y diseño responsive. |
| `config.js` | **Lo único que hay que editar**: enlace del formulario, contacto y enlaces de los calendarios. |
| `app.js` | Pinta las tarjetas de las salas, maneja el tema claro/oscuro y el botón Copiar correo. |

## Cómo publicar el calendario de una sala

Los cuatro calendarios ya están publicados y enlazados en `config.js`. Estos pasos
sirven para cambiar o volver a publicar alguno.

1. En Outlook web, entrando como sal9: ⚙ Configuración → Calendario → Calendarios
   compartidos → "Publicar un calendario".
2. Elija la sala y el nivel "Puede ver cuando estoy ocupado" → Publicar.
3. Copie el enlace **HTML** (termina en `calendar.html`; el ICS no sirve aquí) y
   péguelo en el campo `calendario` de esa sala en `config.js`.

Mientras el campo esté vacío, la tarjeta avisa que falta publicar el calendario.
