'use strict';
/* ============================================================================
   Salas Piso 9 CAM — actualizar disponibilidad.js desde los calendarios publicados
   Lo ejecuta la tarea programada de GitHub (.github/workflows/disponibilidad.yml)
   cada 15 minutos en horario hábil. También se puede correr a mano:
     node scripts/actualizar-disponibilidad.js
   Lee el enlace ICS de cada sala (el mismo enlace publicado de config.js, con
   calendar.ics en vez de calendar.html), calcula las horas ocupadas de los
   próximos 10 días hábiles (sin fines de semana ni festivos de Colombia) y
   escribe disponibilidad.js solo si algo cambió.
   Estructura del archivo:
     1. Configuración
     2. Fechas en Bogotá y festivos de Colombia
     3. Zonas horarias
     4. Lectura del ICS (líneas, componentes, propiedades)
     5. Eventos y repeticiones (RRULE, EXDATE, RECURRENCE-ID)
     6. Ocupación por sala y por día
     7. Descarga y escritura del archivo
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
// Reintentos de descarga ante un fallo pasajero de Outlook o de la red.
const REINTENTOS = 3;
const ESPERA_REINTENTO_MS = Number(process.env.ESPERA_REINTENTO_MS || 5000);
// Si a esta hora de Bogotá aún no se ha podido leer ningún calendario en el día, la
// ejecución queda en rojo una sola vez (GitHub avisa por correo), no cada 15 minutos.
const MINUTO_AVISO_DESDE = 9 * 60;
const MINUTO_AVISO_HASTA = 9 * 60 + 15;
// Outlook solo entrega el ICS a lo que parece un navegador; sin este encabezado
// responde con una página de error (visto en Microsoft Q&A, septiembre de 2025).
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0';
// Nombres de zona de Windows que Outlook pone en TZID, con su equivalente IANA, para
// calcular el desfase exacto en cada fecha (incluido el horario de verano) con Intl.
const ZONAS_WINDOWS = {
  'SA Pacific Standard Time': 'America/Bogota', 'Central America Standard Time': 'America/Guatemala',
  'SA Western Standard Time': 'America/La_Paz', 'Venezuela Standard Time': 'America/Caracas',
  'Pacific SA Standard Time': 'America/Santiago', 'Argentina Standard Time': 'America/Argentina/Buenos_Aires',
  'E. South America Standard Time': 'America/Sao_Paulo', 'Central Standard Time (Mexico)': 'America/Mexico_City',
  'Eastern Standard Time': 'America/New_York', 'Central Standard Time': 'America/Chicago',
  'Mountain Standard Time': 'America/Denver', 'Pacific Standard Time': 'America/Los_Angeles',
  'Atlantic Standard Time': 'America/Halifax', 'GMT Standard Time': 'Europe/London',
  'Romance Standard Time': 'Europe/Paris', 'W. Europe Standard Time': 'Europe/Berlin',
  'Central Europe Standard Time': 'Europe/Budapest', 'Central European Standard Time': 'Europe/Warsaw',
  'UTC': 'UTC', 'Etc/UTC': 'UTC', 'tzone://Microsoft/Utc': 'UTC',
};
const avisos = [];
const avisar = (texto) => { if (!avisos.includes(texto)) avisos.push(texto); };

// config.js es un script de navegador con constantes globales; se evalúa aislado.
const cargarConfig = () => {
  const codigo = fs.readFileSync(ARCHIVO_CONFIG, 'utf8');
  return new Function(`${codigo}\nreturn { SALAS };`)();
};

/* ===== 2. Fechas en Bogotá y festivos de Colombia ===== */

