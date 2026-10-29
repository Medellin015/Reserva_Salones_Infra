'use strict';
/* ============================================================================
   Salas Piso 9 CAM — configuración (lo único que hay que editar)
   Estructura del archivo:
     1. Formulario de reservas y horario
     2. Contacto
     3. Salas: aforo, estado y enlaces de sus calendarios publicados
     4. Pedir desde el calendario (enlace de Forms con respuestas rellenadas)
     5. Cancelar desde el calendario (enlace del formulario de cancelación)
   Las constantes quedan en el ámbito global de la página; app.js las lee tal cual.
   ============================================================================ */

/* ===== 1. Formulario y horario ===== */

// Formulario de Microsoft Forms que dispara el flujo de reservas.
const FORM_URL = 'https://forms.cloud.microsoft/r/xmAtdmU7sg';

// Horario en que se pueden reservar las salas, en bloques de media hora (HH:MM, en :00 o :30).
// Tiene que coincidir con las listas del formulario (Hora de inicio de 07:30 a 17:00 y Hora de
// fin de 08:00 a 17:30) y con la revisión de horario del flujo de reservas (ver README,
// "Horario de reservas"). El calendario muestra las horas completas que lo contienen (07:00 a
// 18:00): lo que queda por fuera se ve rayado y no se ofrece para pedir.
const HORARIO = { inicio: '07:30', fin: '17:30' };

/* ===== 2. Contacto ===== */

// Correo al que se escribe para dudas o para liberar una sala; la página lo muestra con el
// botón Copiar correo.
const CONTACTO = { correo: 'enercis.cuesta@medellin.gov.co' };

/* ===== 3. Salas ===== */

// Cada sala lleva su nombre (igual al del calendario en sal9 y a la opción del formulario),
// su aforo en personas, el color de su columna y el enlace publicado de su calendario.
// activa: false la saca del calendario de la página sin borrar sus datos; la Sala 4 está
// deshabilitada por ahora. Para volver a ofrecer una sala también hay que agregarla en el
// formulario (ver README, "Salas y aforos").
// Enlace publicado: Outlook web, entrando como sal9 → ⚙ Configuración → Calendario →
// Calendarios compartidos → "Publicar un calendario" → elegir la sala y el nivel "Puede ver
// títulos y ubicaciones" → Publicar → copiar el enlace HTML (termina en calendar.html).
// El enlace ICS no sirve aquí.
// La tarea programada de GitHub lee estos mismos enlaces (con calendar.ics al final)
// y escribe disponibilidad.js, que es lo que pinta el calendario de la página.
// Si una sala activa todavía no tiene enlace, su columna va rayada y la lista de salas de la
// página dice "calendario pendiente".
const SALAS = [
  { nombre: 'Sala 1', aforo: 20, color: 'var(--s1)',
    calendario: 'https://outlook.office365.com/owa/calendar/e7f5063f1ad54d0ebc2b7e5a8b3f2a58@medellin.gov.co/55937f16e55f435a93fb07014c46b8a912560906985531697418/calendar.html' },
  { nombre: 'Sala 2', aforo: 20, color: 'var(--s2)',
    calendario: 'https://outlook.office365.com/owa/calendar/e7f5063f1ad54d0ebc2b7e5a8b3f2a58@medellin.gov.co/878029d3bd3645838b56ba74b3681f747497618923992496313/calendar.html' },
  { nombre: 'Sala 3', aforo: 12, color: 'var(--s3)',
    calendario: 'https://outlook.office365.com/owa/calendar/e7f5063f1ad54d0ebc2b7e5a8b3f2a58@medellin.gov.co/0296599255094d68944d45b9640c9f8b1032414812168915243/calendar.html' },
  { nombre: 'Sala 4', aforo: 15, color: 'var(--s4)', activa: false,
    calendario: 'https://outlook.office365.com/owa/calendar/e7f5063f1ad54d0ebc2b7e5a8b3f2a58@medellin.gov.co/8e4d1d7594bd463baaaebd8efaf0f7d514839775579376083701/calendar.html' },
  { nombre: 'Sala 5', aforo: 15, color: 'var(--s5)',
    calendario: 'https://outlook.office365.com/owa/calendar/e7f5063f1ad54d0ebc2b7e5a8b3f2a58@medellin.gov.co/19a63b4cf73d461ca1a099f8ae676dfe9251628108054404143/calendar.html' },
];

