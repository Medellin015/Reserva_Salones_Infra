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
| `logo-alcaldia-medellin.png` | Logo de la Alcaldía del encabezado. Si no carga, el encabezado queda solo con el nombre de la página. |
| `config.js` | **Lo único que hay que editar**: enlace del formulario, horario de reservas, contacto, salas (aforo, si está activa y enlace de su calendario), salas que se piden juntas y los enlaces rellenados de Forms (pedir y cancelar). |
| `app.js` | Pinta el calendario (la semana o el mes completo, con el botón de meses) y la pestaña de indicadores, maneja el tema claro/oscuro y el botón Copiar correo. |
| `disponibilidad.js` | Horas ocupadas de cada sala. **Lo genera la tarea programada; no se edita a mano.** |
| `uso.js` | Historial de lo reservado cada día en cada sala, para la pestaña de indicadores. **Lo genera la tarea programada; no se edita a mano.** |
| `scripts/actualizar-disponibilidad.js` | Lee los calendarios publicados (ICS) y escribe `disponibilidad.js`. |
| `scripts/publicar-disponibilidad.sh` | Corre el script anterior y hace commit de `disponibilidad.js` y `uso.js` si cambiaron. |
| `.github/workflows/disponibilidad.yml` | Tarea programada de GitHub que corre ese script. |
| `docs/correo-anuncio.html` | Correo que anuncia la página, con formato. No hace parte de la página: se abre en el navegador, se copia todo y se pega en un mensaje nuevo de Outlook. |

## Cómo se actualiza la disponibilidad

Los calendarios de las salas están publicados desde el buzón sal9 con el nivel "Puede
ver títulos y ubicaciones" (ver "Qué muestra el detalle de una reserva"). Como Outlook
titula igual todas las páginas publicadas, la página no manda a Outlook: pinta ella
misma las horas ocupadas.

1. La tarea lee el enlace ICS de cada sala (el mismo enlace de `config.js` con
   `calendar.ics` al final). Se dispara de cuatro formas:
   - **Desde el flujo de reservas.** Al aprobar una reserva, el flujo de Power
     Automate usa la acción de GitHub "Create a repository dispatch event" (conector
     estándar, sin licencia premium) con el tipo `actualizar-disponibilidad`. La
     tarea espera medio minuto a que Outlook publique la reserva, lee, y vuelve a
     leer dos minutos después por si aún no estaba. La reserva aparece en uno a tres
     minutos.
   - **Cada 10 minutos desde Power Automate.** El flujo "Revisar disponibilidad
     salas" (periodicidad de lunes a viernes, 06:00 a 18:50) envía el mismo aviso con
     el tipo `revisar-disponibilidad`, para recoger reservas borradas o movidas a mano
     en Outlook.
   - **Cada 5 minutos desde GitHub**, como respaldo. GitHub no garantiza la hora
     exacta de sus tareas programadas y a veces no las dispara; por eso el aviso
     principal sale de Power Automate.
   - **A mano**, en la pestaña Actions → "Actualizar disponibilidad" → "Run workflow".
2. Calcula las horas ocupadas de lunes a viernes desde el lunes de la semana actual
   (también los días que ya pasaron) hasta el fin del segundo mes siguiente, y anota
   cuáles de esos días son festivos en Colombia. Un sábado o un domingo empieza en la
   semana que viene. Solo si algo cambió, hace commit de `disponibilidad.js` en `main`.
   GitHub Pages publica el cambio en un minuto. En la misma lectura actualiza el historial
   de uso (`uso.js`; ver "Indicadores de uso").