const pad = (n) => String(n).padStart(2, '0');
const hhmm = (minutos) => `${pad(Math.floor(minutos / 60))}:${pad(minutos % 60)}`;
const camposBogota = (epoch) => {
  const d = new Date(epoch + OFFSET_BOGOTA * MS_MIN);
  return { a: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate(), semana: d.getUTCDay(), minutos: d.getUTCHours() * 60 + d.getUTCMinutes(), segundos: d.getUTCSeconds() };
};
const epochBogota = (a, m, d, minutos = 0) => Date.UTC(a, m - 1, d) + (minutos - OFFSET_BOGOTA) * MS_MIN;
const isoDe = (c) => `${c.a}-${pad(c.m)}-${pad(c.d)}`;
const isoBogota = (epoch) => { const c = camposBogota(epoch); return `${isoDe(c)}T${hhmm(c.minutos)}:${pad(c.segundos)}-05:00`; };

// Domingo de Pascua (algoritmo de Meeus/Jones/Butcher), como fecha UTC a medianoche.
const pascua = (a) => {
  const x = a % 19, b = Math.floor(a / 100), c = a % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * x + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((x + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31), dia = ((h + l - 7 * m + 114) % 31) + 1;
  return Date.UTC(a, mes - 1, dia);
};
// Festivos de Colombia (Ley 51 de 1983): fijos, trasladados al lunes siguiente y los que
// dependen de la Pascua. Devuelve un conjunto de fechas AAAA-MM-DD.
const festivosColombia = (a) => {
  const alLunes = (ms) => { const d = new Date(ms).getUTCDay(); return d === 1 ? ms : ms + ((8 - d) % 7) * MS_DIA; };
  const fijos = [[1, 1], [5, 1], [7, 20], [8, 7], [12, 8], [12, 25]].map(([m, d]) => Date.UTC(a, m - 1, d));
  const lunes = [[1, 6], [3, 19], [6, 29], [8, 15], [10, 12], [11, 1], [11, 11]].map(([m, d]) => alLunes(Date.UTC(a, m - 1, d)));
  const p = pascua(a);
  const pascuales = [p - 3 * MS_DIA, p - 2 * MS_DIA, alLunes(p + 39 * MS_DIA), alLunes(p + 60 * MS_DIA), alLunes(p + 68 * MS_DIA)];
  return new Set([...fijos, ...lunes, ...pascuales].map((ms) => new Date(ms).toISOString().slice(0, 10)));
};
const festivosPorAno = {};
const esFestivo = (iso) => {
  const a = Number(iso.slice(0, 4));
  if (!festivosPorAno[a]) festivosPorAno[a] = festivosColombia(a);
  return festivosPorAno[a].has(iso);
};
const diasHabiles = (desde, n) => {
  const lista = [];
  for (let e = desde; lista.length < n; e += MS_DIA) {
    const c = camposBogota(e);
    const iso = isoDe(c);
    if (c.semana >= 1 && c.semana <= 5 && !esFestivo(iso)) lista.push(iso);
  }
  return lista;
};

/* ===== 3. Zonas horarias ===== */

const zonaIntlValida = (zona) => { try { new Intl.DateTimeFormat('en-US', { timeZone: zona }); return true; } catch (e) { return false; } };
// Desfase (minutos al este de UTC) de una zona IANA en un instante dado.
const offsetIntl = (zona, instante) => {
  const partes = new Intl.DateTimeFormat('en-US', { timeZone: zona, timeZoneName: 'longOffset' }).formatToParts(new Date(instante));
  const nombre = (partes.find((p) => p.type === 'timeZoneName') || {}).value || 'GMT';
  const m = /GMT([+-])(\d{2}):?(\d{2})?/.exec(nombre);
  return m ? (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3] || 0)) : 0;
};
// "-0500" -> -300 minutos.
const leerOffset = (texto) => {
  const m = /^([+-])(\d{2})(\d{2})(\d{2})?$/.exec((texto || '').trim());
  return m ? (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3])) : null;
};
// Hora local "ingenua" (como UTC) + TZID -> instante real.
const epochDesdeLocal = (naive, tzid, zonas) => {
  if (!tzid) return naive - OFFSET_BOGOTA * MS_MIN;
  const z = zonas[tzid];
  if (z && z.fija) return naive - z.estandar * MS_MIN;
  const iana = ZONAS_WINDOWS[tzid] || (tzid.includes('/') && zonaIntlValida(tzid) ? tzid : null);
  if (iana) {
    const o1 = offsetIntl(iana, naive);
    const o2 = offsetIntl(iana, naive - o1 * MS_MIN);
    return naive - o2 * MS_MIN;
  }
  if (z) { avisar(`zona "${tzid}" con horario de verano y sin equivalente conocido: se usa su hora estándar`); return naive - z.estandar * MS_MIN; }
  avisar(`zona "${tzid}" desconocida: se asume Bogotá`);
  return naive - OFFSET_BOGOTA * MS_MIN;
};

