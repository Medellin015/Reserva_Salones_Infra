'use strict';
/* ============================================================================
   Salas Piso 9 CAM — actualizar disponibilidad.js desde los calendarios publicados
   Lo ejecuta la tarea programada de GitHub (.github/workflows/disponibilidad.yml)
   cada 15 minutos en horario hábil. También se puede correr a mano:
     node scripts/actualizar-disponibilidad.js
   Lee el enlace ICS de cada sala (el mismo enlace publicado de config.js, con
   calendar.ics en vez de calendar.html), calcula las horas ocupadas de los
   próximos 10 días hábiles y escribe disponibilidad.js solo si algo cambió.
   Estructura del archivo:
     1. Configuración
     2. Fechas en Bogotá
     3. Lectura del ICS (líneas, zonas horarias, propiedades)
     4. Eventos y repeticiones (RRULE, EXDATE, RECURRENCE-ID)
     5. Ocupación por sala y por día
     6. Descarga y escritura del archivo
   ============================================================================ */

const fs = require('fs');
const path = require('path');

/* ===== 1. Configuración ===== */

const RAIZ = path.join(__dirname, '..');
const ARCHIVO_CONFIG = path.join(RAIZ, 'config.js');
const ARCHIVO_SALIDA = path.join(RAIZ, 'disponibilidad.js');
const DIAS_HABILES = 10;
const MS_MIN = 60000;
const MS_DIA = 1440 * MS_MIN;
// Colombia no cambia de hora: Bogotá es siempre UTC-5.
const OFFSET_BOGOTA = -300;
// Outlook solo entrega el ICS a lo que parece un navegador; sin este encabezado
// responde con una página de error (visto en Microsoft Q&A, septiembre de 2025).
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0';
// Zonas que Outlook suele poner en TZID cuando el ICS no trae su VTIMEZONE.
const ZONAS_CONOCIDAS = {
  'SA Pacific Standard Time': -300, 'America/Bogota': -300, 'America/Lima': -300,
  'UTC': 0, 'Etc/UTC': 0, 'GMT Standard Time': 0, 'tzone://Microsoft/Utc': 0,
};
const avisos = [];

// config.js es un script de navegador con constantes globales; se evalúa aislado.
const cargarConfig = () => {
  const codigo = fs.readFileSync(ARCHIVO_CONFIG, 'utf8');
  return new Function(`${codigo}\nreturn { SALAS };`)();
};

/* ===== 2. Fechas en Bogotá ===== */

const pad = (n) => String(n).padStart(2, '0');
const hhmm = (minutos) => `${pad(Math.floor(minutos / 60))}:${pad(minutos % 60)}`;
const camposBogota = (epoch) => {
  const d = new Date(epoch + OFFSET_BOGOTA * MS_MIN);
  return { a: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate(), semana: d.getUTCDay(), minutos: d.getUTCHours() * 60 + d.getUTCMinutes(), segundos: d.getUTCSeconds() };
};
const epochBogota = (a, m, d, minutos = 0) => Date.UTC(a, m - 1, d) + (minutos - OFFSET_BOGOTA) * MS_MIN;
const isoDe = (c) => `${c.a}-${pad(c.m)}-${pad(c.d)}`;
const isoBogota = (epoch) => { const c = camposBogota(epoch); return `${isoDe(c)}T${hhmm(c.minutos)}:${pad(c.segundos)}-05:00`; };
const diasHabiles = (desde, n) => {
  const lista = [];
  for (let e = desde; lista.length < n; e += MS_DIA) {
    const c = camposBogota(e);
    if (c.semana >= 1 && c.semana <= 5) lista.push(isoDe(c));
  }
  return lista;
};

/* ===== 3. Lectura del ICS ===== */

// Une las líneas continuadas (las que empiezan por espacio o tabulador).
const desplegar = (texto) => {
  const salida = [];
  for (const linea of texto.replace(/^﻿/, '').split(/\r\n|\n|\r/)) {
    if ((linea.startsWith(' ') || linea.startsWith('\t')) && salida.length) salida[salida.length - 1] += linea.slice(1);
    else if (linea !== '') salida.push(linea);
  }
  return salida;
};