3. La página abre en la semana actual, de lunes a viernes. Cada día tiene una columna
   angosta por sala (S1, S2, …) con sus horas ocupadas, y arriba está la lista de salas
   con el código de cada columna y su aforo. Los días que ya pasaron y lo que va corrido
   de hoy se ven desvaídos, la línea roja marca la hora actual y los festivos van
   rayados. El calendario va de 07:00 a 18:00; la media hora del principio y la del final
   van rayadas porque están fuera del horario de reservas (ver "Horario de reservas").
   En el celular el calendario se desliza de lado y abre en el día de hoy.
   El botón del mes ("Octubre 2026") abre la lista de los meses con datos: el mes en
   curso y los dos siguientes (ver "Meses que se pueden ver"). Al elegir uno se ve el mes
   completo, una fila por semana, con una barra por sala en cada día que va de 07:00 a
   18:00; lo de color está reservado y, al pasar el ratón, el día dice las horas ocupadas
   de cada sala. Al tocar un día se abre su semana. Al lado del botón están "Todo el mes"
   y las semanas de ese mes que quedan por delante; en el mes en curso, si esta semana es
   la última del mes, también está la próxima.
   Vuelve a leer los datos cada 5 minutos y al volver a la pestaña, así que una
   pantalla que queda abierta todo el día se mantiene al día sin recargarla. Debajo del
   calendario siempre hay un botón "Recargar" (si los datos no son de hoy, va dentro del
   aviso). Antes de recargar pide de nuevo los archivos de la página sin usar la copia
   guardada del navegador ni la de un proxy de la red, que es lo que hace que una página
   vieja siga apareciendo.
   Una reserva recién aprobada puede tardar hasta 30 minutos en aparecer. Eso no
   causa reservas dobles: el flujo revisa cruces al recibir la solicitud y otra vez
   al aprobarla.

Si un calendario falla de forma pasajera, se intenta hasta tres veces y, si aun así
no responde, se conservan los datos de la lectura anterior del día y la página lo avisa.
Si una sala no tiene datos, su columna va rayada en todos los días, la lista de salas
dice "sin datos" y un aviso pide revisar su calendario en Outlook. Si en
todo el día no se pudo leer ningún calendario, la página avisa que los datos pueden
estar desactualizados y la ejecución de las 09:00 queda en rojo en la pestaña Actions
(una sola vez al día, para que GitHub avise por correo sin inundar).

GitHub desactiva las tareas programadas de un repositorio público tras 60 días sin
actividad. Si pasa, en Actions → "Actualizar disponibilidad" aparece un botón para
reactivarla. Desde esa misma pestaña se puede lanzar a mano con "Run workflow".

## Meses que se pueden ver

La página muestra el mes en curso y los dos siguientes (`MESES` en
`scripts/actualizar-disponibilidad.js`). El límite lo pone Outlook: un calendario
publicado solo trae las citas de cierto rango de fechas hacia adelante. El 14/10/2026 el
de las salas traía citas hasta el 29 de diciembre, así que alcanza para tres meses. Si la
página mostrara más meses de los que Outlook publica, esos días se verían libres aunque
tuvieran reservas.

Para ver más meses:

1. Un administrador de Exchange Online amplía el rango publicado del calendario de cada
   sala, por ejemplo a un año:

   ```powershell
   Set-MailboxCalendarFolder -Identity "sal9@medellin.gov.co:\Calendario\Sala 1" -PublishDateRangeTo OneYear
   ```

   Se corre una vez por sala. Los valores posibles son `OneDay`, `ThreeDays`, `OneWeek`,
   `OneMonth`, `ThreeMonths`, `SixMonths` y `OneYear`. `Get-MailboxCalendarFolder` con la
   misma identidad muestra el rango actual; si la carpeta de la sala tiene otra ruta,
   `Get-MailboxFolderStatistics sal9@medellin.gov.co -FolderScope Calendar` la muestra.
2. Después se sube `MESES` en el script. La página no necesita cambios: la lista de meses
   sale de los datos.

## Indicadores de uso