/* ===== 4. Lectura del ICS ===== */

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

// Zonas del archivo: TZID -> { estandar, verano, fija }. Si tiene horario de verano, el
// desfase exacto se calcula con Intl (ver epochDesdeLocal); aquí solo se guardan los valores.
const leerZonas = (raiz) => {
  const zonas = {};
  for (const tz of buscar(raiz, 'VTIMEZONE')) {
    const id = prop(tz, 'TZID');
    const std = tz.hijos.find((h) => h.tipo === 'STANDARD');
    const dst = tz.hijos.find((h) => h.tipo === 'DAYLIGHT');
    const estandar = std ? leerOffset((prop(std, 'TZOFFSETTO') || {}).valor) : null;
    const verano = dst ? leerOffset((prop(dst, 'TZOFFSETTO') || {}).valor) : null;
    const base = estandar !== null ? estandar : verano;
    if (id && base !== null) zonas[id.valor.trim()] = { estandar: base, verano, fija: verano === null || verano === estandar };
  }
  return zonas;
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
  return { epoch: epochDesdeLocal(naive, p.params.TZID, zonas), soloFecha: false };
};

// "PT1H30M", "P1D", "-PT15M" -> milisegundos.
const leerDuracion = (texto) => {
  const m = /^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec((texto || '').trim());
  if (!m) return null;
  const ms = ((Number(m[2] || 0) * 7 + Number(m[3] || 0)) * 1440 + Number(m[4] || 0) * 60 + Number(m[5] || 0)) * MS_MIN + Number(m[6] || 0) * 1000;
  return m[1] === '-' ? -ms : ms;
};

/* ===== 5. Eventos y repeticiones ===== */

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
  // EXDATE con hora excluye un instante; EXDATE de solo fecha excluye todo ese día (Bogotá).
  const exdates = new Set();
  const exdatesFecha = new Set();
  for (const ex of props(comp, 'EXDATE')) {
    for (const v of ex.valor.split(',')) {
      const f = leerFechaHora({ params: ex.params, valor: v }, zonas);
      if (f && f.soloFecha) exdatesFecha.add(isoDe(camposBogota(f.epoch)));
      else if (f) exdates.add(f.epoch);
    }
  }
  const recId = leerFechaHora(prop(comp, 'RECURRENCE-ID'), zonas);
  return {
    uid: ((prop(comp, 'UID') || {}).valor || '').trim(),
    inicio: inicio.epoch,
    fin: Math.max(fin.epoch, inicio.epoch),
    rrule: textoRrule ? rrule : null,
    exdates,
    exdatesFecha,
    recurrenceId: recId ? recId.epoch : null,
    // Los cancelados y los marcados como "libre" (TRANSPARENT) no ocupan la sala.
    omitir: estado === 'CANCELLED' || transp === 'TRANSPARENT',
  };
};

const DIAS_SEMANA = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };
const listaNumeros = (texto) => (texto || '').split(',').map((x) => Number(x)).filter((x) => Number.isInteger(x) && x !== 0);
const leerByDay = (texto) => (texto || '').split(',').map((d) => {
  const m = /^([+-]?\d+)?(SU|MO|TU|WE|TH|FR|SA)$/.exec(d.trim().toUpperCase());
  return m ? { n: m[1] ? Number(m[1]) : 0, dia: DIAS_SEMANA[m[2]] } : null;
}).filter(Boolean);

