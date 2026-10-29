'use strict';
/* ============================================================================
   Salas Piso 9 CAM — página de disponibilidad y acceso al formulario
   Lee FORM_URL, HORARIO, CONTACTO, SALAS, SALAS_JUNTAS, FORM_PREFILL y CANCELAR_PREFILL de config.js, y
   las horas ocupadas de disponibilidad.js; los dos se cargan antes que este archivo.
   Estructura del archivo:
     1. Utilidades
     2. Calendario de disponibilidad (y enlace de Forms con respuestas rellenadas)
     3. Tema claro/oscuro
     4. Reglas de las salas, contacto y copiar correo
     5. Arranque
   ============================================================================ */

/* ===== 1. Utilidades ===== */

const $ = (sel) => document.querySelector(sel);
const esUrl = (v) => typeof v === 'string' && /^https?:\/\//i.test(v.trim());
const escapar = (t) => String(t).replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
const mayuscula = (t) => t.charAt(0).toUpperCase() + t.slice(1);

// Plan B para copiar cuando navigator.clipboard no existe (páginas servidas por http
// sin TLS) o rechaza la escritura: un textarea invisible y el comando copy clásico.
const copiarConTextarea = (texto) => {
  const activo = document.activeElement; // ta.select() se lleva el foco; se devuelve al salir
  const ta = document.createElement('textarea');
  ta.value = texto;
  ta.setAttribute('readonly', '');
  ta.style.position = 'fixed';
  ta.style.top = '0';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  let ok = false;
  try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
  document.body.removeChild(ta);
  if (activo && activo.focus) activo.focus();
  return ok;
};

/* ===== 2. Calendario de disponibilidad ===== */

// Horario de reservas (HORARIO en config.js), en bloques de media hora. El calendario muestra las
// horas completas que lo contienen (07:00 a 18:00 con el horario de 07:30 a 17:30): lo que queda
// por fuera se ve rayado y no se ofrece para pedir. Si HORARIO falta (un config.js viejo guardado
// en el navegador) o no sirve, va de 07:30 a 17:30; si no sirve, además avisa en la consola.
const aMinutos = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };
const hhmm = (minutos) => `${String(Math.floor(minutos / 60)).padStart(2, '0')}:${String(minutos % 60).padStart(2, '0')}`;
const BLOQUE = 30;
const esMediaHora = (h) => typeof h === 'string' && /^([01]\d|2[0-3]):[03]0$/.test(h.trim());
const horario = (() => {
  const base = { inicio: '07:30', fin: '17:30' };
  if (typeof HORARIO === 'undefined') return base;
  const h = HORARIO && typeof HORARIO === 'object' ? HORARIO : {};
  if (esMediaHora(h.inicio) && esMediaHora(h.fin) && aMinutos(h.inicio.trim()) < aMinutos(h.fin.trim())) return { inicio: h.inicio.trim(), fin: h.fin.trim() };
  console.warn('HORARIO de config.js no es válido (use { inicio: \'07:30\', fin: \'17:30\' }, en medias horas); se usa de 07:30 a 17:30.');
  return base;
})();
const INICIO_RESERVAS = aMinutos(horario.inicio);
const FIN_RESERVAS = aMinutos(horario.fin);
const INICIO_DIA = Math.floor(INICIO_RESERVAS / 60) * 60;
const FIN_DIA = Math.ceil(FIN_RESERVAS / 60) * 60;
const pct = (min) => ((Math.min(Math.max(min, INICIO_DIA), FIN_DIA) - INICIO_DIA) / (FIN_DIA - INICIO_DIA)) * 100;
// La tarea programada lee los calendarios desde las 06:00; si a esta hora aún no ha
// podido leerlos hoy, se avisa que la información puede estar vieja.
const HORA_AVISO = aMinutos('07:30');

// Fecha (AAAA-MM-DD) y minuto del día de un instante, en Bogotá, sin depender de la zona
// horaria del equipo. formatToParts evita confiar en el formato de salida de una región.
const enBogota = (fecha) => {
  const partes = {};
  new Intl.DateTimeFormat('en-US', { timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(fecha).forEach((x) => { partes[x.type] = x.value; });
  return { fecha: `${partes.year}-${partes.month}-${partes.day}`, minutos: Number(partes.hour) * 60 + Number(partes.minute) };
};
const ahoraBogota = () => {
  const ahora = enBogota(new Date());
  const semana = fechaLocal(ahora.fecha).getDay();
  return { ...ahora, habil: semana >= 1 && semana <= 5 };
};

// new Date(a, m - 1, d) evita el desfase de zona horaria al leer "AAAA-MM-DD".
const fechaLocal = (iso) => { const [a, m, d] = iso.split('-').map(Number); return new Date(a, m - 1, d); };
const isoDe = (f) => `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, '0')}-${String(f.getDate()).padStart(2, '0')}`;
const sumarDias = (iso, n) => { const f = fechaLocal(iso); f.setDate(f.getDate() + n); return isoDe(f); };
// Lunes de la semana de una fecha (getDay: 0 es domingo).
const lunesDe = (iso) => sumarDias(iso, -((fechaLocal(iso).getDay() + 6) % 7));
const DIAS_CORTOS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const fechaLarga = (iso) => fechaLocal(iso).toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' });
// Lunes a viernes de una semana: "12–16 oct" y "del 12 al 16 de octubre"; si cruza de mes,
// "28 sep–2 oct" y "del 28 de septiembre al 2 de octubre".
const rangoCorto = (lunes) => {
  const a = fechaLocal(lunes);
  const b = fechaLocal(sumarDias(lunes, 4));
  const mes = (f) => MESES[f.getMonth()].slice(0, 3);
  return a.getMonth() === b.getMonth() ? `${a.getDate()}–${b.getDate()} ${mes(b)}` : `${a.getDate()} ${mes(a)}–${b.getDate()} ${mes(b)}`;
};
const rangoLargo = (lunes) => {
  const a = fechaLocal(lunes);
  const b = fechaLocal(sumarDias(lunes, 4));
  const mes = (f) => MESES[f.getMonth()];
  return a.getMonth() === b.getMonth() ? `del ${a.getDate()} al ${b.getDate()} de ${mes(b)}` : `del ${a.getDate()} de ${mes(a)} al ${b.getDate()} de ${mes(b)}`;
};
// "Esta semana" o "Próxima semana" según la semana de hoy; las demás no llevan nombre.
const nombreSemana = (lunes, hoyIso) => {
  const actual = lunesDe(hoyIso);
  if (lunes === actual) return 'Esta semana';
  return lunes === sumarDias(actual, 7) ? 'Próxima semana' : '';
};
// "2026-10" → "Octubre 2026" en el botón y la lista de meses, y "octubre de 2026" para los
// lectores de pantalla.
const nombreMes = (mes) => { const [a, m] = mes.split('-').map(Number); return `${mayuscula(MESES[m - 1])} ${a}`; };
const mesLargo = (mes) => { const [a, m] = mes.split('-').map(Number); return `${MESES[m - 1]} de ${a}`; };
// Lunes de las semanas de un mes: las que tienen algún día de lunes a viernes en ese mes.
const semanasDelMes = (mes) => {
  const [a, m] = mes.split('-').map(Number);
  const primero = `${mes}-01`;
  const ultimo = isoDe(new Date(a, m, 0)); // el día 0 del mes siguiente es el último de este
  const lunes = [];
  for (let l = lunesDe(primero); l <= ultimo; l = sumarDias(l, 7)) if (sumarDias(l, 4) >= primero) lunes.push(l);
  return lunes;
};

// "la Sala 1, la Sala 2 y la Sala 3".
const enumerar = (lista) => (lista.length > 1 ? `${lista.slice(0, -1).join(', ')} y ${lista[lista.length - 1]}` : lista[0]);

// Salas que muestra la página: las que config.js marca con activa: false no aparecen.
const salasActivas = () => SALAS.filter((s) => s.activa !== false);
// Salas que se piden juntas, según config.js, y el nombre con que el formulario y el flujo las
// manejan: ['Sala 1', 'Sala 2'] → "Salas 1 y 2".
const gruposJuntos = () => (typeof SALAS_JUNTAS !== 'undefined' && Array.isArray(SALAS_JUNTAS) ? SALAS_JUNTAS : []).filter(Array.isArray);
const nombreJuntas = (grupo) => `Salas ${grupo.map((n) => String(n).replace(/^sala\s+/i, '')).join(' y ')}`;
// Código de la columna de cada sala dentro de un día: "Sala 1" → "S1".
const codigoSala = (s) => { const m = /^sala\s+(\S{1,3})$/i.exec(s.nombre.trim()); return m ? `S${m[1]}` : s.nombre.trim().slice(0, 3); };

const enlaceOutlook = (s, texto = s.nombre) => `<a href="${escapar(s.calendario.trim())}" target="_blank" rel="noopener" aria-label="${escapar(`Calendario de la ${s.nombre} en Outlook`)}">${escapar(texto)}</a>`;
const enlacesOutlook = () => salasActivas().filter((s) => esUrl(s.calendario)).map((s) => enlaceOutlook(s)).join(' · ');

// --- Enlace de Forms con respuestas rellenadas ---
// Formas en que Forms puede escribir una fecha en el enlace; se prueban contra la fecha de ejemplo.
const formatosFecha = (iso) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso || '')) return [];
  const sin0 = (x) => String(Number(x));
  const partes = (y) => y.split('-');
  return [
    (y) => y,
    (y) => { const [A, M, D] = partes(y); return `${D}/${M}/${A}`; },
    (y) => { const [A, M, D] = partes(y); return `${sin0(D)}/${sin0(M)}/${A}`; },
    (y) => { const [A, M, D] = partes(y); return `${M}/${D}/${A}`; },
    (y) => { const [A, M, D] = partes(y); return `${sin0(M)}/${sin0(D)}/${A}`; },
    (y) => { const [A, M, D] = partes(y); return `${D}-${M}-${A}`; },
    (y) => y.replace(/-/g, '/'),
    (y) => y.replace(/-/g, ''),
  ].map((f) => ({ f, ejemplo: f(iso) }));
};

