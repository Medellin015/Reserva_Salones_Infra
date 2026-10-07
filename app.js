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

// "08:00 a 09:30, 11:00 a 12:00 y 14:00 a 16:00" o "la Sala 1, la Sala 2 y la Sala 3".
const enumerar = (lista) => (lista.length > 1 ? `${lista.slice(0, -1).join(', ')} y ${lista[lista.length - 1]}` : lista[0]);
const listaFranjas = (franjas) => enumerar(franjas.map(([a, b]) => `${a} a ${b}`));

const enlaceOutlook = (s, texto = s.nombre) => `<a href="${escapar(s.calendario.trim())}" target="_blank" rel="noopener" aria-label="${escapar(`Calendario de la ${s.nombre} en Outlook`)}">${escapar(texto)}</a>`;
const enlacesOutlook = () => SALAS.filter((s) => esUrl(s.calendario)).map((s) => enlaceOutlook(s)).join(' · ');

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

// Lee el enlace de ejemplo de config.js y descubre qué parámetro lleva cada respuesta.
// Devuelve null si no está configurado o si algún valor de ejemplo no aparece en el enlace:
// en ese caso no se generan enlaces, porque llevarían el valor de ejemplo fijo.
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
  const faltan = [['sala', ej.sala, campos.sala], ['fecha', ej.fecha, campos.fecha], ['horaInicio', ej.horaInicio, campos.hora]]
    .filter(([, valor, clave]) => valor && !clave).map(([nombre, valor]) => `${nombre} = "${valor}"`);
  if (faltan.length) {
    console.warn(`FORM_PREFILL: en el enlace no ${faltan.length > 1 ? 'aparecen' : 'aparece'} ${enumerar(faltan)}; revise FORM_PREFILL.ejemplo en config.js. El calendario no ofrece pedir desde una hora.`);
    return null;
  }
  if (!campos.sala && !campos.hora && !campos.fecha) return null;
  // Cualquier otra respuesta rellenada en el enlace de ejemplo viajará fija en todos los enlaces.
  const extras = pares.filter((p) => !['id', 'lang'].includes(p.clave) && !Object.values(campos).includes(p.clave) && p.decodificado !== '');
  if (extras.length) console.info(`FORM_PREFILL: el enlace trae además ${enumerar(extras.map((p) => `${p.clave} = "${p.decodificado}"`))}; ese valor irá fijo en todas las solicitudes.`);
  const enlace = (sala, fechaIso, hora) => {
    const nuevos = { [campos.sala]: sala, [campos.fecha]: formato ? formato.f(fechaIso) : null, [campos.hora]: hora };
    const consulta = pares.map((p) => (p.clave in nuevos && nuevos[p.clave] !== null ? `${p.clave}=${encodeURIComponent(nuevos[p.clave])}` : `${p.clave}=${p.valor}`)).join('&');
    return `${url.origin}${url.pathname}?${consulta}${url.hash}`;
  };
  return { campos, enlace };
};

let diaElegido = null;
let prefill = null;
let claveRender = null;

// Resume lo que puede cambiar el dibujo: el día, el bloque de media hora (ceil: las horas que
// se pueden pedir son las que empiezan en o después de ahora, así que el conjunto cambia al
// pasar cada :00 y :30), el aviso de datos viejos y el día elegido; o el plan B sin datos.
const claveDe = (hoy, datos) => {
  const dias = datos && Array.isArray(datos.dias) ? datos.dias.filter((d) => d >= hoy.fecha) : [];
  if (!dias.length || !datos.ocupado) return `${hoy.fecha}|plan-b`;
  const sinLeerHoy = datos.verificado !== hoy.fecha && hoy.habil && hoy.minutos >= HORA_AVISO;
  return `${hoy.fecha}|${Math.ceil(hoy.minutos / BLOQUE)}|${sinLeerHoy}|${diaElegido}`;
};

