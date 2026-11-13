'use strict';
/* Pruebas del historial de uso (uso.js) que arma scripts/actualizar-disponibilidad.js, con
   calendarios ICS de prueba. Se centran en los usos que la Unidad Administrativa registra
   después de que pasaron (el flujo termina el lugar en "(registro)"): en un día anterior que ya
   tiene reservas se suman, y si se borran en Outlook salen, mientras Outlook todavía publique
   ese día. El resto del historial de los días anteriores queda como estaba.

   Uso:  node --test scripts/test/*.test.js */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { actualizarUso, origenDe, tipoDe, franjasCompactas, cargarClasificacion, clasificarOcupado, ventanaHabil } = require('../actualizar-disponibilidad');

// Lunes 09/11/2026 a las 12:00 de Bogotá: la semana en curso empieza hoy.
const AHORA = Date.UTC(2026, 10, 9, 17, 0, 0);
const VENTANA = ventanaHabil(AHORA, 3);

/* Una cita de un día, con horas de Bogotá (UTC-5). */
let uid = 0;
function cita(dia, inicio, fin, { asunto = 'Comité técnico · Ana Pérez', lugar = 'Sala 3', repetir = null } = {}) {
  const utc = (h) => { const [hh, mm] = h.split(':').map(Number); return `${dia.replace(/-/g, '')}T${String(hh + 5).padStart(2, '0')}${String(mm).padStart(2, '0')}00Z`; };
  uid += 1;
  return ['BEGIN:VEVENT', `UID:prueba-${uid}`, `DTSTART:${utc(inicio)}`, `DTEND:${utc(fin)}`, `SUMMARY:${asunto}`, `LOCATION:${lugar}`]
    .concat(repetir ? [`RRULE:${repetir}`] : []).concat(['END:VEVENT']).join('\r\n');
}
const ics = (...citas) => ['BEGIN:VCALENDAR', 'VERSION:2.0', 'X-WR-CALNAME:Sala 3', ...citas, 'END:VCALENDAR'].join('\r\n');
const REGISTRO = { asunto: 'Capacitación · Luis Gómez', lugar: 'Sala 3 (registro)' };
// Una cita suelta del 01/10: muestra que Outlook todavía publica los días desde entonces.
const ANTIGUA = cita('2026-10-01', '09:00', '10:00');
const historial = (dias) => ({ actualizado: '2026-11-06T10:00', desde: Object.keys(dias).sort()[0], festivos: [], dias });

test('origen de cada franja: registro, formulario, planilla u otra', () => {
  assert.strictEqual(origenDe({ t: 'Capacitación · Luis Gómez', l: 'Sala 3 (registro)' }), 'r');
  assert.strictEqual(origenDe({ t: 'Capacitación · Luis Gómez', l: 'Salas 1 y 2 (registro)' }), 'r');
  assert.strictEqual(origenDe({ l: 'Sala 3 (Registro) ' }), 'r');
  assert.strictEqual(origenDe({ t: 'Comité técnico · Ana Pérez', l: 'Sala 3' }), 'f');
  assert.strictEqual(origenDe({ t: 'Reserva · Secretaría', l: 'Sala 3' }), 'p');
  assert.strictEqual(origenDe({ t: 'Reunión' }), 'o');
  assert.strictEqual(origenDe(null), 'o');
  // Solo cuenta la marca al final del lugar.
  assert.strictEqual(origenDe({ t: 'Comité técnico · Ana Pérez', l: 'Sala de registro civil' }), 'f');
});

test('tipo de cada franja: interna, externa o sin marca', () => {
  assert.strictEqual(tipoDe({ t: 'Comité · Ana Pérez', l: 'Sala 3 · Interna' }), 'i');
  assert.strictEqual(tipoDe({ t: 'Comité · Ana Pérez', l: 'Salas 1 y 2 · Externa' }), 'e');
  assert.strictEqual(tipoDe({ t: 'Comité · Ana Pérez', l: 'Sala 5 · Externa (registro)' }), 'e');
  assert.strictEqual(tipoDe({ l: 'Sala 3 ·interna ' }), 'i');
  assert.strictEqual(tipoDe({ t: 'Comité · Ana Pérez', l: 'Sala 3' }), '');
  assert.strictEqual(tipoDe({ t: 'Reserva · Secretaría', l: 'Sala 3 (registro)' }), '');
  assert.strictEqual(tipoDe({ t: 'Reunión con la Externa' }), '', 'solo cuenta la marca al final del lugar');
  assert.strictEqual(tipoDe(null), '');
  // El origen no cambia con la marca.
  assert.strictEqual(origenDe({ t: 'Comité · Ana Pérez', l: 'Sala 3 · Interna' }), 'f');
  assert.strictEqual(origenDe({ t: 'Comité · Ana Pérez', l: 'Sala 3 · Externa (registro)' }), 'r');
  // En uso.js el tipo va como cuarto elemento, solo si la reserva lo tiene.
  assert.deepStrictEqual(franjasCompactas([
    ['08:00', '09:00', { t: 'Comité · Ana Pérez', l: 'Sala 3 · Interna' }],
    ['10:00', '11:00', { t: 'Comité · Ana Pérez', l: 'Sala 3 · Externa (registro)' }],
    ['12:00', '13:00', { t: 'Reserva · Secretaría', l: 'Sala 3' }],
  ]), [[480, 540, 'f', 'i'], [600, 660, 'r', 'e'], [720, 780, 'p']]);
});