// Salas que se pueden unir en una sola cuando el grupo no cabe en una: solo la 1 y la 2,
// para 40 personas. El formulario las ofrece como "Salas 1 y 2" y el flujo reserva las dos.
// La página las anuncia en las reglas solo si todas sus salas están activas.
const SALAS_JUNTAS = [['Sala 1', 'Sala 2']];

/* ===== 4. Pedir desde el calendario ===== */

// Al tocar una hora libre del calendario, el formulario se abre con la fecha y la hora de
// inicio ya escogidas. La sala no se rellena: el formulario la pregunta al final, entre las
// que tienen cupo para el número de personas. Para activarlo, con la cuenta dueña del
// formulario:
//   1. En Forms, menú ⋯ (arriba a la derecha) → "Obtener dirección URL rellenada
//      previamente" y active las respuestas rellenadas.
//   2. Rellene solo Fecha = 15/10/2026 y Hora de inicio = "07:30"; copie el enlace que
//      genera Forms y péguelo en `enlace`.
//   3. Escriba en `ejemplo` los valores que usó, tal cual. El enlace actual se generó con
//      07:00, cuando esa hora todavía estaba en el formulario; sigue sirviendo igual.
// La página busca en ese enlace los valores de ejemplo para saber qué parámetro es cada
// pregunta. Si alguno no aparece, no genera enlaces (avisa en la consola del navegador)
// para no pedir una fecha u hora equivocadas. Mientras `enlace` esté vacío, el calendario
// no ofrece pedir desde una hora y queda solo el botón "Pedir una sala".
// Si algún día el formulario vuelve a tener una sola pregunta de sala, agregue
// `sala: 'Sala 1'` al ejemplo (y esa respuesta al enlace) y la página la rellenará también.
const FORM_PREFILL = {
  enlace: 'https://forms.cloud.microsoft/Pages/ResponsePage.aspx?id=iOBInEReDUuToO6yxhJ8PTm750YXtsNCt97tmedyDMZUMUY1NVRRNVVPMUVBTzFOSU9FM0NSRUM3Uy4u&rc76460fd33de46e3ae24d0a4a4b4b45c=%222026-10-15%22&rad426ff4b2ee4107a398a77ca3c6eecb=%2207%3A00%22',
  ejemplo: { fecha: '2026-10-15', horaInicio: '07:00' },
};

/* ===== 5. Cancelar desde el calendario ===== */

// Al tocar una reserva, el cuadro de detalle ofrece "Cancelar esta reserva": abre el formulario
// de cancelación con la sala, la fecha y la hora de inicio ya puestas. Lo recibe el flujo
// "Cancelar reserva sala Piso 9 CAM", que solo cancela si quien responde es quien pidió la sala
// (o la Unidad Administrativa) y contesta por correo. Se configura igual que FORM_PREFILL, con
// el enlace rellenado previamente de ese formulario: Sala = Sala 1, Fecha = 15/10/2026 y Hora
// de inicio = 07:00. Mientras `enlace` esté vacío, el detalle no ofrece cancelar.
const CANCELAR_PREFILL = {
  enlace: 'https://forms.cloud.microsoft/Pages/ResponsePage.aspx?id=iOBInEReDUuToO6yxhJ8PTm750YXtsNCt97tmedyDMZUMEhaOTU4Q0MyRTROUjNJSlExNUw3RkdZTi4u&r111b801e18e6488c8d1805bfcb1c7ace=%22Sala%201%22&r75482769984b48e2b2965706e22997cd=%222026-10-15%22&r4b46b974930f49c4b4c4805b61f876b3=%2207%3A00%22',
  ejemplo: { sala: 'Sala 1', fecha: '2026-10-15', horaInicio: '07:00' },
};