// Lee un enlace de ejemplo de config.js (FORM_PREFILL para pedir, CANCELAR_PREFILL para cancelar)
// y descubre qué parámetro lleva cada respuesta. Devuelve null si no está configurado o si algún
// valor de ejemplo no aparece en el enlace: en ese caso no se generan enlaces, porque llevarían el
// valor de ejemplo fijo. nombre es el de la constante, para los avisos de la consola, y
// consecuencia dice qué deja de ofrecer la página.
const plantillaPrefill = (cfg, nombre, consecuencia) => {
  if (!cfg || typeof cfg !== 'object' || !esUrl(cfg.enlace)) return null;
  let url;
  try { url = new URL(cfg.enlace.trim()); } catch (e) { return null; }
  const ej = cfg.ejemplo || {};
  // Forms escribe cada respuesta como texto JSON entre comillas ("Sala 1"); se comparan sin
  // ellas y, al generar los enlaces, se vuelven a poner igual que en el enlace de ejemplo.
  const pares = url.search.replace(/^\?/, '').split('&').filter(Boolean).map((par) => {
    const k = par.indexOf('=');
    const clave = k < 0 ? par : par.slice(0, k);
    const valor = k < 0 ? '' : par.slice(k + 1);
    let decodificado = valor;
    try { decodificado = decodeURIComponent(valor.replace(/\+/g, ' ')); } catch (e) { /* se deja tal cual */ }
    decodificado = decodificado.trim();
    let comillas = false;
    if (/^".*"$/.test(decodificado)) {
      try { const interno = JSON.parse(decodificado); if (typeof interno === 'string') { decodificado = interno.trim(); comillas = true; } } catch (e) { /* no era JSON */ }
    }
    return { clave, valor, decodificado, comillas };
  });
  const campos = { sala: null, hora: null, fecha: null };
  let formato = null;
  for (const p of pares) {
    if (!campos.sala && ej.sala && p.decodificado === ej.sala) { campos.sala = p.clave; continue; }
    if (!campos.hora && ej.horaInicio && p.decodificado === ej.horaInicio) { campos.hora = p.clave; continue; }
    if (!campos.fecha && ej.fecha) {
      const f = formatosFecha(ej.fecha).find((x) => p.decodificado === x.ejemplo || p.decodificado.startsWith(x.ejemplo + 'T') || p.decodificado.startsWith(x.ejemplo + ' '));
      if (f) { campos.fecha = p.clave; formato = f; }
    }
  }
  const faltan = [['sala', ej.sala, campos.sala], ['fecha', ej.fecha, campos.fecha], ['horaInicio', ej.horaInicio, campos.hora]]
    .filter(([, valor, clave]) => valor && !clave).map(([campo, valor]) => `${campo} = "${valor}"`);
  if (faltan.length) {
    console.warn(`${nombre}: en el enlace no ${faltan.length > 1 ? 'aparecen' : 'aparece'} ${enumerar(faltan)}; revise ${nombre}.ejemplo en config.js. ${consecuencia}`);
    return null;
  }
  if (!campos.sala && !campos.hora && !campos.fecha) return null;
  // Cualquier otra respuesta rellenada en el enlace de ejemplo viajará fija en todos los enlaces.
  const extras = pares.filter((p) => !['id', 'lang'].includes(p.clave) && !Object.values(campos).includes(p.clave) && p.decodificado !== '');
  if (extras.length) console.info(`${nombre}: el enlace trae además ${enumerar(extras.map((p) => `${p.clave} = "${p.decodificado}"`))}; ese valor irá fijo en todas las solicitudes.`);
  // La sala solo se rellena si el enlace de ejemplo la trae (el formulario actual la pregunta
  // al final, según el número de personas).
  const enlace = (sala, fechaIso, hora) => {
    const nuevos = {};
    if (campos.sala) nuevos[campos.sala] = sala;
    if (campos.fecha) nuevos[campos.fecha] = formato.f(fechaIso);
    if (campos.hora) nuevos[campos.hora] = hora;
    const consulta = pares.map((p) => {
      if (!(p.clave in nuevos)) return `${p.clave}=${p.valor}`;
      const texto = p.comillas ? JSON.stringify(nuevos[p.clave]) : nuevos[p.clave];
      return `${p.clave}=${encodeURIComponent(texto)}`;
    }).join('&');
    return `${url.origin}${url.pathname}?${consulta}${url.hash}`;
  };
  return { campos, enlace, conSala: Boolean(campos.sala) };
};

// Vista del calendario: 'semana' (la semana elegida, con el detalle de cada reserva) o 'mes' (el
// mes completo). mesElegido ('AAAA-MM') es el del botón de meses; al lado van sus semanas.
let vista = 'semana';
let mesElegido = null;
let semanaElegida = null;
let listaMesesAbierta = false;
let mesPintado = null;
// Al abrir la página, cambiar de semana o tocar un día del mes, el calendario se desliza hasta hoy
// o hasta ese día (en el celular la semana no cabe a lo ancho); en los repintados siguientes
// conserva el desplazamiento. Vale 'hoy', una fecha AAAA-MM-DD o null.
let irA = 'hoy';
let prefill = null;
// Enlace del formulario de cancelación con la reserva ya puesta; null si no está configurado.
let cancelar = null;
let claveRender = null;

// --- Detalle de una reserva ---
// El flujo pone en el asunto "Motivo · Responsable"; si viene así, se separan.
const resumenReserva = (info) => {
  if (!info || !info.t) return { titulo: '', motivo: '', responsable: '' };
  const m = /^(.+?)\s+·\s+(.+)$/.exec(info.t);
  return m ? { titulo: info.t, motivo: m[1].trim(), responsable: m[2].trim() } : { titulo: info.t, motivo: '', responsable: '' };
};

// Botón "Cancelar esta reserva" del detalle: abre el formulario de cancelación con la sala, la
// fecha y la hora de inicio ya puestas. Solo para reservas que no han terminado y cuya hora cabe en
// la lista del formulario de cancelación (de 07:00 a 17:30, cada media hora, como la franja del
// calendario; así también se cancelan las reservas de antes del horario de 07:30 a 17:30): una
// que empieza a una hora intermedia, como 08:15, va con la media hora anterior, que es donde la
// busca el flujo. Una reserva de dos salas juntas se cancela como "Salas 1 y 2", y el flujo la
// borra en las dos. Una que ya empezó solo la puede cancelar la Unidad Administrativa (el flujo
// se la deja solo a ella): la nota lo dice.
const NOTA_EN_CURSO = 'Esta reserva ya empezó: solo la Unidad Administrativa puede cancelarla, para liberar lo que falta. El formulario se abre con la reserva ya puesta y la respuesta llega por correo.';
const pintarCancelar = (sala, dia, inicio, fin, info) => {
  const enlace = $('#det-cancelar');
  const nota = $('#det-cancelar-nota');
  if (!enlace || !nota) return;
  const ahora = ahoraBogota();
  const minutos = aMinutos(inicio);
  const bloque = Math.floor(minutos / BLOQUE) * BLOQUE;
  const porEmpezar = dia > ahora.fecha || (dia === ahora.fecha && minutos > ahora.minutos);
  const enCurso = !porEmpezar && dia === ahora.fecha && aMinutos(fin) > ahora.minutos;
  const mostrar = Boolean(cancelar && (porEmpezar || enCurso) && bloque >= INICIO_DIA && bloque < FIN_DIA);
  enlace.hidden = !mostrar;
  nota.hidden = !mostrar;
  if (!mostrar) { enlace.removeAttribute('href'); return; }
  // La nota de index.html es la de una reserva por empezar; se guarda para volver a ella.
  if (!nota.dataset.porEmpezar) nota.dataset.porEmpezar = nota.textContent;
  nota.textContent = porEmpezar ? nota.dataset.porEmpezar : NOTA_EN_CURSO;
  const lugar = info && info.l ? info.l.trim() : '';
  const grupo = gruposJuntos().find((g) => g.includes(sala.nombre) && nombreJuntas(g) === lugar);
  enlace.href = cancelar.enlace(grupo ? nombreJuntas(grupo) : sala.nombre, dia, hhmm(bloque));
  enlace.target = '_blank';
  enlace.rel = 'noopener';
};

const abrirDetalle = (sala, dia, k) => {
  const datos = window.DISPONIBILIDAD;
  const franja = datos && datos.ocupado && datos.ocupado[sala.nombre] && (datos.ocupado[sala.nombre][dia] || [])[k];
  const dialogo = $('#detalle');
  if (!franja || !dialogo) return;
  const [a, b, info] = franja;
  const r = resumenReserva(info);
  $('#det-sala').textContent = sala.nombre;
  $('#det-titulo').textContent = r.motivo || r.titulo || 'Sala reservada';
  $('#det-hora').textContent = `${fechaLarga(dia)}, de ${a} a ${b}`;
  const filas = [];
  if (r.responsable) filas.push(['Responsable', r.responsable]);
  // El flujo pone como lugar la sala pedida: solo dice algo nuevo si son dos salas juntas.
  if (info && info.l && info.l.trim() !== sala.nombre) filas.push(['Lugar', info.l]);
  if (info && info.d) {
    // Cada línea "Etiqueta: valor" de la descripción va como fila; el resto, como texto.
    // La línea del responsable (o del solicitante, en reservas viejas) repite el asunto.
    const sueltas = [];
    for (const linea of info.d.split('\n')) {
      const m = /^([^:]{2,30}):\s*(.+)$/.exec(linea);
      if (!m) sueltas.push(linea);
      else if (!(r.responsable && /^(solicitante|responsable)$/i.test(m[1]))) filas.push([m[1], m[2]]);
    }
    if (sueltas.length) filas.push(['Nota', sueltas.join('\n')]);
  }
  $('#det-lista').innerHTML = filas.map(([k2, v]) => `<dt>${escapar(k2)}</dt><dd>${escapar(v)}</dd>`).join('');
  $('#det-nota').textContent = info ? '' : 'Los detalles de esta reserva no están publicados en el calendario de la sala.';
  pintarCancelar(sala, dia, a, b, info);
  if (typeof dialogo.showModal === 'function') dialogo.showModal();
  else dialogo.setAttribute('open', '');
  // El foco empieza en Cerrar, no en el enlace de cancelar.
  $('#det-cerrar').focus();
};