La pestaña "Indicadores" (al lado de "Calendario"; también se abre con
https://medellin015.github.io/Reserva_Salones_Infra/#indicadores) resume cuánto se usa
cada sala en el mes elegido:

- Cifras del mes: horas reservadas sobre las disponibles, ocupación, número de reservas (y
  qué parte se pidió por la página) y la sala más usada.
- Una barra por sala con las horas usadas (días que ya pasaron), las programadas (de hoy en
  adelante) y lo que queda disponible.
- Horas por día de la semana y qué parte de las salas está ocupada en cada media hora.
- Una tabla con todas las cifras por sala.

Las horas se cuentan dentro del horario de reservas (07:30 a 17:30, 10 horas por sala y por
día), también en los meses de antes de ese horario, y la ocupación es sobre los días hábiles
del mes (lunes a viernes sin festivos) por el número de salas. En el mes en curso y los
siguientes se incluye lo programado hasta ahora.

Los datos salen de dos partes. Lo de hoy en adelante viene de `disponibilidad.js`. Lo de los
días que ya pasaron viene de `uso.js`, que la misma tarea programada lleva al día: en cada
lectura vuelve a escribir los días de la semana en curso hasta hoy (así recoge reservas
borradas o movidas), conserva los anteriores tal como quedaron y agrega los días anteriores
que Outlook todavía publica y no estaban. Por eso el historial sobrevive aunque Outlook deje
de publicar las citas viejas. Empieza el 14/10/2026, cuando se cargó la planilla; se armó con
las lecturas que la tarea había guardado en el repositorio desde entonces. La página carga
`uso.js` solo al abrir la pestaña.

Los calendarios publican el asunto y el lugar de cada reserva, pero no la dependencia ni el
número de personas, así que los indicadores son por sala y no por dependencia.

## Horario de reservas

Las salas se reservan de 07:30 a 17:30, en bloques de media hora (desde el 29/10/2026; antes
era de 07:00 a 18:00). El horario se controla en tres partes, que tienen que coincidir:

1. **El formulario de reservas**, que es el control principal: la lista de "Hora de inicio" va
   de 07:30 a 17:00 y la de "Hora de fin", de 08:00 a 17:30. Esas preguntas no se borran ni se
   vuelven a crear (el flujo y la página usan sus identificadores): solo se cambian sus opciones.
2. **El flujo de reservas**, que revisa el horario apenas llega la solicitud: si empieza antes de
   las 07:30, termina después de las 17:30 o la hora de fin no es posterior a la de inicio,
   responde por correo y no registra nada. Así el horario se cumple aunque alguien cambie las
   listas del formulario o arme una respuesta a mano.
3. **La página**: `HORARIO` en `config.js`. No ofrece horas fuera del horario, raya en el
   calendario lo que queda por fuera, la regla de la página dice el horario y los indicadores
   cuentan las horas dentro de él.

El formulario de cancelación conserva la lista de 07:00 a 17:30, para poder cancelar las
reservas que se hicieron con el horario anterior. Las de la planilla que terminan a las 18:00
(los martes de la Sala 1 y la Sala 2) se ven completas en el calendario, sobre lo rayado.

Para cambiar el horario hay que cambiar las tres partes: las listas del formulario, la revisión
del flujo y `HORARIO`.

## Salas y aforos

| Sala | Aforo | Estado |
| --- | --- | --- |
| Sala 1 | 20 personas | Activa |
| Sala 2 | 20 personas | Activa |
| Sala 3 | 12 personas | Activa |
| Sala 4 | 15 personas | Deshabilitada desde el 08/10/2026 |
| Sala 5 | 15 personas | Activa desde el 08/10/2026 |

Las únicas salas que se pueden unir en una sola son la 1 y la 2, para grupos de 21 a 40
personas. Todo esto está en `SALAS` y `SALAS_JUNTAS` de `config.js`. La página saca de ahí la lista de salas con su
aforo, las columnas de cada día y las reglas; las salas con `activa: false` no aparecen.

El formulario pregunta primero cuántas personas asisten, por rangos, y al final muestra
solo las salas donde cabe el grupo:

| Personas | Salas que ofrece el formulario |
| --- | --- |
| 1 a 12 | Sala 1, Sala 2, Sala 3, Sala 5 |
| 13 a 15 | Sala 1, Sala 2, Sala 5 |
| 16 a 20 | Sala 1, Sala 2 |
| 21 a 40 | Salas 1 y 2 |

Cada rango tiene su propia pregunta de sala, porque Forms solo puede saltar a otra
pregunta según una respuesta de opción. Cuando alguien pide "Salas 1 y 2", el flujo
revisa cruces en los dos calendarios y crea la reserva en ambos, con "Salas 1 y 2" como
lugar.

**Para volver a activar la Sala 4:** en `config.js`, quite `activa: false` de la Sala 4.
En el formulario, agregue "Sala 4" a las salas de 1 a 12 y de 13 a 15 personas. El flujo
no necesita cambios.

Una sala nueva se agrega en `SALAS` con su enlace publicado (ver "Cómo publicar el
calendario de una sala"). Mientras no tenga enlace, su columna va rayada, la lista de salas
dice "calendario pendiente" y la tarea no la lee.

## Qué muestra el detalle de una reserva

Al tocar una franja ocupada se abre un cuadro con la sala, el día y la hora, y con lo
que el calendario de esa sala tenga publicado:

| Nivel de publicación en Outlook | Qué se ve en el detalle |
| --- | --- |
| Puede ver cuando estoy ocupado | Solo la hora. El cuadro dice que los detalles no están publicados. |
| Puede ver títulos y ubicaciones (el actual, desde el 07/10/2026) | El asunto y el lugar de la reserva. El flujo arma el asunto como "Motivo · Responsable", y la página lo separa en motivo y responsable. El lugar solo se muestra si la reserva es de dos salas juntas ("Salas 1 y 2"). |
| Puede ver todos los detalles | Además, la descripción: teléfono, dependencia (y unidad o equipo, si es de la Secretaría de Infraestructura Física), correo de quien pidió y número de personas. |

El nivel se cambia en Outlook web, como sal9: ⚙ Configuración → Calendario →
Calendarios compartidos → "Publicar un calendario" → elegir la sala y el nivel →
Publicar. Los enlaces no cambian. El cambio se ve en la página en la siguiente lectura.

La página es pública: lo que se publique lo verá cualquiera que tenga el enlace. Con
"títulos y ubicaciones" quedan a la vista los nombres de quienes reservan y los motivos
de las reuniones. "Todos los detalles" expone además teléfonos y correos; no se recomienda.

## Pedir desde el calendario

Al tocar una hora libre del calendario, el formulario se abre con la fecha y la hora de
inicio ya escogidas. La sala no se rellena: el formulario la pregunta al final, según
cuántas personas asisten. Por eso cada media hora se pide para el día entero: se ofrece
si al menos una sala está libre a esa hora (al pasar el ratón se ve "Pedir 10:30") y el
lector de pantalla dice cuáles salas lo están. Las horas que ya pasaron y las que quedan
fuera del horario de reservas no se ofrecen.
Para activarlo, con la cuenta dueña del formulario:

1. En Forms, menú ⋯ (arriba a la derecha) → "Obtener dirección URL rellenada
   previamente" y active las respuestas rellenadas.
2. Rellene solo Fecha = 15/10/2026 y Hora de inicio = "07:30"; copie el enlace que
   genera Forms.
3. Péguelo en `FORM_PREFILL.enlace` de `config.js`. Escriba los valores de ejemplo que
   usó, tal cual, en `FORM_PREFILL.ejemplo`. El enlace actual se generó con 07:00, cuando
   esa hora todavía estaba en el formulario, y sigue sirviendo: la página solo lo usa de
   molde y nunca pide las 07:00.

Está activo desde el 07/10/2026, y desde el 08/10/2026 ya no rellena la sala. Forms
escribe cada respuesta entre comillas en el enlace (`%222026-10-15%22`); la página las
tiene en cuenta al comparar y al generar. Si el formulario vuelve a tener una sola
pregunta de sala, agregue `sala: 'Sala 1'` al ejemplo y la página la rellenará también;
entonces cada sala ofrece sus propias horas libres en su columna.

La página busca esos valores en el enlace para saber qué parámetro es cada pregunta.
Si alguno no aparece, no genera enlaces y lo avisa en la consola del navegador, para
no pedir una fecha u hora equivocadas. Mientras el enlace esté vacío, el
calendario no ofrece pedir desde una hora y queda el botón "Pedir una sala".

## Cancelar una reserva

Al tocar una reserva del calendario, el cuadro de detalle tiene el botón "Cancelar esta
reserva", que abre el formulario "Cancelar reserva de sala · Piso 9 CAM" con la sala, la fecha
y la hora de inicio ya puestas. Aparece en las reservas que no han terminado; en una que ya
empezó, la nota avisa que solo la Unidad Administrativa puede cancelarla. Si la reserva
empieza a una hora intermedia (08:15), va con la media hora anterior (08:00), que es donde la
busca el flujo; una reserva de dos salas juntas va como "Salas 1 y 2".

El formulario lo recibe el flujo "Cancelar reserva sala Piso 9 CAM" (Power Automate, con la
cuenta dueña del formulario de reservas y la conexión de sal9):

1. Busca en el calendario de la sala la reserva que empieza en esa media hora.
2. Revisa quién cancela: la descripción de cada reserva dice "Solicitó: Nombre (correo)", y
   ese correo debe ser el de quien responde el formulario (Forms registra el nombre). Es la
   cuenta que envió la solicitud, que no siempre es la del responsable: si alguien pidió la
   sala para otra persona, solo quien la pidió puede cancelarla.
   La Unidad Administrativa (Enercis Cuesta y Victor Lezcano) puede cancelar siempre: cualquier
   reserva, de cualquier persona o de la planilla, y también una que ya empezó (libera lo que
   falta). El flujo la reconoce por la lista `Administradores`, que tiene cada dirección con la
   que puede llegar su cuenta (la de Forms y la de su perfil), así que no depende de una sola.
3. Borra la reserva (en los dos calendarios si es de "Salas 1 y 2"), envía el correo "Reserva
   cancelada" con copia a enercis.cuesta@medellin.gov.co y avisa a la tarea de GitHub con
   `actualizar-disponibilidad`, igual que el flujo de reservas: la sala aparece libre en uno a
   tres minutos.
4. Si no encuentra la reserva, si ya terminó, si ya empezó y quien cancela no es de la Unidad
   Administrativa, o si no está a nombre de quien cancela, no borra nada y responde por correo
   diciendo por qué. Las que ya terminaron no las cancela nadie: no hay nada que liberar y se
   conservan para los indicadores.

Las reservas cargadas desde la planilla no tienen el correo de quien las pidió: solo las
pueden cancelar Enercis o Victor, o se borran a mano en Outlook entrando como sal9.

Cuando Enercis o Victor cancelan una reserva de otra persona, el correo "Reserva cancelada" les
llega a ellos, no a quien la pidió: hay que avisarle.

Para activar el botón, en `CANCELAR_PREFILL` de `config.js` va el enlace rellenado
previamente del formulario de cancelación, generado igual que el de pedir (ver "Pedir desde
el calendario") con Sala = Sala 1, Fecha = 15/10/2026 y Hora de inicio = 07:00. Está activo
desde el 27/10/2026. Mientras el enlace esté vacío, el detalle no ofrece cancelar.

## Cómo publicar el calendario de una sala

Los calendarios de las cinco salas ya están publicados y enlazados en `config.js`. Estos
pasos sirven para publicar el de una sala nueva o para volver a publicar alguno.

1. En Outlook web, entrando como sal9: ⚙ Configuración → Calendario → Calendarios
   compartidos → "Publicar un calendario".
2. Elija la sala y el nivel "Puede ver títulos y ubicaciones" → Publicar. Con ese
   nivel la página muestra el detalle de cada reserva.
3. Copie el enlace **HTML** (termina en `calendar.html`) y péguelo en el campo
   `calendario` de esa sala en `config.js`. La tarea programada deriva de ahí el
   enlace ICS.

Si una sala activa no tiene enlace, su columna del calendario va rayada y la lista de salas
dice "calendario pendiente".