// Días (1..31) de un mes que cumplen BYDAY (con ordinal o con BYSETPOS) o BYMONTHDAY;
// sin ninguno de los dos, el día del mes de DTSTART.
const diasDelMes = (a, m, r, diaInicio) => {
  const ultimo = new Date(Date.UTC(a, m, 0)).getUTCDate();
  const seleccionar = (lista, posiciones) => posiciones.map((p) => (p > 0 ? lista[p - 1] : lista[lista.length + p])).filter((x) => x !== undefined);
  if (r.BYDAY) {
    const reglas = leerByDay(r.BYDAY);
    const porDia = (dia) => { const l = []; for (let d = 1; d <= ultimo; d++) if (new Date(Date.UTC(a, m - 1, d)).getUTCDay() === dia) l.push(d); return l; };
    let dias = [];
    for (const regla of reglas) {
      const l = porDia(regla.dia);
      dias.push(...(regla.n ? seleccionar(l, [regla.n]) : l));
    }
    dias = [...new Set(dias)].sort((x, y) => x - y);
    if (r.BYSETPOS && !reglas.some((x) => x.n)) dias = seleccionar(dias, listaNumeros(r.BYSETPOS)).sort((x, y) => x - y);
    return dias;
  }
  if (r.BYMONTHDAY) return [...new Set(listaNumeros(r.BYMONTHDAY).map((d) => (d > 0 ? d : ultimo + 1 + d)).filter((d) => d >= 1 && d <= ultimo))].sort((x, y) => x - y);
  return diaInicio <= ultimo ? [diaInicio] : [];
};