const iniciarDetalle = () => {
  const dialogo = $('#detalle');
  if (!dialogo) return;
  $('#det-cerrar').addEventListener('click', () => dialogo.close());
  // Clic fuera del cuadro (sobre el fondo oscuro) también lo cierra.
  dialogo.addEventListener('click', (ev) => { if (ev.target === dialogo) dialogo.close(); });
};

// Días con datos desde hoy: si no queda ninguno, los datos están vencidos y va el plan B.
const diasVigentes = (datos, hoy) => (datos && Array.isArray(datos.dias) ? datos.dias.filter((d) => d >= hoy.fecha) : []);

// Resume lo que puede cambiar el dibujo: el día, el bloque de media hora (ceil: las horas que
// se pueden pedir son las que empiezan en o después de ahora, así que el conjunto cambia al
// pasar cada :00 y :30), el aviso de datos viejos, la vista, el mes y la semana elegidos; o el
// plan B sin datos.
const claveDe = (hoy, datos) => {
  if (!diasVigentes(datos, hoy).length || !datos.ocupado) return `${hoy.fecha}|plan-b`;
  const sinLeerHoy = datos.verificado !== hoy.fecha && hoy.habil && hoy.minutos >= HORA_AVISO;
  return `${hoy.fecha}|${Math.ceil(hoy.minutos / BLOQUE)}|${sinLeerHoy}|${vista}|${mesElegido}|${semanaElegida}`;
};

// Selector que vuelve a encontrar el elemento enfocado después de repintar: cada botón y cada
// enlace del calendario se distingue por su id, sus datos o su dirección.
const selectorDe = (el) => {
  if (el.id) return `#${el.id}`;
  for (const k of ['semana', 'vista', 'mes', 'ir']) if (el.dataset[k]) return `button[data-${k}="${el.dataset[k]}"]`;
  if (el.matches('button.ag-oc')) return `button.ag-oc[data-sala="${CSS.escape(el.dataset.sala)}"][data-dia="${el.dataset.dia}"][data-k="${el.dataset.k}"]`;
  // Cada enlace "Pedir" lleva su propia fecha y hora (y su sala, si el formulario la rellena).
  if (el.getAttribute('href')) return `a[href="${CSS.escape(el.getAttribute('href'))}"]`;
  return el.matches('button.recargar') ? 'button.recargar' : null;
};

const ICONO_MES = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><rect x="2" y="3" width="12" height="11" rx="2"/><path d="M2 6.5h12M5.5 1.5v3M10.5 1.5v3"/></svg>';
const ICONO_ABRIR = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="m4 6 4 4 4-4"/></svg>';