// NOMBRE;PARAM=VALOR;OTRO="con:dos puntos":VALOR
const leerPropiedad = (linea) => {
  let i = 0;
  let enComillas = false;
  for (; i < linea.length; i++) {
    const c = linea[i];
    if (c === '"') enComillas = !enComillas;
    else if (c === ':' && !enComillas) break;
  }
  const partes = linea.slice(0, i).split(';');
  const params = {};
  for (const p of partes.slice(1)) {
    const k = p.indexOf('=');
    if (k > 0) params[p.slice(0, k).toUpperCase()] = p.slice(k + 1).replace(/^"|"$/g, '');
  }
  return { nombre: partes[0].toUpperCase(), params, valor: linea.slice(i + 1) };
};

// Árbol de componentes: { tipo, props, hijos }.
const leerComponentes = (lineas) => {
  const raiz = { tipo: 'RAIZ', props: [], hijos: [] };
  const pila = [raiz];
  for (const linea of lineas) {
    const p = leerPropiedad(linea);
    if (p.nombre === 'BEGIN') {
      const nuevo = { tipo: p.valor.trim().toUpperCase(), props: [], hijos: [] };
      pila[pila.length - 1].hijos.push(nuevo);
      pila.push(nuevo);
    } else if (p.nombre === 'END') {
      if (pila.length > 1) pila.pop();
    } else {
      pila[pila.length - 1].props.push(p);
    }
  }
  return raiz;
};

const prop = (comp, nombre) => comp.props.find((p) => p.nombre === nombre);
const props = (comp, nombre) => comp.props.filter((p) => p.nombre === nombre);
const buscar = (comp, tipo, salida = []) => {
  for (const h of comp.hijos) { if (h.tipo === tipo) salida.push(h); buscar(h, tipo, salida); }
  return salida;
};

// "-0500" -> -300 minutos.
const leerOffset = (texto) => {
  const m = /^([+-])(\d{2})(\d{2})(\d{2})?$/.exec((texto || '').trim());
  if (!m) return null;
  return (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3]));
};

// Zonas del archivo: TZID -> offset. Se usa el bloque STANDARD; los calendarios de
// las salas están en Bogotá, donde no hay horario de verano.
const leerZonas = (raiz) => {
  const zonas = {};
  for (const tz of buscar(raiz, 'VTIMEZONE')) {
    const id = prop(tz, 'TZID');
    const bloque = tz.hijos.find((h) => h.tipo === 'STANDARD') || tz.hijos.find((h) => h.tipo === 'DAYLIGHT');
    const offset = bloque && leerOffset((prop(bloque, 'TZOFFSETTO') || {}).valor);
    if (id && offset !== null && offset !== undefined) zonas[id.valor.trim()] = offset;
  }
  return zonas;
};

const offsetDeZona = (tzid, zonas) => {
  if (!tzid) return OFFSET_BOGOTA;
  if (tzid in zonas) return zonas[tzid];
  if (tzid in ZONAS_CONOCIDAS) return ZONAS_CONOCIDAS[tzid];
  if (!avisos.includes(`zona ${tzid}`)) avisos.push(`zona ${tzid}`);
  return OFFSET_BOGOTA;
};

// Devuelve { epoch, soloFecha } o null. Las fechas sin hora se toman en Bogotá.
const leerFechaHora = (p, zonas) => {
  if (!p) return null;
  const v = p.valor.trim();
  if ((p.params.VALUE || '').toUpperCase() === 'DATE' || /^\d{8}$/.test(v)) {
    const m = /^(\d{4})(\d{2})(\d{2})$/.exec(v);
    return m ? { epoch: epochBogota(Number(m[1]), Number(m[2]), Number(m[3])), soloFecha: true } : null;
  }
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?(Z)?$/.exec(v);
  if (!m) return null;
  const naive = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6] || 0));
  if (m[7] === 'Z') return { epoch: naive, soloFecha: false };
  return { epoch: naive - offsetDeZona(p.params.TZID, zonas) * MS_MIN, soloFecha: false };
};

