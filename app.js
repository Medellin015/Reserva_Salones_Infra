'use strict';
/* ============================================================================
   Salas Piso 9 CAM — página de disponibilidad y acceso al formulario
   Lee FORM_URL, CONTACTO, SALAS y FORM_PREFILL de config.js, y las horas ocupadas de
   disponibilidad.js; los dos se cargan antes que este archivo.
   Estructura del archivo:
     1. Utilidades
     2. Calendario de disponibilidad (y enlace de Forms con respuestas rellenadas)
     3. Tema claro/oscuro
     4. Contacto y copiar correo
     5. Arranque
   ============================================================================ */

/* ===== 1. Utilidades ===== */

const $ = (sel) => document.querySelector(sel);
const esUrl = (v) => typeof v === 'string' && /^https?:\/\//i.test(v.trim());
const escapar = (t) => String(t).replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));

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

// Franja que muestra el calendario, igual al horario de reservas, en bloques de media hora.
const aMinutos = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };
const hhmm = (minutos) => `${String(Math.floor(minutos / 60)).padStart(2, '0')}:${String(minutos % 60).padStart(2, '0')}`;
const INICIO_DIA = aMinutos('07:00');
const FIN_DIA = aMinutos('18:00');
const BLOQUE = 30;
const pct = (min) => ((Math.min(Math.max(min, INICIO_DIA), FIN_DIA) - INICIO_DIA) / (FIN_DIA - INICIO_DIA)) * 100;
// La tarea programada lee los calendarios desde las 06:00; si a esta hora aún no ha
// podido leerlos hoy, se avisa que la información puede estar vieja.
const HORA_AVISO = aMinutos('07:30');

// Fecha (AAAA-MM-DD) y minuto del día en Bogotá, sin depender de la zona horaria del equipo.
const ahoraBogota = () => {
  const partes = {};
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(new Date()).forEach((x) => { partes[x.type] = x.value; });
  const fecha = `${partes.year}-${partes.month}-${partes.day}`;
  const semana = fechaLocal(fecha).getDay();
  return { fecha, minutos: Number(partes.hour) * 60 + Number(partes.minute), habil: semana >= 1 && semana <= 5 };
};

// new Date(a, m - 1, d) evita el desfase de zona horaria al leer "AAAA-MM-DD".
const fechaLocal = (iso) => { const [a, m, d] = iso.split('-').map(Number); return new Date(a, m - 1, d); };
const isoDe = (f) => `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, '0')}-${String(f.getDate()).padStart(2, '0')}`;
const DIAS_CORTOS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const fechaLarga = (iso) => fechaLocal(iso).toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' });
const etiquetaDia = (iso, hoy) => {
  if (iso === hoy) return 'Hoy';
  const manana = fechaLocal(hoy);
  manana.setDate(manana.getDate() + 1);
  if (iso === isoDe(manana)) return 'Mañana';
  const f = fechaLocal(iso);
  return `${DIAS_CORTOS[f.getDay()]} ${f.getDate()}`;
};

// "08:00 a 09:30, 11:00 a 12:00 y 14:00 a 16:00", para lectores de pantalla.
const listaFranjas = (franjas) => {
  const t = franjas.map(([a, b]) => `${a} a ${b}`);
  return t.length > 1 ? `${t.slice(0, -1).join(', ')} y ${t[t.length - 1]}` : t[0];
};

const enlaceOutlook = (s, texto = s.nombre) => `<a href="${escapar(s.calendario.trim())}" target="_blank" rel="noopener" aria-label="${escapar(`Calendario de la ${s.nombre} en Outlook`)}">${escapar(texto)}</a>`;
const enlacesOutlook = () => SALAS.filter((s) => esUrl(s.calendario)).map((s) => enlaceOutlook(s)).join(' · ');

// --- Enlace de Forms con respuestas rellenadas ---
// Formas en que Forms puede escribir una fecha en el enlace; se prueban contra la fecha de ejemplo.
const formatosFecha = (iso) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso || '')) return [];
  const [a, m, d] = iso.split('-');
  const sin0 = (x) => String(Number(x));
  return [
    { f: (y) => y },
    { f: (y) => { const [A, M, D] = y.split('-'); return `${D}/${M}/${A}`; } },
    { f: (y) => { const [A, M, D] = y.split('-'); return `${sin0(D)}/${sin0(M)}/${A}`; } },
    { f: (y) => { const [A, M, D] = y.split('-'); return `${M}/${D}/${A}`; } },
    { f: (y) => { const [A, M, D] = y.split('-'); return `${sin0(M)}/${sin0(D)}/${A}`; } },
    { f: (y) => { const [A, M, D] = y.split('-'); return `${D}-${M}-${A}`; } },
    { f: (y) => y.replace(/-/g, '/') },
    { f: (y) => y.replace(/-/g, '') },
  ].map((x) => ({ ...x, ejemplo: x.f(`${a}-${m}-${d}`) }));
};