// Pinta el calendario: la semana elegida, de lunes a viernes, con una columna por sala en cada
// día, o el mes completo, con una barra por sala en cada día. Arriba van el botón de meses y la
// tira con el mes completo y sus semanas. Guarda y devuelve el foco y los desplazamientos (la
// tira y, en el celular, el calendario), porque reemplazar el HTML los perdería.
const renderDisponibilidad = () => {
  const cont = $('#disponibilidad');
  const datos = window.DISPONIBILIDAD;
  const hoy = ahoraBogota();
  const errores = (datos && datos.errores) || {};
  const salas = salasActivas();
  const activo = document.activeElement && cont.contains(document.activeElement) ? document.activeElement : null;
  const recordado = activo ? selectorDe(activo) : null;
  const tira = cont.querySelector('.semanas');
  const desplTira = tira ? tira.scrollLeft : 0;
  const rejilla = cont.querySelector('.ag');
  const desplRejilla = rejilla ? rejilla.scrollLeft : 0;
  const mesAntes = mesPintado;

  // Devuelve los desplazamientos y el foco a donde estaban (o al botón elegido de la tira si el
  // elemento enfocado ya no existe). Con otro mes, la tira vuelve al principio. Tras cambiar de
  // semana o de mes, la tira muestra el botón elegido y la semana se desliza hasta hoy o hasta el
  // día tocado en el mes, que queda junto a la columna de las horas.
  const restaurar = () => {
    const tiraNueva = cont.querySelector('.semanas');
    const rejillaNueva = cont.querySelector('.ag');
    if (tiraNueva) {
      tiraNueva.scrollLeft = mesAntes === mesElegido ? desplTira : 0;
      const pulsado = tiraNueva.querySelector('[aria-pressed="true"]');
      if (irA && pulsado) {
        const t = tiraNueva.getBoundingClientRect();
        const b = pulsado.getBoundingClientRect();
        if (b.left < t.left) tiraNueva.scrollLeft -= t.left - b.left;
        else if (b.right > t.right) tiraNueva.scrollLeft += b.right - t.right;
      }
    }
    if (rejillaNueva) {
      const dia = irA ? rejillaNueva.querySelector(irA === 'hoy' ? '.ag-dia.hoy' : `.ag-dia[data-dia="${irA}"]`) : null;
      const eje = rejillaNueva.querySelector('.ag-eje');
      rejillaNueva.scrollLeft = !irA ? desplRejilla : dia && eje ? dia.offsetLeft - eje.offsetWidth : 0;
    }
    // En el plan B no hay calendario: el salto queda pendiente para cuando lleguen los datos.
    if (tiraNueva) { irA = null; mesPintado = mesElegido; }
    if (!recordado) return;
    const destino = cont.querySelector(recordado) || cont.querySelector('.semanas [aria-pressed="true"]') || cont.querySelector('#btn-meses');
    if (destino) destino.focus({ preventScroll: true });
  };

  // Plan B: sin datos vigentes (la tarea no ha corrido, lleva días sin correr o el archivo
  // no cargó), se ofrecen los calendarios de Outlook.
  if (!diasVigentes(datos, hoy).length || !datos.ocupado) {
    cont.innerHTML = `<p class="disp-nota aviso">La disponibilidad no está disponible en este momento. Puede revisarla en Outlook: ${enlacesOutlook()}. <button class="recargar" type="button">Recargar</button></p>`;
    claveRender = claveDe(hoy, datos);
    restaurar();
    return;
  }
  // Días con datos: los hábiles y, aparte, los festivos. Van del lunes de esta semana (también
  // los días que ya pasaron) al fin del segundo mes siguiente.
  const esFecha = (d) => /^\d{4}-\d{2}-\d{2}$/.test(d);
  const habiles = datos.dias.filter(esFecha);
  const festivos = Array.isArray(datos.festivos) ? datos.festivos.filter(esFecha) : [];
  const conDatos = [...habiles, ...festivos].sort();
  // La lista de meses: los que tienen días de hoy en adelante.
  const meses = [...new Set(conDatos.filter((d) => d >= hoy.fecha).map((d) => d.slice(0, 7)))];
  if (!meses.includes(mesElegido)) { mesElegido = meses[0]; vista = 'semana'; semanaElegida = null; irA = 'hoy'; }
  // Semanas del mes con datos y con algún día de hoy en adelante. Si esta semana es la última del
  // mes, va también la próxima, para que siga a un clic.
  const lunesConDatos = new Set(conDatos.map(lunesDe));
  const vigente = (l) => lunesConDatos.has(l) && sumarDias(l, 4) >= hoy.fecha;
  const semanas = semanasDelMes(mesElegido).filter(vigente);
  const proxima = sumarDias(lunesDe(hoy.fecha), 7);
  if (semanas.includes(lunesDe(hoy.fecha)) && !semanas.includes(proxima) && vigente(proxima)) semanas.push(proxima);
  if (!semanas.includes(semanaElegida)) { semanaElegida = semanas[0]; if (vista === 'semana') irA = 'hoy'; }
  claveRender = claveDe(hoy, datos);
  const sinLeerHoy = datos.verificado !== hoy.fecha && hoy.habil && hoy.minutos >= HORA_AVISO;
  const diasSemana = [0, 1, 2, 3, 4].map((i) => sumarDias(semanaElegida, i));
  const leidas = salas.filter((s) => esUrl(s.calendario) && datos.ocupado[s.nombre]);
  const libreEn = (franjas, m) => !franjas.some((f) => f.ini < m + BLOQUE && f.fin > m);
  // Reservas de una sala leída en un día, dentro de la franja del calendario (k es su índice en el día).
  const franjasDe = (s, dia) => (datos.ocupado[s.nombre][dia] || [])
    .map(([a, b, info], k) => ({ ini: aMinutos(a), fin: aMinutos(b), info: info || null, k }))
    .filter((f) => f.fin > INICIO_DIA && f.ini < FIN_DIA);

  // Botón de meses con su lista y, al lado, la tira con el mes completo y sus semanas. En las
  // semanas se ve el rango corto; el largo es el que oyen los lectores de pantalla.
  const opcionesMes = meses.map((m) => `<li><button class="mes-op" type="button" data-mes="${m}"${m === mesElegido ? ' aria-current="true"' : ''}>${nombreMes(m)}${m === hoy.fecha.slice(0, 7) ? '<small><span class="sr">, </span>Este mes</small>' : ''}</button></li>`).join('');
  const selectorMes = `<div class="mes-sel">
      <button class="mes-btn" id="btn-meses" type="button" aria-expanded="${listaMesesAbierta}" aria-controls="lista-meses">${ICONO_MES}<span>${nombreMes(mesElegido)}</span><span class="sr">, elegir otro mes</span>${ICONO_ABRIR}</button>
      <div class="mes-pop" id="lista-meses"${listaMesesAbierta ? '' : ' hidden'}><ul class="mes-lista">${opcionesMes}</ul><p class="mes-nota">Hay datos hasta el ${fechaLarga(conDatos[conDatos.length - 1])}.</p></div>
    </div>`;
  const chips = `<button class="semana" type="button" data-vista="mes" aria-pressed="${vista === 'mes'}">Todo el mes<span class="sr">, ${mesLargo(mesElegido)}</span></button>${semanas.map((l) => {
    const nombre = nombreSemana(l, hoy.fecha);
    const visible = `${nombre ? `${nombre}<span aria-hidden="true"> · </span>` : ''}<span aria-hidden="true">${rangoCorto(l)}</span>`;
    return `<button class="semana" type="button" data-semana="${l}" aria-pressed="${vista === 'semana' && l === semanaElegida}">${visible}<span class="sr">${nombre ? ', ' : 'Semana '}${rangoLargo(l)}</span></button>`;
  }).join('')}`;

  const salasLeyenda = salas.map((s) => {
    const estado = !esUrl(s.calendario) ? ': calendario pendiente' : !datos.ocupado[s.nombre] ? ': sin datos' : '';
    return `<li style="--c:${s.color}"><i aria-hidden="true">${escapar(codigoSala(s))}</i>${escapar(s.nombre)}${Number(s.aforo) > 0 ? `, ${s.aforo} personas` : ''}${estado}</li>`;
  }).join('');

  const horas = [];
  for (let m = INICIO_DIA; m <= FIN_DIA; m += 60) horas.push(`<span style="top:${pct(m)}%">${hhmm(m)}</span>`);

  const cabecera = diasSemana.map((dia) => {
    const f = fechaLocal(dia);
    const esHoy = dia === hoy.fecha;
    const pie = festivos.includes(dia) ? '<small>Festivo</small>'
      : !habiles.includes(dia) ? `<small>${dia < hoy.fecha ? '' : 'Sin datos'}</small>`
        : `<span class="ag-cods">${salas.map((s) => `<i style="--c:${s.color}">${escapar(codigoSala(s))}</i>`).join('')}</span>`;
    return `<span class="ag-dcab${esHoy ? ' hoy' : ''}${dia < hoy.fecha ? ' pasado' : ''}"><b>${DIAS_CORTOS[f.getDay()]} ${f.getDate()}${esHoy ? '<em>Hoy</em>' : ''}</b>${pie}</span>`;
  }).join('');

  // Franja ocupada: un botón que abre el detalle de la reserva (data-k es su índice en el día).
  const bloque = (s, dia, f) => {
    const desde = Math.max(f.ini, INICIO_DIA);
    const hasta = Math.min(f.fin, FIN_DIA);
    const r = resumenReserva(f.info);
    const etiqueta = `${s.nombre}, ${fechaLarga(dia)}, de ${hhmm(desde)} a ${hhmm(hasta)}${r.titulo ? `: ${r.titulo}` : ''}. Ver detalle.`;
    const titulo = r.titulo ? `<span class="ag-oc-t" aria-hidden="true">${escapar(r.titulo)}</span>` : '';
    return `<button type="button" class="ag-oc${hasta - desde < 60 ? ' corta' : ''}" style="top:${pct(desde)}%;height:${pct(hasta) - pct(desde)}%" data-sala="${escapar(s.nombre)}" data-dia="${dia}" data-k="${f.k}" aria-label="${escapar(etiqueta)}" title="${escapar(etiqueta)}"><span class="ag-oc-h" aria-hidden="true">${hhmm(desde)}</span><span class="ag-oc-f" aria-hidden="true">–${hhmm(hasta)}</span>${titulo}</button>`;
  };
  const pedirEn = (m) => `top:${pct(m)}%;height:${pct(m + BLOQUE) - pct(m)}%`;
  // Lo que queda fuera del horario de reservas va rayado, debajo de las reservas.
  const fueraHorario = `${INICIO_RESERVAS > INICIO_DIA ? `<div class="ag-fuera" style="top:0;height:${pct(INICIO_RESERVAS)}%"></div>` : ''}${FIN_RESERVAS < FIN_DIA ? `<div class="ag-fuera" style="top:${pct(FIN_RESERVAS)}%;bottom:0"></div>` : ''}`;

  const columna = (dia) => {
    const esHoy = dia === hoy.fecha;
    const pasado = dia < hoy.fecha;
    const clases = `ag-dia${esHoy ? ' hoy' : ''}${pasado ? ' pasado' : ''}`;
    const nombre = `${fechaLarga(dia)}${esHoy ? ' (hoy)' : ''}`;
    const capaPasado = (alto) => `<div class="ag-pasado" style="height:${alto}%"></div>`;
    if (festivos.includes(dia)) return `<div class="${clases} festivo" data-dia="${dia}" role="group" aria-label="${escapar(nombre)}"><span class="sr">Festivo.</span></div>`;
    // Día que no está en los datos: uno pasado que la tarea ya no leyó, o uno futuro sin leer.
    if (!habiles.includes(dia)) return `<div class="${clases} sin-dia" data-dia="${dia}" role="group" aria-label="${escapar(nombre)}"><span class="sr">Sin datos.</span>${pasado ? capaPasado(100) : ''}</div>`;

    const porSala = new Map(leidas.map((s) => [s, franjasDe(s, dia)]));
    // Medias horas que todavía se pueden pedir, dentro del horario: las de hoy desde ahora y las de
    // los días que vienen.
    const pedibles = [];
    if (prefill && !pasado) for (let m = INICIO_RESERVAS; m + BLOQUE <= FIN_RESERVAS; m += BLOQUE) if (!esHoy || m >= hoy.minutos) pedibles.push(m);

    const carriles = salas.map((s) => {
      const franjas = porSala.get(s);
      if (!franjas) return `<div class="ag-carril sin" style="--c:${s.color}"></div>`;
      // Si el formulario rellena la sala, cada sala tiene sus propias horas para pedir.
      const pedir = prefill && prefill.conSala ? pedibles.filter((m) => libreEn(franjas, m)).map((m) => `<a class="ag-pedir" href="${escapar(prefill.enlace(s.nombre, dia, hhmm(m)))}" target="_blank" rel="noopener" data-sala="${escapar(s.nombre)}" style="${pedirEn(m)}" aria-label="${escapar(`Pedir la ${s.nombre} el ${fechaLarga(dia)} a las ${hhmm(m)}`)}"><span aria-hidden="true">${hhmm(m)}</span></a>`).join('') : '';
      return `<div class="ag-carril" style="--c:${s.color}">${franjas.map((f) => bloque(s, dia, f)).join('')}${pedir}</div>`;
    }).join('');

    // Si no, cada media hora con alguna sala libre se pide para el día entero: el formulario
    // pregunta la sala al final.
    const pedirDia = prefill && !prefill.conSala ? pedibles.map((m) => {
      const libres = leidas.filter((s) => libreEn(porSala.get(s), m));
      if (!libres.length) return '';
      const etiqueta = `Pedir el ${fechaLarga(dia)} a las ${hhmm(m)} (${libres.length === 1 ? 'libre' : 'libres'}: ${enumerar(libres.map((s) => s.nombre))})`;
      return `<a class="ag-pedir" href="${escapar(prefill.enlace(null, dia, hhmm(m)))}" target="_blank" rel="noopener" style="${pedirEn(m)}" aria-label="${escapar(etiqueta)}"><span aria-hidden="true">Pedir ${hhmm(m)}</span></a>`;
    }).join('') : '';

    // Resumen para lectores de pantalla.
    const partes = [];
    if (pasado) partes.push('Día pasado.');
    leidas.filter((s) => porSala.get(s).length).forEach((s) => { const n = porSala.get(s).length; partes.push(`${s.nombre}: ${n} ${n === 1 ? 'reserva' : 'reservas'}.`); });
    const libresTodo = leidas.filter((s) => !porSala.get(s).length);
    if (libresTodo.length) partes.push(libresTodo.length === salas.length ? 'Todas las salas, libres todo el día.' : `Libres todo el día: ${enumerar(libresTodo.map((s) => s.nombre))}.`);
    const sinLeer = salas.filter((s) => !porSala.has(s));
    if (sinLeer.length) partes.push(`Sin datos: ${enumerar(sinLeer.map((s) => s.nombre))}.`);

    const capas = pasado ? capaPasado(100)
      : esHoy ? `${capaPasado(pct(hoy.minutos))}${hoy.minutos >= INICIO_DIA && hoy.minutos <= FIN_DIA ? `<div class="ag-ahora" style="top:${pct(hoy.minutos)}%"></div>` : ''}` : '';
    return `<div class="${clases}" data-dia="${dia}" role="group" aria-label="${escapar(nombre)}"><span class="sr">${escapar(partes.join(' '))}</span>${fueraHorario}<div class="ag-carriles">${carriles}</div>${pedirDia}${capas}</div>`;
  };

  // Un día del mes: una barra por sala de la franja del calendario (07:00 a 18:00) con lo
  // reservado en su color. Si tiene datos es un botón que abre su semana, y su nombre accesible
  // dice las horas ocupadas de cada sala. oculta: no tiene nada que leer (un día pasado sin datos
  // o de otro mes).
  const celdaMes = (dia) => {
    const esHoy = dia === hoy.fecha;
    const pasado = dia < hoy.fecha;
    const num = `<span class="mes-num">${fechaLocal(dia).getDate()}${esHoy ? '<em>Hoy</em>' : ''}</span>`;
    // Días de los meses vecinos en la primera y la última semana: solo el número.
    if (dia.slice(0, 7) !== mesElegido) return { oculta: true, html: `<div class="mes-dia otro" aria-hidden="true">${num}</div>` };
    const clases = `mes-dia${esHoy ? ' hoy' : ''}${pasado ? ' pasado' : ''}`;
    const nombre = `${fechaLarga(dia)}${esHoy ? ' (hoy)' : ''}`;
    if (festivos.includes(dia)) return { html: `<div class="${clases} festivo"><span aria-hidden="true">${num}<small>Festivo</small></span><span class="sr">${escapar(nombre)}: festivo.</span></div>` };
    if (!habiles.includes(dia) || !vigente(lunesDe(dia))) {
      // Los días de antes de esta semana no se leen: quedan en blanco.
      if (pasado) return { oculta: true, html: `<div class="${clases} sin-dia" aria-hidden="true">${num}</div>` };
      return { html: `<div class="${clases} sin-dia"><span aria-hidden="true">${num}<small>Sin datos</small></span><span class="sr">${escapar(nombre)}: sin datos.</span></div>` };
    }
    const partes = [];
    const libres = [];
    const barras = salas.map((s) => {
      const codigo = `<b>${escapar(codigoSala(s))}</b>`;
      if (!leidas.includes(s)) return `<span class="mes-fila sin" style="--c:${s.color}">${codigo}<span class="mes-barra"></span></span>`;
      const franjas = franjasDe(s, dia);
      if (franjas.length) partes.push(`${s.nombre}, ocupada ${enumerar(franjas.map((f) => `de ${hhmm(Math.max(f.ini, INICIO_DIA))} a ${hhmm(Math.min(f.fin, FIN_DIA))}`))}.`);
      else libres.push(s.nombre);
      return `<span class="mes-fila" style="--c:${s.color}">${codigo}<span class="mes-barra">${franjas.map((f) => `<i style="left:${pct(f.ini)}%;width:${pct(f.fin) - pct(f.ini)}%"></i>`).join('')}</span></span>`;
    }).join('');
    if (libres.length) partes.push(libres.length === salas.length ? 'Todas las salas, libres todo el día.' : `Libres todo el día: ${enumerar(libres)}.`);
    const sinLeer = salas.filter((s) => !leidas.includes(s));
    if (sinLeer.length) partes.push(`Sin datos: ${enumerar(sinLeer.map((s) => s.nombre))}.`);
    const etiqueta = `${nombre}. ${partes.join(' ')} Ver la semana.`;
    return { html: `<button class="${clases}" type="button" data-ir="${dia}" aria-label="${escapar(etiqueta)}" title="${escapar(etiqueta)}">${num}<span class="mes-barras" aria-hidden="true">${barras}</span></button>` };
  };
  const rejillaMes = () => {
    const filas = semanasDelMes(mesElegido).map((l) => {
      const celdas = [0, 1, 2, 3, 4].map((i) => celdaMes(sumarDias(l, i)));
      // Una semana sin nada que leer (días pasados o de otro mes) la saltan los lectores de pantalla.
      const atributos = celdas.every((c) => c.oculta) ? 'aria-hidden="true"' : `role="group" aria-label="${escapar(`Semana ${rangoLargo(l)}`)}"`;
      return `<div class="mes-sem" ${atributos}>${celdas.map((c) => c.html).join('')}</div>`;
    }).join('');
    return `<div class="mes" role="group" aria-label="${escapar(`Disponibilidad de ${mesLargo(mesElegido)}`)}">
      <div class="mes-cab" aria-hidden="true">${[1, 2, 3, 4, 5].map((d) => `<span>${DIAS_CORTOS[d]}</span>`).join('')}</div>${filas}
    </div>`;
  };

  // Estado de los datos: cuándo se leyeron los calendarios y si alguno falló.
  const notas = [];
  const nombrar = (lista) => enumerar(lista.map((s) => `la ${s.nombre}`));
  const sinDatos = salas.filter((s) => esUrl(s.calendario) && !datos.ocupado[s.nombre]);
  const conError = salas.filter((s) => s.nombre in errores && datos.ocupado[s.nombre]);
  if (sinLeerHoy) {
    const inicio = datos.verificado
      ? `Los datos son del ${fechaLarga(datos.verificado)} y pueden estar desactualizados.`
      : 'Los calendarios todavía no se han podido leer.';
    notas.push(`<p class="disp-nota aviso">${inicio} Si el aviso sigue después de recargar, los calendarios no se han podido leer hoy; antes de pedir, revise el calendario en Outlook: ${enlacesOutlook()}. <button class="recargar" type="button">Recargar</button></p>`);
  } else {
    if (sinDatos.length) notas.push(`<p class="disp-nota aviso">No se pudo leer el calendario de ${escapar(nombrar(sinDatos))}. Revíselo en Outlook antes de pedir.</p>`);
    if (conError.length) notas.push(`<p class="disp-nota aviso">En la última lectura no se pudo leer el calendario de ${escapar(nombrar(conError))}; se muestran los datos de la lectura anterior de hoy. Revíselo en Outlook antes de pedir.</p>`);
  }
  // El botón Recargar siempre está a la vista: en el aviso de datos viejos si lo hay y, si no,
  // al final de la línea de la última novedad.
  let novedad = '';
  if (datos.actualizado) {
    const act = new Date(datos.actualizado);
    if (!Number.isNaN(act.getTime())) {
      const { fecha: diaAct, minutos: minAct } = enBogota(act);
      const cuando = diaAct === hoy.fecha ? `hoy a las ${hhmm(minAct)}` : `el ${fechaLarga(diaAct)} a las ${hhmm(minAct)}`;
      novedad = `Última novedad ${cuando}. Una reserva nueva puede tardar hasta 30 minutos en aparecer; al pedir la sala, el sistema revisa de nuevo que esté libre.`;
    }
  }
  const botonRecargar = sinLeerHoy ? '' : ' <button class="recargar" type="button">Recargar</button>';
  if (novedad || botonRecargar) notas.push(`<p class="disp-nota">${novedad}${novedad ? botonRecargar : botonRecargar.trim()}</p>`);

  const comoPedir = !prefill ? 'Lo que está en blanco está libre.'
    : prefill.conSala ? 'Toque una hora libre en la columna de una sala para pedirla con la sala, la fecha y la hora ya puestas.'
      : 'Toque una hora libre para pedirla con la fecha y la hora ya puestas; la sala se elige al final del formulario, según cuántas personas asisten.';
  const rayado = INICIO_RESERVAS > INICIO_DIA || FIN_RESERVAS < FIN_DIA ? ` Se reserva de ${horario.inicio} a ${horario.fin}; lo rayado queda fuera de ese horario.` : '';
  const leyenda = vista === 'mes'
    ? `Cada día tiene una barra por sala, de ${hhmm(INICIO_DIA)} a ${hhmm(FIN_DIA)}; lo de color ya está reservado. Toque un día para ver su semana con el detalle de las reservas${prefill ? ' y pedir una hora libre' : ''}.`
    : `Cada día tiene una columna por sala. Las franjas de color son horas ya reservadas; tóquelas para ver el detalle.${rayado} ${comoPedir}<span class="movil"> Deslice el calendario de lado para ver toda la semana.</span>`;

  const calendario = vista === 'mes' ? rejillaMes()
    : `<div class="ag" style="--n:${Math.max(salas.length, 1)};--horas:${(FIN_DIA - INICIO_DIA) / 60}" role="group" aria-label="${escapar(`Disponibilidad de la semana ${rangoLargo(semanaElegida)}`)}">
      <div class="ag-in">
        <div class="ag-cab" aria-hidden="true"><span></span>${cabecera}</div>
        <div class="ag-cuerpo"><div class="ag-eje" aria-hidden="true">${horas.join('')}</div>${diasSemana.map(columna).join('')}</div>
      </div>
    </div>`;

  cont.innerHTML = `<p class="disp-ley">${leyenda}</p>
    <div class="vista-ctl">${selectorMes}<div class="semanas" role="group" aria-label="Mes completo o semana">${chips}</div></div>
    <ul class="ag-salas">${salasLeyenda}</ul>
    <a class="saltar" href="#como-funciona">Saltar el calendario</a>
    ${calendario}
    ${notas.join('')}
    <p class="disp-outlook">Calendarios en Outlook: ${enlacesOutlook()}</p>`;

  restaurar();
};