// "PT1H30M", "P1D", "-PT15M" -> milisegundos.
const leerDuracion = (texto) => {
  const m = /^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec((texto || '').trim());
  if (!m) return null;
  const ms = ((Number(m[2] || 0) * 7 + Number(m[3] || 0)) * 1440 + Number(m[4] || 0) * 60 + Number(m[5] || 0)) * MS_MIN + Number(m[6] || 0) * 1000;
  return m[1] === '-' ? -ms : ms;
};

/* ===== 4. Eventos y repeticiones ===== */

const leerEvento = (comp, zonas) => {
  const inicio = leerFechaHora(prop(comp, 'DTSTART'), zonas);
  if (!inicio) return null;
  let fin = leerFechaHora(prop(comp, 'DTEND'), zonas);
  if (!fin) {
    const dur = leerDuracion((prop(comp, 'DURATION') || {}).valor);
    fin = { epoch: inicio.epoch + (dur !== null ? dur : inicio.soloFecha ? MS_DIA : 0) };
  }
  const estado = ((prop(comp, 'STATUS') || {}).valor || '').trim().toUpperCase();
  const transp = ((prop(comp, 'TRANSP') || {}).valor || '').trim().toUpperCase();
  const rrule = {};
  const textoRrule = (prop(comp, 'RRULE') || {}).valor;
  if (textoRrule) for (const parte of textoRrule.split(';')) { const k = parte.indexOf('='); if (k > 0) rrule[parte.slice(0, k).toUpperCase()] = parte.slice(k + 1); }
  const exdates = new Set();
  for (const ex of props(comp, 'EXDATE')) for (const v of ex.valor.split(',')) { const f = leerFechaHora({ params: ex.params, valor: v }, zonas); if (f) exdates.add(f.epoch); }
  const recId = leerFechaHora(prop(comp, 'RECURRENCE-ID'), zonas);
  return {
    uid: ((prop(comp, 'UID') || {}).valor || '').trim(),
    inicio: inicio.epoch,
    fin: Math.max(fin.epoch, inicio.epoch),
    rrule: textoRrule ? rrule : null,
    exdates,
    recurrenceId: recId ? recId.epoch : null,
    // Los cancelados y los marcados como "libre" (TRANSPARENT) no ocupan la sala.
    omitir: estado === 'CANCELLED' || transp === 'TRANSPARENT',
  };
};

const DIAS_SEMANA = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };

// Instancias de una serie dentro de la ventana. Soporta DAILY, WEEKLY (con BYDAY),
// MONTHLY y YEARLY por la misma fecha, con INTERVAL, COUNT, UNTIL y EXDATE.
const expandir = (ev, excluidas, finVentana, zonas) => {
  if (!ev.rrule) return [ev];
  const r = ev.rrule;
  const intervalo = Math.max(1, Number(r.INTERVAL || 1));
  const cuenta = r.COUNT ? Number(r.COUNT) : Infinity;
  const duracion = ev.fin - ev.inicio;
  let hasta = Infinity; // límite exclusivo
  if (r.UNTIL) {
    const u = leerFechaHora({ params: {}, valor: r.UNTIL }, zonas);
    if (u) hasta = u.soloFecha ? u.epoch + MS_DIA : u.epoch + 1;
  }
  const salida = [];
  let n = 0;
  let detener = false;
  const agregar = (inicio) => {
    if (inicio >= hasta || n >= cuenta || inicio > finVentana) { detener = true; return; }
    n += 1; // los EXDATE también cuentan para COUNT
    if (ev.exdates.has(inicio) || excluidas.has(inicio)) return;
    salida.push({ ...ev, inicio, fin: inicio + duracion, rrule: null });
  };
  const freq = (r.FREQ || '').toUpperCase();
  if (freq === 'DAILY') {
    for (let k = 0; !detener && k < 5000; k++) agregar(ev.inicio + k * intervalo * MS_DIA);
  } else if (freq === 'WEEKLY') {
    const c = camposBogota(ev.inicio);
    const dias = r.BYDAY
      ? r.BYDAY.split(',').map((d) => DIAS_SEMANA[d.replace(/^[-+]?\d+/, '').toUpperCase()]).filter((d) => d !== undefined)
      : [c.semana];
    const desdeLunes = (d) => (d + 6) % 7;
    const lunesInicial = ev.inicio - desdeLunes(c.semana) * MS_DIA;
    const ordenados = [...new Set(dias)].sort((x, y) => desdeLunes(x) - desdeLunes(y));
    for (let semana = 0; !detener && semana < 5000; semana += intervalo) {
      for (const d of ordenados) {
        const inicio = lunesInicial + (semana * 7 + desdeLunes(d)) * MS_DIA;
        if (inicio < ev.inicio) continue;
        agregar(inicio);
        if (detener) break;
      }
    }
  } else if (freq === 'MONTHLY' || freq === 'YEARLY') {
    if (r.BYDAY && !avisos.includes('BYDAY mensual')) avisos.push('BYDAY mensual');
    const c = camposBogota(ev.inicio);
    for (let k = 0; !detener && k < 1200; k++) {
      const meses = freq === 'MONTHLY' ? k * intervalo : k * intervalo * 12;
      const d = new Date(Date.UTC(c.a, c.m - 1 + meses, c.d));
      if (d.getUTCDate() !== c.d) continue; // el mes no tiene ese día (p. ej. 31)
      const inicio = epochBogota(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), c.minutos) + c.segundos * 1000;
      agregar(inicio);
    }
  } else {
    if (!avisos.includes(`FREQ ${freq}`)) avisos.push(`FREQ ${freq}`);
    return [ev];
  }
  return salida;
};

