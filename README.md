# Reserva_Salones_Infra

Página de disponibilidad y reserva de las cuatro salas de reunión del piso 9 del
CAM La Alpujarra (Unidad Administrativa). Muestra las horas ya reservadas de cada
sala y abre el formulario de Microsoft Forms que dispara el flujo de reservas del
buzón sal9.

Es una página estática sin librerías por CDN: se abre directo con `index.html`,
también en la red institucional. Está publicada en
https://medellin015.github.io/Reserva_Salones_Infra/

## Estructura

| Archivo | Qué contiene |
| --- | --- |
| `index.html` | Contenido de la página: encabezado, calendario, pasos, reglas y contacto. |
| `styles.css` | Estilos, variables del tema claro y oscuro y diseño responsive. |
| `config.js` | **Lo único que hay que editar**: enlace del formulario, contacto, enlaces de los calendarios y enlace rellenado de Forms. |
| `app.js` | Pinta el calendario de disponibilidad, maneja el tema claro/oscuro y el botón Copiar correo. |
| `disponibilidad.js` | Horas ocupadas de cada sala. **Lo genera la tarea programada; no se edita a mano.** |
| `scripts/actualizar-disponibilidad.js` | Lee los calendarios publicados (ICS) y escribe `disponibilidad.js`. |
| `.github/workflows/disponibilidad.yml` | Tarea programada de GitHub que corre ese script. |

## Cómo se actualiza la disponibilidad

Los cuatro calendarios están publicados desde el buzón sal9 con el nivel "Puede ver
cuando estoy ocupado", así que solo exponen si la sala está ocupada o libre. Como
Outlook titula igual las cuatro páginas publicadas, la página no manda a Outlook:
pinta ella misma las horas ocupadas.

1. Cada 15 minutos, de lunes a viernes entre las 06:00 y las 18:45 de Bogotá, la
   tarea programada lee el enlace ICS de cada sala (el mismo enlace de `config.js`
   con `calendar.ics` al final).
2. Calcula las horas ocupadas de los próximos 10 días hábiles y, solo si algo
   cambió, hace commit de `disponibilidad.js` en `main`. GitHub Pages publica el
   cambio en un minuto.
3. La página muestra las franjas ocupadas por sala y por día, con la hora actual.
   Una reserva recién aprobada puede tardar hasta 30 minutos en aparecer. Eso no
   causa reservas dobles: el flujo revisa cruces al recibir la solicitud y otra vez
   al aprobarla.

Si un calendario no se puede leer, su columna dice "Sin datos" con el enlace a
Outlook. Si ningún calendario se pudo leer en el día, la página avisa que los datos
pueden estar desactualizados y la ejecución queda en rojo en la pestaña Actions.

GitHub desactiva las tareas programadas de un repositorio público tras 60 días sin
actividad. Si pasa, en Actions → "Actualizar disponibilidad" aparece un botón para
reactivarla. Desde esa misma pestaña se puede lanzar a mano con "Run workflow".

## Pedir desde el calendario

Al tocar una hora libre del calendario, el formulario se abre con la sala, la fecha
y la hora de inicio ya escogidas. Para activarlo, con la cuenta dueña del formulario:

1. En Forms, menú ⋯ (arriba a la derecha) → "Obtener dirección URL rellenada
   previamente" y activa las respuestas rellenadas.
2. Rellena Sala = "Sala 1", Fecha = 15/10/2026 y Hora de inicio = "07:00"; copia el
   enlace que genera Forms.
3. Pégalo en `FORM_PREFILL.enlace` de `config.js`. Si usaste otros valores de
   ejemplo, escríbelos tal cual en `FORM_PREFILL.ejemplo`.

Mientras ese enlace esté vacío, el calendario no ofrece pedir desde una hora y queda
el botón "Pedir una sala".

## Cómo publicar el calendario de una sala

Los cuatro calendarios ya están publicados y enlazados en `config.js`. Estos pasos
sirven para cambiar o volver a publicar alguno.

1. En Outlook web, entrando como sal9: ⚙ Configuración → Calendario → Calendarios
   compartidos → "Publicar un calendario".
2. Elija la sala y el nivel "Puede ver cuando estoy ocupado" → Publicar.
3. Copie el enlace **HTML** (termina en `calendar.html`) y péguelo en el campo
   `calendario` de esa sala en `config.js`. La tarea programada deriva de ahí el
   enlace ICS.

Si una sala no tiene enlace, su columna del calendario muestra "Sin datos".