// Cada minuto solo se mueven la línea de "ahora" y el sombreado de lo que ya pasó; el calendario
// completo se repinta cuando cambia algo visible (el día, el bloque de media hora o el aviso),
// para no perder el foco.
const refrescar = () => {
  const hoy = ahoraBogota();
  if (claveDe(hoy, window.DISPONIBILIDAD) !== claveRender) { renderDisponibilidad(); return; }
  const col = $('#disponibilidad .ag-dia.hoy');
  if (!col) return;
  const linea = col.querySelector('.ag-ahora');
  if (linea) linea.style.top = `${pct(hoy.minutos)}%`;
  const pasado = col.querySelector('.ag-pasado');
  if (pasado) pasado.style.height = `${pct(hoy.minutos)}%`;
};

// --- Recarga de los datos ---
// disponibilidad.js se lee una vez al abrir la página. Una pestaña que queda abierta todo el
// día (o desde ayer) seguiría mostrando esos datos, así que se vuelve a pedir cada 5 minutos y
// al volver a la pestaña. El parámetro ?v= cambia cada minuto para no recibir la copia que el
// navegador guardó; si la descarga falla, se conservan los datos que ya había.
const RECARGA_MS = 5 * 60000;
let recargando = false;
let ultimaRecarga = Date.now();
const recargarDatos = () => {
  if (recargando) return;
  recargando = true;
  ultimaRecarga = Date.now();
  const antes = JSON.stringify(window.DISPONIBILIDAD || null);
  const script = document.createElement('script');
  script.src = `disponibilidad.js?v=${Math.floor(Date.now() / 60000)}`;
  const terminar = () => { recargando = false; script.remove(); };
  script.onload = () => {
    terminar();
    if (JSON.stringify(window.DISPONIBILIDAD || null) !== antes) {
      renderDisponibilidad();
      if (indicadoresVisibles()) renderIndicadores();
    }
  };
  script.onerror = terminar;
  document.head.appendChild(script);
};
// Al volver a la pestaña (o al restaurarla el navegador), recargar si pasó más de un minuto.
const recargarSiHaceRato = () => { if (Date.now() - ultimaRecarga > 60000) recargarDatos(); };