// Intervalos [inicio, fin) en epoch de todo lo que ocupa la sala dentro de la ventana.
const intervalosOcupados = (textoIcs, inicioVentana, finVentana) => {
  const raiz = leerComponentes(desplegar(textoIcs));
  const zonas = leerZonas(raiz);
  const eventos = buscar(raiz, 'VEVENT').map((c) => leerEvento(c, zonas)).filter(Boolean);
  // Las excepciones de una serie (RECURRENCE-ID) reemplazan a la instancia original.
  const excepciones = new Map();
  for (const ev of eventos) {
    if (ev.recurrenceId === null) continue;
    if (!excepciones.has(ev.uid)) excepciones.set(ev.uid, new Set());
    excepciones.get(ev.uid).add(ev.recurrenceId);
  }
  const intervalos = [];
  for (const ev of eventos) {
    const instancias = ev.recurrenceId === null ? expandir(ev, excepciones.get(ev.uid) || new Set(), finVentana, zonas) : [ev];
    for (const i of instancias) {
      if (i.omitir || i.fin <= inicioVentana || i.inicio >= finVentana || i.fin <= i.inicio) continue;
      intervalos.push([i.inicio, i.fin]);
    }
  }
  return intervalos;
};

/* ===== 5. Ocupación por sala y por día ===== */

const fusionar = (franjas) => {
  const orden = [...franjas].sort((x, y) => x[0] - y[0]);
  const salida = [];
  for (const f of orden) {
    const ultima = salida[salida.length - 1];
    if (ultima && f[0] <= ultima[1]) ultima[1] = Math.max(ultima[1], f[1]);
    else salida.push([f[0], f[1]]);
  }
  return salida;
};

// { 'AAAA-MM-DD': [['08:00','09:30'], ...] } con minutos del día en Bogotá.
const ocupacionPorDia = (intervalos, dias) => {
  const salida = {};
  for (const dia of dias) {
    const [a, m, d] = dia.split('-').map(Number);
    const iniDia = epochBogota(a, m, d);
    const finDia = iniDia + MS_DIA;
    const franjas = [];
    for (const [x, y] of intervalos) {
      const s = Math.max(x, iniDia);
      const e = Math.min(y, finDia);
      if (e > s) franjas.push([Math.floor((s - iniDia) / MS_MIN), Math.ceil((e - iniDia) / MS_MIN)]);
    }
    salida[dia] = fusionar(franjas).map(([s, e]) => [hhmm(s), hhmm(e)]);
  }
  return salida;
};

/* ===== 6. Descarga y escritura del archivo ===== */

const urlIcs = (urlHtml) => urlHtml.trim().replace(/calendar\.html(\?.*)?$/i, 'calendar.ics');