test('el historial guarda el tipo de las reservas marcadas', () => {
  const anterior = historial({});
  const lectura = ics(ANTIGUA, cita('2026-11-09', '08:00', '09:00', { lugar: 'Sala 3 · Interna' }),
    cita('2026-11-09', '10:00', '11:00', { lugar: 'Sala 3 · Externa' }), cita('2026-11-09', '13:00', '14:00'));
  const nuevo = actualizarUso(anterior, { 'Sala 3': lectura }, AHORA, VENTANA);
  assert.deepStrictEqual(nuevo.dias['2026-11-09']['Sala 3'], [[480, 540, 'f', 'i'], [600, 660, 'f', 'e'], [780, 840, 'f']]);
});

test('las reservas sin marca toman el tipo de la clasificación anterior, en el historial y en lo programado', () => {
  const clasificacion = { 'Sala 3|2026-10-15|08:00|10:00': 'i', 'Sala 3|2026-11-09|13:00|14:00': 'e', 'Sala 3|2026-11-09|08:00|09:00': 'e' };
  // Un día anterior que ya estaba en el historial sin tipo lo toma; el que no está en la lista queda igual.
  const anterior = historial({ '2026-10-15': { 'Sala 3': [[480, 600, 'f'], [660, 720, 'p']] } });
  const lectura = ics(ANTIGUA, cita('2026-11-09', '08:00', '09:00', { lugar: 'Sala 3 · Interna' }), cita('2026-11-09', '13:00', '14:00'));
  const nuevo = actualizarUso(anterior, { 'Sala 3': lectura }, AHORA, VENTANA, clasificacion);
  assert.deepStrictEqual(nuevo.dias['2026-10-15']['Sala 3'], [[480, 600, 'f', 'i'], [660, 720, 'p']]);
  // En los días de esta semana también; la marca del flujo manda sobre la lista.
  assert.deepStrictEqual(nuevo.dias['2026-11-09']['Sala 3'], [[480, 540, 'f', 'i'], [780, 840, 'f', 'e']]);
  // Otra lectura igual no cambia nada.
  assert.deepStrictEqual(actualizarUso(nuevo, { 'Sala 3': lectura }, AHORA, VENTANA, clasificacion).dias, nuevo.dias);
  // En disponibilidad.js el tipo va en el detalle como "k", solo en las reservas sin marca.
  const ocupado = { '2026-11-09': [['08:00', '09:00', { t: 'A · B', l: 'Sala 3 · Interna' }], ['13:00', '14:00', { t: 'C · D', l: 'Sala 3' }], ['15:00', '16:00']] };
  assert.deepStrictEqual(clasificarOcupado(ocupado, 'Sala 3', { ...clasificacion, 'Sala 3|2026-11-09|15:00|16:00': 'i' }), { '2026-11-09': [
    ['08:00', '09:00', { t: 'A · B', l: 'Sala 3 · Interna' }], ['13:00', '14:00', { t: 'C · D', l: 'Sala 3', k: 'e' }], ['15:00', '16:00', { k: 'i' }]] });
  assert.deepStrictEqual(ocupado['2026-11-09'][1][2], { t: 'C · D', l: 'Sala 3' }, 'no cambia los datos de entrada');
});

test('la clasificación anterior solo trae sala, fecha, horas y tipo', () => {
  const ruta = path.join(__dirname, '..', 'clasificacion-anterior.json');
  const franjas = cargarClasificacion(ruta);
  assert.ok(Object.keys(franjas).length > 0);
  for (const [k, v] of Object.entries(franjas)) {
    assert.match(k, /^Sala [1-9]\|\d{4}-\d{2}-\d{2}\|\d{2}:\d{2}\|\d{2}:\d{2}$/);
    assert.ok(v === 'i' || v === 'e', k);
  }
  assert.ok(!/@|\d{7,}/.test(fs.readFileSync(ruta, 'utf8')), 'sin correos ni números de documento');
  assert.deepStrictEqual(cargarClasificacion(path.join(__dirname, 'no-existe.json')), {}, 'sin archivo no falla');
});

