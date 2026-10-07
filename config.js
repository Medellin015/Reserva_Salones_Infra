'use strict';
/* ============================================================================
   Salas Piso 9 CAM — configuración (lo único que hay que editar)
   Estructura del archivo:
     1. Formulario de reservas
     2. Contacto
     3. Salas y enlaces de sus calendarios publicados
     4. Pedir desde el calendario (enlace de Forms con respuestas rellenadas)
   Las constantes quedan en el ámbito global de la página; app.js las lee tal cual.
   ============================================================================ */

/* ===== 1. Formulario ===== */

// Formulario de Microsoft Forms que dispara el flujo de reservas.
const FORM_URL = 'https://forms.cloud.microsoft/r/xmAtdmU7sg';

/* ===== 2. Contacto ===== */

// Persona a la que se escribe para dudas o para liberar una sala.
const CONTACTO = { nombre: 'Victor Lezcano', correo: 'victor.lezcano@medellin.gov.co' };

/* ===== 3. Salas ===== */

// Enlace publicado de cada calendario. Cómo obtenerlo:
//   Outlook web, entrando como sal9 → ⚙ Configuración → Calendario → Calendarios
//   compartidos → "Publicar un calendario" → elegir la sala y el nivel "Puede ver
//   cuando estoy ocupado" → Publicar → copiar el enlace HTML (termina en
//   calendar.html). El enlace ICS no sirve aquí.
// La tarea programada de GitHub lee estos mismos enlaces (con calendar.ics al final)
// y escribe disponibilidad.js, que es lo que pinta el calendario de la página.
// Si una sala no tiene enlace, su columna muestra "Sin datos".
const SALAS = [
  { nombre: 'Sala 1', aforo: null, color: 'var(--s1)',
    calendario: 'https://outlook.office365.com/owa/calendar/e7f5063f1ad54d0ebc2b7e5a8b3f2a58@medellin.gov.co/55937f16e55f435a93fb07014c46b8a912560906985531697418/calendar.html' },
  { nombre: 'Sala 2', aforo: null, color: 'var(--s2)',
    calendario: 'https://outlook.office365.com/owa/calendar/e7f5063f1ad54d0ebc2b7e5a8b3f2a58@medellin.gov.co/878029d3bd3645838b56ba74b3681f747497618923992496313/calendar.html' },
  { nombre: 'Sala 3', aforo: null, color: 'var(--s3)',
    calendario: 'https://outlook.office365.com/owa/calendar/e7f5063f1ad54d0ebc2b7e5a8b3f2a58@medellin.gov.co/0296599255094d68944d45b9640c9f8b1032414812168915243/calendar.html' },
  { nombre: 'Sala 4', aforo: null, color: 'var(--s4)',
    calendario: 'https://outlook.office365.com/owa/calendar/e7f5063f1ad54d0ebc2b7e5a8b3f2a58@medellin.gov.co/8e4d1d7594bd463baaaebd8efaf0f7d514839775579376083701/calendar.html' },
];

/* ===== 4. Pedir desde el calendario ===== */

// Al tocar una hora libre del calendario, el formulario se abre con la sala, la
// fecha y la hora de inicio ya escogidas. Para activarlo, con la cuenta dueña del
// formulario:
//   1. En Forms, menú ⋯ (arriba a la derecha) → "Obtener dirección URL rellenada
//      previamente" y active las respuestas rellenadas.
//   2. Rellene Sala = "Sala 1", Fecha = 15/10/2026 y Hora de inicio = "07:00";
//      copie el enlace que genera Forms y péguelo en `enlace`.
//   3. Si usó otros valores de ejemplo, escríbalos en `ejemplo` tal cual.
// La página busca en ese enlace los valores de ejemplo para saber qué parámetro es
// cada pregunta. Si alguno no aparece, no genera enlaces (avisa en la consola del
// navegador) para no pedir una sala, fecha u hora equivocadas. Mientras `enlace`
// esté vacío, el calendario no ofrece pedir desde una hora y queda solo el botón
// "Pedir una sala".
const FORM_PREFILL = {
  enlace: '',
  ejemplo: { sala: 'Sala 1', fecha: '2026-10-15', horaInicio: '07:00' },
};