// Lee el enlace de ejemplo de config.js y descubre qué parámetro lleva cada respuesta.
// Devuelve null si no está configurado o no se reconoce ningún valor de ejemplo.
const plantillaPrefill = () => {
  const cfg = typeof FORM_PREFILL === 'object' && FORM_PREFILL;
  if (!cfg || !esUrl(cfg.enlace)) return null;
  let url;
  try { url = new URL(cfg.enlace.trim()); } catch (e) { return null; }
  const ej = cfg.ejemplo || {};
  const pares = url.search.replace(/^\?/, '').split('&').filter(Boolean).map((par) => {
    const k = par.indexOf('=');
    const clave = k < 0 ? par : par.slice(0, k);
    const valor = k < 0 ? '' : par.slice(k + 1);
    let decodificado = valor;
    try { decodificado = decodeURIComponent(valor.replace(/\+/g, ' ')); } catch (e) { /* se deja tal cual */ }
    return { clave, valor, decodificado: decodificado.trim() };
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
  if (!campos.sala && !campos.hora && !campos.fecha) return null;
  const enlace = (sala, fechaIso, hora) => {
    const nuevos = { [campos.sala]: sala, [campos.fecha]: formato ? formato.f(fechaIso) : null, [campos.hora]: hora };
    const consulta = pares.map((p) => (p.clave in nuevos && nuevos[p.clave] !== null ? `${p.clave}=${encodeURIComponent(nuevos[p.clave])}` : `${p.clave}=${p.valor}`)).join('&');
    return `${url.origin}${url.pathname}?${consulta}${url.hash}`;
  };
  return { campos, enlace };
};

let diaElegido = null;
let prefill = null;

const renderDisponibilidad = () => {
  const cont = $('#disponibilidad');
  const datos = window.DISPONIBILIDAD;
  const hoy = ahoraBogota();
  const dias = datos && Array.isArray(datos.dias) ? datos.dias.filter((d) => d >= hoy.fecha) : [];
  const errores = (datos && datos.errores) || {};

  // Plan B: sin datos (la tarea no ha corrido o el archivo no cargó), se ofrecen los calendarios de Outlook.
  if (!dias.length || !datos.ocupado) {
    cont.innerHTML = `<p class="disp-nota aviso">La disponibilidad todavía no se ha cargado. Puede revisarla en Outlook: ${enlacesOutlook()}.</p>`;
    return;
  }
  if (!dias.includes(diaElegido)) diaElegido = dias[0];

  const chips = dias.map((d) => `<button class="dia" type="button" data-dia="${d}" aria-pressed="${d === diaElegido}" aria-label="${escapar(fechaLarga(d))}">${etiquetaDia(d, hoy.fecha)}</button>`).join('');

  const horas = [];
  for (let m = INICIO_DIA; m <= FIN_DIA; m += 60) horas.push(`<span style="top:${pct(m)}%">${hhmm(m)}</span>`);

  const columnas = SALAS.map((s) => {
    const sinDatos = s.nombre in errores || !datos.ocupado[s.nombre];
    if (sinDatos) {
      // El enlace debe seguir siendo accesible, así que esta columna no se oculta a los lectores.
      const enlace = esUrl(s.calendario) ? ` ${enlaceOutlook(s, 'Ver en Outlook')}` : '';
      return `<div class="ag-col"><span class="ag-sin"><span class="sr">${escapar(s.nombre)}: </span>Sin datos.${enlace}</span></div>`;
    }
    const franjas = (datos.ocupado[s.nombre][diaElegido] || [])
      .map(([a, b]) => [aMinutos(a), aMinutos(b)])
      .filter(([a, b]) => b > INICIO_DIA && a < FIN_DIA);
    const bloques = franjas.map(([ini, fin]) => {
      const desde = Math.max(ini, INICIO_DIA);
      const hasta = Math.min(fin, FIN_DIA);
      return `<span class="ag-oc${hasta - desde < 60 ? ' corta' : ''}" style="top:${pct(desde)}%;height:${pct(hasta) - pct(desde)}%" aria-hidden="true"><span>${hhmm(desde)}</span><span>–${hhmm(hasta)}</span></span>`;
    }).join('');
    // Horas libres que se pueden pedir con el formulario ya rellenado (solo futuras).
    let pedir = '';
    if (prefill) {
      const libres = [];
      for (let m = INICIO_DIA; m < FIN_DIA; m += BLOQUE) {
        if (diaElegido === hoy.fecha && m < hoy.minutos) continue;
        if (!franjas.some(([a, b]) => a < m + BLOQUE && b > m)) libres.push(m);
      }
      pedir = libres.map((m) => `<a class="ag-pedir" href="${escapar(prefill.enlace(s.nombre, diaElegido, hhmm(m)))}" target="_blank" rel="noopener" style="top:${pct(m)}%;height:${pct(m + BLOQUE) - pct(m)}%" aria-label="${escapar(`Pedir la ${s.nombre} el ${fechaLarga(diaElegido)} a las ${hhmm(m)}`)}"><span aria-hidden="true">Pedir ${hhmm(m)}</span></a>`).join('');
    }
    const resumen = franjas.length
      ? `${s.nombre}: ocupada de ${listaFranjas(franjas.map(([a, b]) => [hhmm(Math.max(a, INICIO_DIA)), hhmm(Math.min(b, FIN_DIA))]))}.`
      : `${s.nombre}: libre todo el día.`;
    const libreTexto = !franjas.length && !prefill ? '<span class="ag-libre" aria-hidden="true">Libre</span>' : '';
    return `<div class="ag-col" style="--c:${s.color}"><span class="sr">${escapar(resumen)}</span>${bloques}${libreTexto}${pedir}</div>`;
  }).join('');

  const lineaAhora = diaElegido === hoy.fecha && hoy.minutos >= INICIO_DIA && hoy.minutos <= FIN_DIA
    ? `<div class="ag-capa" aria-hidden="true"><div class="ag-ahora" style="top:${pct(hoy.minutos)}%"></div></div>` : '';

  // Estado de los datos: cuándo se leyeron los calendarios y si alguno falló.
  const notas = [];
  const salasConError = SALAS.filter((s) => s.nombre in errores || !datos.ocupado[s.nombre]);
  const sinLeerHoy = datos.verificado !== hoy.fecha && hoy.habil && hoy.minutos >= HORA_AVISO;
  if (sinLeerHoy) {
    const cuando = datos.verificado ? `son del ${fechaLarga(datos.verificado)}` : 'no se han podido leer';
    notas.push(`<p class="disp-nota aviso">Los calendarios no se han podido leer hoy: los datos ${cuando} y pueden estar desactualizados. Antes de pedir, revise el calendario en Outlook: ${enlacesOutlook()}.</p>`);
  } else if (salasConError.length) {
    const nombres = salasConError.map((s) => s.nombre);
    const lista = nombres.length > 1 ? `${nombres.slice(0, -1).join(', ')} y ${nombres[nombres.length - 1]}` : nombres[0];
    notas.push(`<p class="disp-nota aviso">No se pudo leer el calendario de ${escapar(lista)}. Revíselo en Outlook antes de pedir.</p>`);
  }
  if (datos.actualizado) {
    const act = new Date(datos.actualizado);
    const horaAct = act.toLocaleTimeString('es-CO', { timeZone: 'America/Bogota', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
    const diaAct = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(act);
    const cuando = diaAct === hoy.fecha ? `hoy a las ${horaAct}` : `el ${fechaLarga(diaAct)} a las ${horaAct}`;
    notas.push(`<p class="disp-nota">Última novedad ${cuando}. Una reserva nueva puede tardar hasta 30 minutos en aparecer; al pedir la sala, el sistema revisa de nuevo que esté libre.</p>`);
  }

  const leyenda = prefill
    ? 'Las franjas de color son horas ya reservadas. Toque una hora libre para pedirla con la sala, la fecha y la hora ya puestas.'
    : 'Las franjas de color son horas ya reservadas. Lo que está en blanco está libre.';

  cont.innerHTML = `<p class="disp-ley">${leyenda}</p>
    <div class="dias" role="group" aria-label="Día">${chips}</div>
    <div class="ag" style="--n:${SALAS.length};--horas:${(FIN_DIA - INICIO_DIA) / 60}" role="group" aria-label="${escapar(`Disponibilidad del ${fechaLarga(diaElegido)}`)}">
      <div class="ag-cab" aria-hidden="true"><span></span>${SALAS.map((s) => `<span style="--c:${s.color}">${escapar(s.nombre)}</span>`).join('')}</div>
      <div class="ag-cuerpo"><div class="ag-eje" aria-hidden="true">${horas.join('')}</div>${columnas}${lineaAhora}</div>
    </div>
    ${notas.join('')}
    <p class="disp-outlook">Calendarios en Outlook: ${enlacesOutlook()}</p>`;
};

const iniciarDisponibilidad = () => {
  prefill = plantillaPrefill();
  renderDisponibilidad();
  $('#disponibilidad').addEventListener('click', (ev) => {
    const chip = ev.target.closest('button[data-dia]');
    if (!chip) return;
    diaElegido = chip.dataset.dia;
    renderDisponibilidad();
    const elegido = $(`#disponibilidad button[data-dia="${diaElegido}"]`);
    if (elegido) elegido.focus();
  });
  // La línea de "ahora", las horas ya pasadas y los avisos se recalculan cada minuto.
  setInterval(renderDisponibilidad, 60000);
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

/* ===== 4. Contacto y copiar correo ===== */

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
iniciarTema();
iniciarContacto();
