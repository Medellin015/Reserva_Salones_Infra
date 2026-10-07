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
| `scripts/publicar-disponibilidad.sh` | Corre el script anterior y hace commit de `disponibilidad.js` si cambió. |
| `.github/workflows/disponibilidad.yml` | Tarea programada de GitHub que corre ese script. |

## Cómo se actualiza la disponibilidad

Los cuatro calendarios están publicados desde el buzón sal9 con el nivel "Puede ver
cuando estoy ocupado", así que solo exponen si la sala está ocupada o libre. Como
Outlook titula igual las cuatro páginas publicadas, la página no manda a Outlook:
pinta ella misma las horas ocupadas.

1. La tarea lee el enlace ICS de cada sala (el mismo enlace de `config.js` con
   `calendar.ics` al final). Se dispara de tres formas:
   - **Desde el flujo de reservas.** Al aprobar una reserva, el flujo de Power
     Automate usa la acción de GitHub "Create a repository dispatch event" (conector
     estándar, sin licencia premium) con el tipo `actualizar-disponibilidad`. La
     tarea espera medio minuto a que Outlook publique la reserva, lee, y vuelve a
     leer dos minutos después por si aún no estaba. La reserva aparece en uno a tres
     minutos.
   - **Cada 5 minutos** de lunes a viernes entre las 06:00 y las 19:00 de Bogotá,
     como respaldo para cambios hechos a mano en Outlook. GitHub no garantiza la
     hora exacta de las tareas programadas y a veces las retrasa.
   - **A mano**, en la pestaña Actions → "Actualizar disponibilidad" → "Run workflow".
2. Calcula las horas ocupadas de los próximos 10 días hábiles (sin fines de semana
   ni festivos de Colombia) y, solo si algo cambió, hace commit de
   `disponibilidad.js` en `main`. GitHub Pages publica el cambio en un minuto.
3. La página muestra las franjas ocupadas por sala y por día, con la hora actual.
   Una reserva recién aprobada puede tardar hasta 30 minutos en aparecer. Eso no
   causa reservas dobles: el flujo revisa cruces al recibir la solicitud y otra vez
   al aprobarla.

Si un calendario falla de forma pasajera, se intenta hasta tres veces y, si aun así
no responde, se conservan los datos de la lectura anterior del día y la página lo avisa.
Si una sala no tiene datos, su columna dice "Sin datos" con el enlace a Outlook. Si en
todo el día no se pudo leer ningún calendario, la página avisa que los datos pueden
estar desactualizados y la ejecución de las 09:00 queda en rojo en la pestaña Actions
(una sola vez al día, para que GitHub avise por correo sin inundar).

GitHub desactiva las tareas programadas de un repositorio público tras 60 días sin
actividad. Si pasa, en Actions → "Actualizar disponibilidad" aparece un botón para
reactivarla. Desde esa misma pestaña se puede lanzar a mano con "Run workflow".

## Qué muestra el detalle de una reserva

Al tocar una franja ocupada se abre un cuadro con la sala, el día y la hora, y con lo
que el calendario de esa sala tenga publicado:

| Nivel de publicación en Outlook | Qué se ve en el detalle |
| --- | --- |
| Puede ver cuando estoy ocupado (el actual) | Solo la hora. El cuadro dice que los detalles no están publicados. |
| Puede ver títulos y ubicaciones | El asunto de la reserva. El flujo lo arma como "Motivo · Nombre del solicitante", y la página lo separa en motivo y solicitante. |
| Puede ver todos los detalles | Además, la descripción: correo del solicitante y número de asistentes. |

El nivel se cambia en Outlook web, como sal9: ⚙ Configuración → Calendario →
Calendarios compartidos → "Publicar un calendario" → elegir la sala y el nivel →
Publicar. Los enlaces no cambian. El cambio se ve en la página en la siguiente lectura.

La página es pública: lo que se publique lo verá cualquiera que tenga el enlace. Con
"títulos y ubicaciones" quedan a la vista los nombres de quienes reservan y los motivos
de las reuniones. "Todos los detalles" expone además los correos; no se recomienda.

## Pedir desde el calendario

Al tocar una hora libre del calendario, el formulario se abre con la sala, la fecha
y la hora de inicio ya escogidas. Para activarlo, con la cuenta dueña del formulario:

1. En Forms, menú ⋯ (arriba a la derecha) → "Obtener dirección URL rellenada
   previamente" y active las respuestas rellenadas.
2. Rellene Sala = "Sala 1", Fecha = 15/10/2026 y Hora de inicio = "07:00"; copie el
   enlace que genera Forms.
3. Péguelo en `FORM_PREFILL.enlace` de `config.js`. Si usó otros valores de
   ejemplo, escríbalos tal cual en `FORM_PREFILL.ejemplo`.

La página busca esos valores en el enlace para saber qué parámetro es cada pregunta.
Si alguno no aparece, no genera enlaces y lo avisa en la consola del navegador, para
no pedir una sala, fecha u hora equivocadas. Mientras el enlace esté vacío, el
calendario no ofrece pedir desde una hora y queda el botón "Pedir una sala".

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