// Pinta el calendario completo. Guarda y devuelve el foco y el desplazamiento de la tira
// de días, porque reemplazar el HTML los perdería.
const renderDisponibilidad = () => {
  const cont = $('#disponibilidad');
  const datos = window.DISPONIBILIDAD;
  const hoy = ahoraBogota();
  const dias = datos && Array.isArray(datos.dias) ? datos.dias.filter((d) => d >= hoy.fecha) : [];
  const errores = (datos && datos.errores) || {};
  const activo = document.activeElement && cont.contains(document.activeElement) ? document.activeElement : null;
  const recordado = activo ? { dia: activo.dataset.dia, href: activo.getAttribute('href') } : null;
  const tira = cont.querySelector('.dias');
  const desplazamiento = tira ? tira.scrollLeft : 0;

  // Devuelve el desplazamiento de la tira y el foco a donde estaban (o al chip del día si el
  // elemento enfocado ya no existe).
  const restaurar = () => {
    const tiraNueva = cont.querySelector('.dias');
    if (tiraNueva) tiraNueva.scrollLeft = desplazamiento;
    if (!recordado) return;
    const mismo = recordado.dia
      ? cont.querySelector(`button[data-dia="${recordado.dia}"]`)
      : recordado.href && cont.querySelector(`a[href="${CSS.escape(recordado.href)}"]`);
    const destino = mismo || cont.querySelector(`button[data-dia="${diaElegido}"]`);
    if (destino) destino.focus({ preventScroll: true });
  };

  // Plan B: sin datos vigentes (la tarea no ha corrido, lleva días sin correr o el archivo
  // no cargó), se ofrecen los calendarios de Outlook.
  if (!dias.length || !datos.ocupado) {
    cont.innerHTML = `<p class="disp-nota aviso">La disponibilidad no está disponible en este momento. Puede revisarla en Outlook: ${enlacesOutlook()}.</p>`;
    claveRender = claveDe(hoy, datos);
    restaurar();
    return;
  }
  if (!dias.includes(diaElegido)) diaElegido = dias[0];
  claveRender = claveDe(hoy, datos);
  const sinLeerHoy = datos.verificado !== hoy.fecha && hoy.habil && hoy.minutos >= HORA_AVISO;

  const chips = dias.map((d) => {
    const etiqueta = etiquetaDia(d, hoy.fecha);
    const nombre = etiqueta === 'Hoy' || etiqueta === 'Mañana' ? `${etiqueta}, ${fechaLarga(d)}` : fechaLarga(d);
    return `<button class="dia" type="button" data-dia="${d}" aria-pressed="${d === diaElegido}" aria-label="${escapar(nombre)}">${etiqueta}</button>`;
  }).join('');

  const horas = [];
  for (let m = INICIO_DIA; m <= FIN_DIA; m += 60) horas.push(`<span style="top:${pct(m)}%">${hhmm(m)}</span>`);

  const columnas = SALAS.map((s) => {
    if (!datos.ocupado[s.nombre]) {
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
  const nombrar = (salas) => enumerar(salas.map((s) => `la ${s.nombre}`));
  const sinDatos = SALAS.filter((s) => !datos.ocupado[s.nombre]);
  const conError = SALAS.filter((s) => s.nombre in errores && datos.ocupado[s.nombre]);
  if (sinLeerHoy) {
    const cuando = datos.verificado ? `son del ${fechaLarga(datos.verificado)}` : 'no se han podido leer';
    notas.push(`<p class="disp-nota aviso">Los calendarios no se han podido leer hoy: los datos ${cuando} y pueden estar desactualizados. Antes de pedir, revise el calendario en Outlook: ${enlacesOutlook()}.</p>`);
  } else {
    if (sinDatos.length) notas.push(`<p class="disp-nota aviso">No se pudo leer el calendario de ${escapar(nombrar(sinDatos))}. Revíselo en Outlook antes de pedir.</p>`);
    if (conError.length) notas.push(`<p class="disp-nota aviso">En la última lectura no se pudo leer el calendario de ${escapar(nombrar(conError))}; se muestran los datos de la lectura anterior de hoy. Revíselo en Outlook antes de pedir.</p>`);
  }
  if (datos.actualizado) {
    const act = new Date(datos.actualizado);
    if (!Number.isNaN(act.getTime())) {
      const { fecha: diaAct, minutos: minAct } = enBogota(act);
      const cuando = diaAct === hoy.fecha ? `hoy a las ${hhmm(minAct)}` : `el ${fechaLarga(diaAct)} a las ${hhmm(minAct)}`;
      notas.push(`<p class="disp-nota">Última novedad ${cuando}. Una reserva nueva puede tardar hasta 30 minutos en aparecer; al pedir la sala, el sistema revisa de nuevo que esté libre.</p>`);
    }
  }

  const leyenda = prefill
    ? 'Las franjas de color son horas ya reservadas. Toque una hora libre para pedirla con la sala, la fecha y la hora ya puestas.'
    : 'Las franjas de color son horas ya reservadas. Lo que está en blanco está libre.';

  cont.innerHTML = `<p class="disp-ley">${leyenda}</p>
    <div class="dias" role="group" aria-label="Día">${chips}</div>
    <a class="saltar" href="#como-funciona">Saltar el calendario</a>
    <div class="ag" style="--n:${SALAS.length};--horas:${(FIN_DIA - INICIO_DIA) / 60}" role="group" aria-label="${escapar(`Disponibilidad del ${fechaLarga(diaElegido)}`)}">
      <div class="ag-cab" aria-hidden="true"><span></span>${SALAS.map((s) => `<span style="--c:${s.color}">${escapar(s.nombre)}</span>`).join('')}</div>
      <div class="ag-cuerpo"><div class="ag-eje" aria-hidden="true">${horas.join('')}</div>${columnas}${lineaAhora}</div>
    </div>
    ${notas.join('')}
    <p class="disp-outlook">Calendarios en Outlook: ${enlacesOutlook()}</p>`;

  restaurar();
};

// Cada minuto solo se mueve la línea de "ahora"; el calendario completo se repinta cuando
// cambia algo visible (el día, el bloque de media hora o el aviso), para no perder el foco.
const refrescar = () => {
  const hoy = ahoraBogota();
  if (claveDe(hoy, window.DISPONIBILIDAD) !== claveRender) { renderDisponibilidad(); return; }
  const linea = $('#disponibilidad .ag-ahora');
  if (linea && diaElegido === hoy.fecha) linea.style.top = `${pct(hoy.minutos)}%`;
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
  setInterval(refrescar, 60000);
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