test('un uso registrado se suma a un día anterior que ya tenía reservas', () => {
  const anterior = historial({ '2026-10-15': { 'Sala 3': [[480, 600, 'f']] } });
  const lectura = ics(ANTIGUA, cita('2026-10-15', '08:00', '10:00'), cita('2026-10-15', '14:00', '15:00', REGISTRO));
  const nuevo = actualizarUso(anterior, { 'Sala 3': lectura }, AHORA, VENTANA);
  assert.deepStrictEqual(nuevo.dias['2026-10-15']['Sala 3'], [[480, 600, 'f'], [840, 900, 'r']]);
  // Otra lectura igual no cambia nada.
  assert.deepStrictEqual(actualizarUso(nuevo, { 'Sala 3': lectura }, AHORA, VENTANA).dias, nuevo.dias);
});

test('un uso registrado que se borra en Outlook sale del historial', () => {
  const anterior = historial({ '2026-10-15': { 'Sala 3': [[480, 600, 'f'], [840, 900, 'r']] }, '2026-10-16': { 'Sala 3': [[600, 660, 'r']] } });
  const lectura = ics(ANTIGUA, cita('2026-10-15', '08:00', '10:00'));
  const nuevo = actualizarUso(anterior, { 'Sala 3': lectura }, AHORA, VENTANA);
  assert.deepStrictEqual(nuevo.dias['2026-10-15']['Sala 3'], [[480, 600, 'f']]);
  // Si era lo único de ese día, el día sale del historial.
  assert.strictEqual(nuevo.dias['2026-10-16'], undefined);
});

test('si Outlook ya no publica ese día, el uso registrado se conserva', () => {
  const anterior = historial({ '2026-10-15': { 'Sala 3': [[480, 600, 'f'], [840, 900, 'r']] } });
  // El archivo solo trae citas sueltas desde el 01/11 (y una serie que empezó antes, que no cuenta).
  const lectura = ics(cita('2026-11-03', '08:00', '09:00'), cita('2026-09-01', '07:30', '08:00', { repetir: 'FREQ=WEEKLY;BYDAY=TU' }));
  const nuevo = actualizarUso(anterior, { 'Sala 3': lectura }, AHORA, VENTANA);
  assert.deepStrictEqual(nuevo.dias['2026-10-15']['Sala 3'], [[480, 600, 'f'], [840, 900, 'r']]);
});

test('en los días anteriores solo cambian los usos registrados', () => {
  const anterior = historial({ '2026-10-15': { 'Sala 3': [[480, 600, 'f']] } });
  // La reserva del formulario se movió y apareció otra: el historial de ese día no cambia.
  const lectura = ics(ANTIGUA, cita('2026-10-15', '09:00', '11:00'), cita('2026-10-15', '13:00', '14:00', { asunto: 'Reserva · Secretaría' }));
  const nuevo = actualizarUso(anterior, { 'Sala 3': lectura }, AHORA, VENTANA);
  assert.deepStrictEqual(nuevo.dias['2026-10-15']['Sala 3'], [[480, 600, 'f']]);
});

test('un día anterior sin historial de la sala se agrega completo, con sus registros', () => {
  const anterior = historial({ '2026-10-15': { 'Sala 1': [[480, 600, 'p']] } });
  const lectura = ics(ANTIGUA, cita('2026-10-15', '08:00', '10:00'), cita('2026-10-15', '14:00', '15:00', REGISTRO));
  const nuevo = actualizarUso(anterior, { 'Sala 3': lectura }, AHORA, VENTANA);
  assert.deepStrictEqual(nuevo.dias['2026-10-15'], { 'Sala 1': [[480, 600, 'p']], 'Sala 3': [[480, 600, 'f'], [840, 900, 'r']] });
});

test('al sumar un registro, las franjas que ya estaban conservan su orden', () => {
  const anterior = historial({ '2026-10-15': { 'Sala 3': [[480, 600, 'p'], [480, 600, 'f'], [720, 780, 'o']] } });
  const lectura = ics(ANTIGUA, cita('2026-10-15', '07:30', '08:00', REGISTRO));
  const nuevo = actualizarUso(anterior, { 'Sala 3': lectura }, AHORA, VENTANA);
  assert.deepStrictEqual(nuevo.dias['2026-10-15']['Sala 3'], [[450, 480, 'r'], [480, 600, 'p'], [480, 600, 'f'], [720, 780, 'o']]);
});

test('los días de esta semana se vuelven a escribir con lo que publica Outlook', () => {
  const anterior = historial({ '2026-11-09': { 'Sala 3': [[480, 600, 'f']] } });
  const lectura = ics(ANTIGUA, cita('2026-11-09', '07:30', '09:00', REGISTRO));
  const nuevo = actualizarUso(anterior, { 'Sala 3': lectura }, AHORA, VENTANA);
  assert.deepStrictEqual(nuevo.dias['2026-11-09']['Sala 3'], [[450, 540, 'r']]);
});
