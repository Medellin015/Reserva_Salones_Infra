'use strict';
/* ============================================================================
   Salas Piso 9 CAM — configuración (lo único que hay que editar)
   Estructura del archivo:
     1. Formulario de reservas
     2. Contacto
     3. Salas y enlaces de sus calendarios publicados
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
// Mientras el campo esté vacío, la tarjeta avisa que falta publicar el calendario.
const SALAS = [
  { nombre: 'Sala 1', aforo: null, color: 'var(--s1)', calendario: '' },
  { nombre: 'Sala 2', aforo: null, color: 'var(--s2)', calendario: '' },
  { nombre: 'Sala 3', aforo: null, color: 'var(--s3)', calendario: '' },
  { nombre: 'Sala 4', aforo: null, color: 'var(--s4)', calendario: '' },
];