// Botón "Recargar" de los avisos. Antes de recargar se vuelven a pedir los archivos de la página
// con cache: 'reload', que se salta la copia guardada del navegador y le pide a cualquier proxy de
// la red que tampoco use la suya; así la recarga no vuelve a mostrar una página o unos datos viejos.
// Abierta como archivo (file://) no hay caché que saltar y se recarga directo.
const ARCHIVOS_PAGINA = ['./', 'styles.css', 'config.js', 'disponibilidad.js', 'app.js'];
const recargarPagina = (boton) => {
  boton.disabled = true;
  boton.textContent = 'Recargando…';
  const recargar = () => window.location.reload();
  if (typeof window.fetch !== 'function' || !/^https?:$/.test(window.location.protocol)) { recargar(); return; }
  // Si la red no responde, se recarga igual a los 5 segundos.
  setTimeout(recargar, 5000);
  Promise.all(ARCHIVOS_PAGINA.map((u) => window.fetch(u, { cache: 'reload' }).catch(() => null))).then(recargar);
};

// Abre o cierra la lista de meses sin repintar el calendario.
const pintarListaMeses = (enfocarBoton) => {
  const boton = $('#btn-meses');
  const lista = $('#lista-meses');
  if (!boton || !lista) return;
  boton.setAttribute('aria-expanded', String(listaMesesAbierta));
  lista.hidden = !listaMesesAbierta;
  if (enfocarBoton) boton.focus();
};
const cerrarListaMeses = (enfocarBoton) => { listaMesesAbierta = false; pintarListaMeses(enfocarBoton); };

const iniciarDisponibilidad = () => {
  prefill = plantillaPrefill(typeof FORM_PREFILL === 'undefined' ? null : FORM_PREFILL, 'FORM_PREFILL', 'El calendario no ofrece pedir desde una hora.');
  cancelar = plantillaPrefill(typeof CANCELAR_PREFILL === 'undefined' ? null : CANCELAR_PREFILL, 'CANCELAR_PREFILL', 'El detalle de una reserva no ofrece cancelarla.');
  renderDisponibilidad();
  iniciarDetalle();
  const cont = $('#disponibilidad');
  // Repinta con la vista nueva y pone el foco en el botón que la eligió (el tocado ya no existe).
  const mostrar = (selector) => {
    renderDisponibilidad();
    const elegido = cont.querySelector(selector);
    if (elegido) elegido.focus();
  };
  cont.addEventListener('click', (ev) => {
    const boton = ev.target.closest('button.recargar');
    if (boton) { recargarPagina(boton); return; }
    const franja = ev.target.closest('button.ag-oc');
    if (franja) {
      const sala = SALAS.find((s) => s.nombre === franja.dataset.sala);
      if (sala) abrirDetalle(sala, franja.dataset.dia, Number(franja.dataset.k));
      return;
    }
    if (ev.target.closest('#btn-meses')) { listaMesesAbierta = !listaMesesAbierta; pintarListaMeses(false); return; }
    // El mes elegido en la lista se ve completo.
    const opcion = ev.target.closest('button[data-mes]');
    if (opcion) {
      mesElegido = opcion.dataset.mes;
      vista = 'mes';
      listaMesesAbierta = false;
      irA = 'hoy';
      mostrar('#btn-meses');
      return;
    }
    // Un día del mes abre su semana, deslizada hasta ese día en el celular.
    const dia = ev.target.closest('button[data-ir]');
    if (dia) {
      vista = 'semana';
      semanaElegida = lunesDe(dia.dataset.ir);
      irA = dia.dataset.ir;
      mostrar(`button[data-semana="${semanaElegida}"]`);
      return;
    }
    const chip = ev.target.closest('button[data-semana], button[data-vista]');
    if (!chip) return;
    if (chip.dataset.vista) vista = 'mes';
    else { vista = 'semana'; semanaElegida = chip.dataset.semana; }
    irA = 'hoy';
    mostrar(chip.dataset.vista ? 'button[data-vista="mes"]' : `button[data-semana="${semanaElegida}"]`);
  });
  // Lista de meses con el teclado: las flechas la abren y recorren los meses; Escape la cierra y
  // devuelve el foco al botón. Salir de ella con Tab o hacer clic afuera también la cierra.
  cont.addEventListener('keydown', (ev) => {
    if ((ev.key !== 'ArrowDown' && ev.key !== 'ArrowUp') || !ev.target.closest('.mes-sel')) return;
    const opciones = [...cont.querySelectorAll('#lista-meses button[data-mes]')];
    if (!opciones.length) return;
    ev.preventDefault();
    if (!listaMesesAbierta) { listaMesesAbierta = true; pintarListaMeses(false); }
    const i = opciones.indexOf(ev.target);
    const paso = ev.key === 'ArrowDown' ? 1 : opciones.length - 1;
    opciones[i < 0 ? Math.max(0, opciones.findIndex((b) => b.hasAttribute('aria-current'))) : (i + paso) % opciones.length].focus();
  });
  cont.addEventListener('focusout', (ev) => {
    const hacia = ev.relatedTarget;
    if (listaMesesAbierta && hacia instanceof Element && ev.target.closest('.mes-sel') && !hacia.closest('.mes-sel')) cerrarListaMeses(false);
  });
  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape' && listaMesesAbierta) cerrarListaMeses(Boolean(document.activeElement && document.activeElement.closest('.mes-sel')));
  });
  // pointerdown y no click: en el iPhone, tocar un texto que no es botón ni enlace no produce clic.
  document.addEventListener('pointerdown', (ev) => {
    if (listaMesesAbierta && !(ev.target instanceof Element && ev.target.closest('.mes-sel'))) cerrarListaMeses(false);
  });
  setInterval(refrescar, 60000);
  setInterval(recargarDatos, RECARGA_MS);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') recargarSiHaceRato(); });
  window.addEventListener('pageshow', (ev) => { if (ev.persisted) recargarSiHaceRato(); });
  window.addEventListener('online', recargarDatos);
};

/* ===== 2b. Indicadores de uso ===== */

// La pestaña "Indicadores" resume cuánto se usa cada sala en un mes. Las horas de los días que ya
// pasaron salen del historial (uso.js, que se carga al abrir la pestaña); las de hoy en adelante,
// de los datos del calendario (disponibilidad.js). Horas y ocupación se cuentan dentro del
// horario de reservas (07:30 a 17:30), también en los meses de antes de ese horario, y la
// ocupación es sobre los días hábiles (lunes a viernes sin festivos) del mes.
let uso = null; // window.USO, ya cargado
let estadoUso = 'sin-cargar'; // 'sin-cargar', 'cargando', 'ok' o 'error'
let mesIndicadores = null;
const HORAS_HABILES = (FIN_RESERVAS - INICIO_RESERVAS) / 60;
const DIAS_SEMANA = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie'];
const fechaConAno = (iso) => fechaLocal(iso).toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' });
const horasTexto = (h) => `${h.toLocaleString('es-CO', { maximumFractionDigits: 1 })} h`;
const pctTexto = (p) => `${Math.round(p * 100)} %`;
const mesDe = (iso) => iso.slice(0, 7);
const sumarMeses = (mes, n) => { const [a, m] = mes.split('-').map(Number); const f = new Date(a, m - 1 + n, 1); return `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, '0')}`; };

// Mismo criterio que el script: "Reserva · Nombre" viene de la planilla y "Motivo · Responsable"
// del formulario; lo demás no se sabe.
const origenDe = (info) => (!info || !info.t ? 'o' : /^Reserva · /.test(info.t) ? 'p' : / · /.test(info.t) ? 'f' : 'o');
// Franjas [inicio, fin, origen] (minutos del día) de una sala en un día: del historial si el día
// ya pasó y de los datos del calendario si es hoy o después.
const franjasDeDia = (datos, sala, dia, hoyIso) => {
  if (dia < hoyIso) { const d = uso && uso.dias && uso.dias[dia]; return d && Array.isArray(d[sala]) ? d[sala] : []; }
  const oc = datos && datos.ocupado && datos.ocupado[sala];
  return oc && Array.isArray(oc[dia]) ? oc[dia].map(([a, b, info]) => [aMinutos(a), aMinutos(b), origenDe(info)]) : [];
};
const horasDe = (franjas) => franjas.reduce((t, [a, b]) => t + Math.max(0, Math.min(b, FIN_RESERVAS) - Math.max(a, INICIO_RESERVAS)), 0) / 60;

// Meses que se pueden elegir: del primero con historial (o el actual) al último con datos del calendario.
const mesesIndicadores = (datos, hoyIso) => {
  const primero = uso && uso.desde && uso.desde < hoyIso ? mesDe(uso.desde) : mesDe(hoyIso);
  const ultimoDia = datos && Array.isArray(datos.dias) && datos.dias.length ? datos.dias[datos.dias.length - 1] : hoyIso;
  const ultimo = mesDe(ultimoDia > hoyIso ? ultimoDia : hoyIso);
  const meses = [];
  for (let m = primero; m <= ultimo && meses.length < 36; m = sumarMeses(m, 1)) meses.push(m);
  return meses;
};