const descargar = async (url) => {
  const respuesta = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'text/calendar,text/plain;q=0.9,*/*;q=0.8', 'Accept-Language': 'es-CO,es;q=0.9' },
    redirect: 'follow',
    signal: AbortSignal.timeout(30000),
  });
  const texto = await respuesta.text();
  if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status}`);
  if (!/^BEGIN:VCALENDAR/i.test(texto.replace(/^﻿/, '').trimStart())) {
    const tipo = respuesta.headers.get('content-type') || 'sin tipo';
    throw new Error(`La respuesta no es un calendario (${tipo.split(';')[0]})`);
  }
  return texto;
};

const leerAnterior = () => {
  try {
    const m = /window\.DISPONIBILIDAD\s*=\s*(\{[\s\S]*\});\s*$/.exec(fs.readFileSync(ARCHIVO_SALIDA, 'utf8'));
    return m ? JSON.parse(m[1]) : null;
  } catch (e) { return null; }
};

const escribir = (datos) => {
  const contenido = `'use strict';
/* Archivo generado por scripts/actualizar-disponibilidad.js desde los calendarios
   publicados de las salas. Lo reescribe la tarea programada de GitHub; no editarlo a mano.
   verificado: último día (Bogotá) en que se pudieron leer los calendarios.
   actualizado: última vez que cambió algo de este archivo. */
window.DISPONIBILIDAD = ${JSON.stringify(datos, null, 1)};
`;
  fs.writeFileSync(ARCHIVO_SALIDA, contenido, 'utf8');
};

const principal = async () => {
  const { SALAS } = cargarConfig();
  const ahora = Date.now();
  const hoy = camposBogota(ahora);
  const dias = diasHabiles(ahora, DIAS_HABILES);
  const inicioVentana = epochBogota(hoy.a, hoy.m, hoy.d);
  const [ua, um, ud] = dias[dias.length - 1].split('-').map(Number);
  const finVentana = epochBogota(ua, um, ud) + MS_DIA;

  const ocupado = {};
  const errores = {};
  for (const sala of SALAS) {
    if (!/^https?:\/\//i.test((sala.calendario || '').trim())) { errores[sala.nombre] = 'Sin enlace de calendario en config.js'; continue; }
    try {
      const texto = await descargar(urlIcs(sala.calendario));
      const intervalos = intervalosOcupados(texto, inicioVentana, finVentana);
      ocupado[sala.nombre] = ocupacionPorDia(intervalos, dias);
      const total = Object.values(ocupado[sala.nombre]).reduce((n, f) => n + f.length, 0);
      console.log(`${sala.nombre}: ${intervalos.length} eventos en la ventana, ${total} franjas ocupadas`);
    } catch (e) {
      errores[sala.nombre] = e.message;
      console.error(`${sala.nombre}: ${e.message}`);
    }
  }
  if (avisos.length) console.warn('Avisos: ' + avisos.join('; '));

  const anterior = leerAnterior() || {};
  const algunaLeida = Object.keys(ocupado).length > 0;
  const nuevo = {
    verificado: algunaLeida ? isoDe(hoy) : anterior.verificado || null,
    actualizado: anterior.actualizado || null,
    dias,
    ocupado,
    errores,
  };
  const sinFecha = (d) => JSON.stringify({ ...d, actualizado: null });
  if (sinFecha(nuevo) === sinFecha(anterior)) {
    console.log('Sin cambios en disponibilidad.js');
  } else {
    nuevo.actualizado = isoBogota(ahora);
    escribir(nuevo);
    console.log('disponibilidad.js actualizado');
  }
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `todas_fallaron=${algunaLeida ? 'false' : 'true'}\n`);
  if (!algunaLeida) console.error('No se pudo leer ningún calendario.');
};

if (require.main === module) {
  principal().catch((e) => { console.error(e); process.exit(1); });
}

module.exports = { desplegar, leerPropiedad, leerComponentes, leerZonas, leerFechaHora, leerDuracion, leerEvento, expandir, intervalosOcupados, fusionar, ocupacionPorDia, urlIcs, diasHabiles, epochBogota, camposBogota };