// Instancias de una serie dentro de la ventana. Soporta DAILY, WEEKLY (con BYDAY),
// MONTHLY y YEARLY (por día del mes, BYMONTHDAY, BYDAY con ordinal o BYSETPOS, BYMONTH),
// con INTERVAL, COUNT, UNTIL, EXDATE y las excepciones (RECURRENCE-ID) de la serie.
const expandir = (ev, excluidas, inicioVentana, finVentana) => {
  if (!ev.rrule) return [ev];
  const r = ev.rrule;
  const freq = (r.FREQ || '').toUpperCase();
  const intervalo = Math.max(1, Number(r.INTERVAL || 1));
  const cuenta = r.COUNT ? Number(r.COUNT) : Infinity;
  const duracion = ev.fin - ev.inicio;
  let hasta = Infinity; // límite exclusivo
  if (r.UNTIL) {
    const u = leerFechaHora({ params: {}, valor: r.UNTIL }, {});
    if (u) hasta = u.soloFecha ? u.epoch + MS_DIA : u.epoch + 1;
  }
  const noSoportado = ['BYWEEKNO', 'BYYEARDAY', 'BYHOUR', 'BYMINUTE', 'BYSECOND'].filter((k) => r[k]);
  if (noSoportado.length || !['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'].includes(freq)) {
    // Solo se cuenta la primera instancia, que sí es real; el resto no se puede calcular.
    avisar(`serie con ${noSoportado.join(', ') || 'FREQ=' + freq} no soportada: solo se toma su primera cita`);
    return [ev];
  }
  const salida = [];
  let n = 0;
  let detener = false;
  const agregar = (inicio) => {
    if (inicio >= hasta || n >= cuenta || inicio > finVentana) { detener = true; return; }
    n += 1; // los EXDATE también cuentan para COUNT
    if (ev.exdates.has(inicio) || excluidas.has(inicio) || ev.exdatesFecha.has(isoDe(camposBogota(inicio)))) return;
    if (inicio + duracion > inicioVentana) salida.push({ ...ev, inicio, fin: inicio + duracion, rrule: null });
  };
  // Sin COUNT no hace falta recorrer desde el principio de una serie muy antigua.
  const saltoInicial = (paso) => (cuenta === Infinity ? Math.max(0, Math.floor((inicioVentana - ev.inicio) / paso) - 1) : 0);
  const c = camposBogota(ev.inicio);

  if (freq === 'DAILY') {
    const paso = intervalo * MS_DIA;
    for (let k = saltoInicial(paso); !detener && k < 1e6; k++) agregar(ev.inicio + k * paso);
  } else if (freq === 'WEEKLY') {
    const reglas = r.BYDAY ? leerByDay(r.BYDAY).map((x) => x.dia) : [c.semana];
    const desdeLunes = (d) => (d + 6) % 7;
    const ordenados = [...new Set(reglas)].sort((x, y) => desdeLunes(x) - desdeLunes(y));
    // DTSTART siempre es la primera instancia, aunque su día no esté en BYDAY (RFC 5545).
    if (!ordenados.includes(c.semana)) agregar(ev.inicio);
    const lunesInicial = ev.inicio - desdeLunes(c.semana) * MS_DIA;
    const paso = intervalo * 7 * MS_DIA;
    for (let semana = saltoInicial(paso) * intervalo; !detener && semana < 1e6; semana += intervalo) {
      for (const d of ordenados) {
        const inicio = lunesInicial + (semana * 7 + desdeLunes(d)) * MS_DIA;
        if (inicio < ev.inicio) continue;
        agregar(inicio);
        if (detener) break;
      }
    }
  } else {
    // MONTHLY y YEARLY: se recorren los periodos y, en cada mes, los días que cumplen la regla.
    const meses = freq === 'YEARLY' ? (r.BYMONTH ? listaNumeros(r.BYMONTH).filter((x) => x >= 1 && x <= 12).sort((x, y) => x - y) : [c.m]) : null;
    const mesesPorPeriodo = freq === 'MONTHLY' ? intervalo : 12 * intervalo;
    const periodosSaltados = cuenta === Infinity ? Math.max(0, Math.floor((inicioVentana - ev.inicio) / (mesesPorPeriodo * 28 * MS_DIA)) - 2) : 0;
    for (let k = periodosSaltados; !detener && k < 20000; k++) {
      const candidatos = [];
      if (freq === 'MONTHLY') {
        const d = new Date(Date.UTC(c.a, c.m - 1 + k * intervalo, 1));
        for (const dia of diasDelMes(d.getUTCFullYear(), d.getUTCMonth() + 1, r, c.d)) candidatos.push(epochBogota(d.getUTCFullYear(), d.getUTCMonth() + 1, dia, c.minutos) + c.segundos * 1000);
      } else {
        const a = c.a + k * intervalo;
        for (const mes of meses) for (const dia of diasDelMes(a, mes, r, c.d)) candidatos.push(epochBogota(a, mes, dia, c.minutos) + c.segundos * 1000);
      }
      for (const inicio of candidatos) {
        if (inicio < ev.inicio) continue;
        agregar(inicio);
        if (detener) break;
      }
    }
  }
  return salida;
};

// Intervalos [inicio, fin) en epoch de todo lo que ocupa la sala dentro de la ventana.
const intervalosOcupados = (textoIcs, inicioVentana, finVentana) => {
  const raiz = leerComponentes(desplegar(textoIcs));
  const zonas = leerZonas(raiz);
  const eventos = buscar(raiz, 'VEVENT').map((comp) => leerEvento(comp, zonas)).filter(Boolean);
  // Las excepciones de una serie (RECURRENCE-ID) reemplazan a la instancia original.
  const excepciones = new Map();
  for (const ev of eventos) {
    if (ev.recurrenceId === null) continue;
    if (!excepciones.has(ev.uid)) excepciones.set(ev.uid, new Set());
    excepciones.get(ev.uid).add(ev.recurrenceId);
  }
  const intervalos = [];
  for (const ev of eventos) {
    const instancias = ev.recurrenceId === null ? expandir(ev, excepciones.get(ev.uid) || new Set(), inicioVentana, finVentana) : [ev];
    for (const i of instancias) {
      if (i.omitir || i.fin <= inicioVentana || i.inicio >= finVentana || i.fin <= i.inicio) continue;
      intervalos.push([i.inicio, i.fin]);
    }
  }
  return intervalos;
};