const calcularIndicadores = (datos, mes, hoyIso) => {
  const salas = salasActivas();
  const [a, m] = mes.split('-').map(Number);
  const ultimoDia = new Date(a, m, 0).getDate();
  const festivos = new Set([...((uso && uso.festivos) || []), ...((datos && datos.festivos) || [])]);
  // Un mes anterior al historial cuenta solo desde el primer día con datos.
  const desde = uso && uso.desde ? uso.desde : hoyIso;
  const porSala = salas.map((s) => ({ sala: s, usadas: 0, programadas: 0, reservas: 0, formulario: 0, dias: 0 }));
  const porDiaSemana = [0, 0, 0, 0, 0];
  const bloques = (FIN_RESERVAS - INICIO_RESERVAS) / BLOQUE;
  const porBloque = new Array(bloques).fill(0);
  let habiles = 0;
  let sinDatos = 0; // días hábiles del mes anteriores al historial
  let diasConReserva = 0;
  for (let d = 1; d <= ultimoDia; d += 1) {
    const dia = `${mes}-${String(d).padStart(2, '0')}`;
    const ds = fechaLocal(dia).getDay();
    const habil = ds >= 1 && ds <= 5 && !festivos.has(dia);
    if (dia < desde && dia < hoyIso) { if (habil) sinDatos += 1; continue; }
    if (habil) habiles += 1;
    let conReserva = false;
    porSala.forEach((r) => {
      const fr = franjasDeDia(datos, r.sala.nombre, dia, hoyIso);
      if (!fr.length) return;
      conReserva = true;
      const h = horasDe(fr);
      if (dia < hoyIso) r.usadas += h; else r.programadas += h;
      r.reservas += fr.length;
      r.formulario += fr.filter((x) => x[2] === 'f').length;
      r.dias += 1;
      if (!habil) return;
      porDiaSemana[ds - 1] += h;
      for (let k = 0; k < bloques; k += 1) {
        const m0 = INICIO_RESERVAS + k * BLOQUE;
        if (fr.some(([x, y]) => x < m0 + BLOQUE && y > m0)) porBloque[k] += 1;
      }
    });
    if (conReserva) diasConReserva += 1;
  }
  const disponiblesSala = habiles * HORAS_HABILES;
  porSala.forEach((r) => { r.horas = r.usadas + r.programadas; r.ocupacion = disponiblesSala ? r.horas / disponiblesSala : 0; });
  const total = porSala.reduce((t, r) => ({ usadas: t.usadas + r.usadas, programadas: t.programadas + r.programadas, reservas: t.reservas + r.reservas, formulario: t.formulario + r.formulario }), { usadas: 0, programadas: 0, reservas: 0, formulario: 0 });
  total.horas = total.usadas + total.programadas;
  total.disponibles = disponiblesSala * salas.length;
  total.ocupacion = total.disponibles ? total.horas / total.disponibles : 0;
  total.dias = diasConReserva;
  const masUsada = porSala.reduce((mejor, r) => (r.horas > (mejor ? mejor.horas : 0) ? r : mejor), null);
  return { mes, salas, porSala, total, masUsada, habiles, sinDatos, porDiaSemana, porBloque: porBloque.map((n) => (habiles && salas.length ? n / (habiles * salas.length) : 0)) };
};

const renderIndicadores = () => {
  const cont = $('#indicadores');
  if (!cont) return;
  if (estadoUso === 'sin-cargar' || estadoUso === 'cargando') { cont.innerHTML = '<p class="disp-nota">Cargando el historial de uso…</p>'; return; }
  const datos = window.DISPONIBILIDAD;
  const hoy = ahoraBogota();
  const meses = mesesIndicadores(datos, hoy.fecha);
  if (!meses.includes(mesIndicadores)) mesIndicadores = meses.includes(mesDe(hoy.fecha)) ? mesDe(hoy.fecha) : meses[meses.length - 1];
  const r = calcularIndicadores(datos, mesIndicadores, hoy.fecha);
  const opciones = meses.map((m) => `<option value="${m}"${m === mesIndicadores ? ' selected' : ''}>${nombreMes(m)}${m === mesDe(hoy.fecha) ? ' (actual)' : ''}</option>`).join('');
  const notas = [];
  if (estadoUso === 'error') notas.push('<p class="disp-nota aviso">No se pudo cargar el historial de uso: se muestra solo lo programado de hoy en adelante. <button class="recargar" type="button" data-reintentar>Reintentar</button></p>');
  else if (r.sinDatos) notas.push(`<p class="disp-nota">Este mes solo tiene datos desde el ${fechaConAno(uso.desde)}.</p>`);
  if (mesIndicadores >= mesDe(hoy.fecha)) notas.push('<p class="disp-nota">Incluye lo programado hasta ahora; el mes puede seguir cambiando.</p>');

  const kpi = (etiqueta, valor, detalle) => `<div class="kpi"><span class="kpi-l">${etiqueta}</span><b class="kpi-v">${valor}</b><span class="kpi-d">${detalle}</span></div>`;
  const kpis = [
    kpi('Horas reservadas', horasTexto(r.total.horas), `de ${horasTexto(r.total.disponibles)} disponibles`),
    kpi('Ocupación', pctTexto(r.total.ocupacion), `${r.habiles} ${r.habiles === 1 ? 'día hábil' : 'días hábiles'}, de ${horario.inicio} a ${horario.fin}`),
    kpi('Reservas', String(r.total.reservas), r.total.reservas ? `${pctTexto(r.total.formulario / r.total.reservas)} pedidas por la página` : 'ninguna'),
    kpi('Sala más usada', r.masUsada && r.masUsada.horas ? escapar(r.masUsada.sala.nombre) : '—', r.masUsada && r.masUsada.horas ? `${horasTexto(r.masUsada.horas)} · ${pctTexto(r.masUsada.ocupacion)} de ocupación` : 'sin reservas'),
  ].join('');

  // Una barra por sala sobre las horas disponibles del mes: lo usado, lo programado y lo libre.
  const ancho = (h) => (r.habiles ? Math.min(100, (h / (r.habiles * HORAS_HABILES)) * 100) : 0).toFixed(2);
  const barras = r.porSala.map(({ sala, usadas, programadas, horas, ocupacion }) => {
    const etiqueta = `${sala.nombre}: ${horasTexto(usadas)} usadas y ${horasTexto(programadas)} programadas, ${pctTexto(ocupacion)} de ocupación`;
    return `<li style="--c:${sala.color}"><span class="ind-sala"><i aria-hidden="true">${escapar(codigoSala(sala))}</i>${escapar(sala.nombre)}</span><span class="ind-barra" role="img" aria-label="${escapar(etiqueta)}" title="${escapar(etiqueta)}"><i class="usada" style="width:${ancho(usadas)}%"></i><i class="prog" style="left:${ancho(usadas)}%;width:${ancho(programadas)}%"></i></span><span class="ind-val">${horasTexto(horas)} <small>· ${pctTexto(ocupacion)}</small></span></li>`;
  }).join('');

  const maxDia = Math.max(0, ...r.porDiaSemana);
  const columnas = r.porDiaSemana.map((h, i) => `<span class="ind-col"><span class="ind-col-v">${h ? horasTexto(h) : ''}</span><span class="ind-col-b"><i style="height:${maxDia ? ((h / maxDia) * 100).toFixed(1) : 0}%"></i></span><span class="ind-col-l">${DIAS_SEMANA[i]}</span></span>`).join('');
  const resumenDias = r.porDiaSemana.map((h, i) => `${DIAS_SEMANA[i]} ${horasTexto(h)}`).join(', ');

  // Tira de medias horas del horario de reservas, con cinco marcas repartidas (en medias horas).
  const celdas = r.porBloque.map((p, k) => { const m0 = INICIO_RESERVAS + k * BLOQUE; return `<span class="ind-celda" style="--p:${p.toFixed(3)}" title="${hhmm(m0)} a ${hhmm(m0 + BLOQUE)}: ${pctTexto(p)} de las salas ocupadas"></span>`; }).join('');
  const largo = FIN_RESERVAS - INICIO_RESERVAS;
  const marcas = [...new Set([0, 1, 2, 3, 4].map((i) => INICIO_RESERVAS + Math.round((largo * i) / 4 / BLOQUE) * BLOQUE))]
    .map((m0) => `<span style="left:${((m0 - INICIO_RESERVAS) / largo) * 100}%">${hhmm(m0)}</span>`).join('');
  const picos = r.porBloque.map((p, k) => ({ p, k })).filter((x) => x.p > 0).sort((x, y) => y.p - x.p).slice(0, 2)
    .map(({ p, k }) => { const m0 = INICIO_RESERVAS + k * BLOQUE; return `de ${hhmm(m0)} a ${hhmm(m0 + BLOQUE)} (${pctTexto(p)} de las salas ocupadas)`; });
  const resumenHoras = picos.length ? `Horas más ocupadas: ${enumerar(picos)}.` : 'Sin reservas en días hábiles.';

  const fila = (nombre, x, total) => `<tr${total ? ' class="ind-total"' : ''}><th scope="row">${escapar(nombre)}</th><td>${horasTexto(x.usadas)}</td><td>${horasTexto(x.programadas)}</td><td>${pctTexto(x.ocupacion)}</td><td>${x.reservas}</td><td>${x.reservas ? horasTexto(x.horas / x.reservas) : '—'}</td><td>${x.dias}</td></tr>`;
  const tabla = `<table class="ind-tabla"><caption class="sr">Detalle por sala en ${mesLargo(mesIndicadores)}</caption><thead><tr><th scope="col">Sala</th><th scope="col">Usadas</th><th scope="col">Programadas</th><th scope="col">Ocupación</th><th scope="col">Reservas</th><th scope="col">Por reserva</th><th scope="col">Días con reserva</th></tr></thead><tbody>${r.porSala.map((x) => fila(x.sala.nombre, x, false)).join('')}${fila('Todas', r.total, true)}</tbody></table>`;

  cont.innerHTML = `<div class="ind">
    <div class="ind-filtros"><label for="ind-mes">Mes</label><select id="ind-mes">${opciones}</select><span class="ind-nota">Usadas: días que ya pasaron. Programadas: de hoy en adelante.${uso && uso.desde ? ` Historial desde el ${fechaConAno(uso.desde)}.` : ''}</span></div>
    ${notas.join('')}
    <div class="ind-kpis">${kpis}</div>
    <h3>Horas por sala</h3>
    <ol class="ind-salas">${barras}</ol>
    <p class="ind-leyenda"><span><i class="usada"></i>Usadas</span><span><i class="prog"></i>Programadas</span><span><i class="libre"></i>Disponibles</span></p>
    <div class="ind-dos">
      <div><h3>Por día de la semana</h3><div class="ind-dias" role="img" aria-label="${escapar(`Horas reservadas por día de la semana: ${resumenDias}.`)}">${columnas}</div></div>
      <div><h3>Horas más ocupadas</h3><div class="ind-horas" role="img" aria-label="${escapar(resumenHoras)}"><span class="ind-celdas" style="--bloques:${r.porBloque.length}">${celdas}</span><span class="ind-marcas">${marcas}</span></div><p class="ind-nota">Qué parte de las salas está ocupada en cada media hora de los días hábiles.</p></div>
    </div>
    <h3>Detalle por sala</h3>
    <div class="ind-tabla-wrap">${tabla}</div>
  </div>`;
};