/* ===== 6. Ocupación por sala y por día ===== */

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

/* ===== 7. Descarga y escritura del archivo ===== */

const urlIcs = (urlHtml) => urlHtml.trim().replace(/calendar\.html(\?.*)?$/i, 'calendar.ics');
const esperar = (ms) => new Promise((resolver) => { setTimeout(resolver, ms); });

const descargarUnaVez = async (url) => {
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

// Varios intentos: un fallo pasajero no debe borrar los datos de la sala ni generar commits.
const descargar = async (url) => {
  let ultimo;
  for (let intento = 1; intento <= REINTENTOS; intento++) {
    try { return await descargarUnaVez(url); } catch (e) {
      ultimo = e;
      if (intento < REINTENTOS) await esperar(ESPERA_REINTENTO_MS);
    }
  }
  throw ultimo;
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
   verificado: último día (Bogotá) en que se pudo leer al menos un calendario.
   actualizado: última vez que cambió algo de este archivo.
   errores: salas cuyo calendario no se pudo leer en la última ejecución; si conservan
   datos en "ocupado", son los de la última lectura buena del mismo día. */
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
  const anterior = leerAnterior() || {};
  const mismaVentana = JSON.stringify(anterior.dias) === JSON.stringify(dias);

  const ocupado = {};
  const errores = {};
  let leidas = 0;
  for (const sala of SALAS) {
    if (!/^https?:\/\//i.test((sala.calendario || '').trim())) { errores[sala.nombre] = 'Sin enlace de calendario en config.js'; continue; }
    try {
      const texto = await descargar(urlIcs(sala.calendario));
      const intervalos = intervalosOcupados(texto, inicioVentana, finVentana);
      ocupado[sala.nombre] = ocupacionPorDia(intervalos, dias);
      leidas += 1;
      const total = Object.values(ocupado[sala.nombre]).reduce((acc, f) => acc + f.length, 0);
      console.log(`${sala.nombre}: ${intervalos.length} citas en la ventana, ${total} franjas ocupadas`);
    } catch (e) {
      errores[sala.nombre] = e.message;
      console.error(`${sala.nombre}: ${e.message}`);
      // Se conservan los datos de la última lectura buena mientras la ventana de días sea la misma.
      if (mismaVentana && anterior.ocupado && anterior.ocupado[sala.nombre]) ocupado[sala.nombre] = anterior.ocupado[sala.nombre];
    }
  }
  if (avisos.length) console.warn('Avisos: ' + avisos.join('; '));

  const nuevo = {
    verificado: leidas > 0 ? isoDe(hoy) : anterior.verificado || null,
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
  const todasFallaron = leidas === 0;
  const avisarFallo = todasFallaron && nuevo.verificado !== isoDe(hoy) && hoy.minutos >= MINUTO_AVISO_DESDE && hoy.minutos < MINUTO_AVISO_HASTA;
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `todas_fallaron=${todasFallaron}\navisar_fallo=${avisarFallo}\n`);
  if (todasFallaron) console.error('No se pudo leer ningún calendario.');
};

if (require.main === module) {
  principal().catch((e) => { console.error(e); process.exit(1); });
}

module.exports = { desplegar, leerPropiedad, leerComponentes, leerZonas, leerFechaHora, leerDuracion, leerEvento, expandir, intervalosOcupados, fusionar, ocupacionPorDia, urlIcs, diasHabiles, epochBogota, camposBogota, pascua, festivosColombia, esFestivo, diasDelMes };