// uso.js se carga solo al abrir la pestaña: la página no lo necesita para el calendario.
const cargarUso = () => new Promise((resolver) => {
  const script = document.createElement('script');
  script.src = `uso.js?v=${Math.floor(Date.now() / 60000)}`;
  script.onload = () => { script.remove(); resolver(window.USO || null); };
  script.onerror = () => { script.remove(); resolver(null); };
  document.head.appendChild(script);
});
const abrirIndicadores = (forzar) => {
  if (estadoUso === 'cargando') return;
  if (estadoUso === 'ok' && !forzar) { renderIndicadores(); return; }
  estadoUso = 'cargando';
  renderIndicadores();
  cargarUso().then((u) => {
    uso = u;
    estadoUso = u ? 'ok' : 'error';
    renderIndicadores();
  });
};
const indicadoresVisibles = () => { const p = $('#indicadores'); return Boolean(p && !p.hidden && estadoUso !== 'sin-cargar'); };
const iniciarIndicadores = () => {
  const cont = $('#indicadores');
  if (!cont) return;
  cont.addEventListener('change', (ev) => {
    if (ev.target.id !== 'ind-mes') return;
    mesIndicadores = ev.target.value;
    renderIndicadores();
    const sel = $('#ind-mes');
    if (sel) sel.focus();
  });
  cont.addEventListener('click', (ev) => { if (ev.target.closest('button[data-reintentar]')) abrirIndicadores(true); });
};

// --- Pestañas Calendario e Indicadores ---
// La dirección con #indicadores abre esa pestaña, para poder enlazarla.
const PESTANAS = [['pest-calendario', 'disponibilidad'], ['pest-indicadores', 'indicadores']];
const mostrarPestana = (id, enfocar) => {
  PESTANAS.forEach(([idPestana, idPanel]) => {
    const pestana = document.getElementById(idPestana);
    const panel = document.getElementById(idPanel);
    if (!pestana || !panel) return;
    const activa = idPestana === id;
    pestana.setAttribute('aria-selected', String(activa));
    pestana.tabIndex = activa ? 0 : -1;
    panel.hidden = !activa;
    if (activa && enfocar) pestana.focus();
  });
  if (id === 'pest-indicadores') abrirIndicadores(false);
  const hash = id === 'pest-indicadores' ? '#indicadores' : '';
  if (window.location.hash !== hash && (hash || window.location.hash === '#indicadores')) {
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}${hash}`);
  }
};
const iniciarPestanas = () => {
  const lista = $('.pestanas');
  if (!lista) return;
  lista.addEventListener('click', (ev) => { const t = ev.target.closest('[role="tab"]'); if (t) mostrarPestana(t.id, false); });
  lista.addEventListener('keydown', (ev) => {
    const pestanas = [...lista.querySelectorAll('[role="tab"]')];
    const i = pestanas.indexOf(document.activeElement);
    if (i < 0) return;
    const j = ev.key === 'ArrowRight' ? (i + 1) % pestanas.length : ev.key === 'ArrowLeft' ? (i + pestanas.length - 1) % pestanas.length : ev.key === 'Home' ? 0 : ev.key === 'End' ? pestanas.length - 1 : -1;
    if (j < 0) return;
    ev.preventDefault();
    mostrarPestana(pestanas[j].id, true);
  });
  const porHash = () => { if (window.location.hash === '#indicadores') mostrarPestana('pest-indicadores', false); };
  window.addEventListener('hashchange', porHash);
  porHash();
};

/* ===== 3. Tema claro/oscuro ===== */

const CLAVE_TEMA = 'salas9-tema';
const aplicarTema = (t) => {
  if (t) document.documentElement.setAttribute('data-tema', t);
  else document.documentElement.removeAttribute('data-tema');
};
const temaActual = () =>
  document.documentElement.getAttribute('data-tema')
  || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'oscuro' : 'claro');

// El <script> en línea del <head> ya aplicó el tema guardado antes del primer pintado.
// Aquí se reaplica por si ese script no corrió (p. ej. una CSP que bloquee scripts en
// línea), se conecta el botón y se le pone como etiqueta el tema actual.
const pintarBotonTema = () => {
  $('#btn-tema').textContent = temaActual() === 'oscuro' ? 'Tema oscuro' : 'Tema claro';
};
const iniciarTema = () => {
  try {
    const guardado = localStorage.getItem(CLAVE_TEMA);
    if (guardado === 'claro' || guardado === 'oscuro') aplicarTema(guardado);
  } catch (e) { /* sin almacenamiento: se usa el del sistema */ }
  pintarBotonTema();
  // Sin preferencia guardada, el tema sigue al sistema: la etiqueta debe seguirlo también.
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', pintarBotonTema);
  $('#btn-tema').addEventListener('click', () => {
    const nuevo = temaActual() === 'oscuro' ? 'claro' : 'oscuro';
    aplicarTema(nuevo);
    try { localStorage.setItem(CLAVE_TEMA, nuevo); } catch (e) { /* sin almacenamiento: el tema dura hasta recargar */ }
    pintarBotonTema();
  });
};

/* ===== 4. Reglas de las salas, contacto y copiar correo ===== */

// Aforos, salas que se piden juntas y salas deshabilitadas salen de config.js, para que las
// reglas cambien solas cuando cambie una sala.
const reglasDeSalas = () => {
  const activas = salasActivas();
  const conCupo = activas.filter((s) => Number(s.aforo) > 0);
  const reglas = [];
  if (conCupo.length) reglas.push(`Aforo: ${conCupo.map((s, i) => `${s.nombre}, ${s.aforo}${i === 0 ? ' personas' : ''}`).join('; ')}.`);
  const grupos = gruposJuntos()
    .map((nombres) => nombres.map((n) => conCupo.find((s) => s.nombre === n)))
    .filter((grupo) => grupo.length > 1 && grupo.every(Boolean));
  if (grupos.length) {
    const mayor = Math.max(...conCupo.map((s) => Number(s.aforo)));
    const total = (g) => g.reduce((t, s) => t + Number(s.aforo), 0);
    reglas.push(grupos.length === 1
      ? `Para más de ${mayor} personas se unen ${enumerar(grupos[0].map((s) => `la ${s.nombre}`))} en una sola, hasta ${total(grupos[0])} personas.`
      : `Para más de ${mayor} personas se unen dos salas en una sola: ${grupos.map((g) => `${enumerar(g.map((s) => s.nombre))}, hasta ${total(g)} personas`).join('; ')}.`);
  }
  const inactivas = SALAS.filter((s) => s.activa === false);
  if (inactivas.length) {
    reglas.push(inactivas.length === 1
      ? `La ${inactivas[0].nombre} está deshabilitada por ahora.`
      : `${mayuscula(enumerar(inactivas.map((s) => `la ${s.nombre}`)))} están deshabilitadas por ahora.`);
  }
  return reglas;
};
// La primera regla es el horario (sale de HORARIO); las de las salas van después.
const iniciarReglas = () => {
  const lista = $('.reglas');
  if (!lista) return;
  const reglaHorario = $('#regla-horario');
  if (reglaHorario) reglaHorario.textContent = `Horario de ${horario.inicio} a ${horario.fin}, en bloques de media hora.`;
  let ancla = lista.querySelector('li');
  for (const texto of reglasDeSalas()) {
    const li = document.createElement('li');
    li.textContent = texto;
    if (ancla) ancla.after(li); else lista.prepend(li);
    ancla = li;
  }
};

const iniciarContacto = () => {
  $('#correo-contacto').textContent = CONTACTO.correo;
  $('#btn-form').href = FORM_URL;
  const btn = $('#btn-copiar');
  btn.addEventListener('click', () => {
    const listo = (ok) => {
      btn.classList.toggle('ok', ok);
      btn.textContent = ok ? 'Copiado' : 'Seleccione y copie';
      setTimeout(() => { btn.classList.remove('ok'); btn.textContent = 'Copiar correo'; }, 1600);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(CONTACTO.correo).then(() => listo(true), () => listo(copiarConTextarea(CONTACTO.correo)));
    } else {
      listo(copiarConTextarea(CONTACTO.correo));
    }
  });
};

/* ===== 5. Arranque ===== */
iniciarDisponibilidad();
iniciarIndicadores();
iniciarPestanas();
iniciarTema();
iniciarReglas();
iniciarContacto();
