'use strict';
/* ============================================================================
   Salas Piso 9 CAM — página de disponibilidad y acceso al formulario
   Lee FORM_URL, CONTACTO y SALAS de config.js (se carga antes que este archivo).
   Estructura del archivo:
     1. Utilidades
     2. Render de salas
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
  return ok;
};

/* ===== 2. Render de salas ===== */

const renderSalas = () => {
  const cont = $('#salas');
  cont.innerHTML = SALAS.map((s) => {
    const aforo = s.aforo ? `<p class="aforo">Hasta ${s.aforo} personas</p>` : '<p class="aforo">CAM La Alpujarra, piso 9</p>';
    const ok = esUrl(s.calendario);
    const boton = ok
      ? `<a class="btn btn-s" href="${escapar(s.calendario.trim())}" target="_blank" rel="noopener">Ver disponibilidad</a>`
      : `<p class="pend">Calendario pendiente de publicar. Por ahora, pida la sala por el formulario; el sistema avisa si está ocupada.</p>
         <span class="btn btn-s" aria-disabled="true">Ver disponibilidad</span>`;
    return `<article class="sala" style="--c:${s.color}">
      <h3>${escapar(s.nombre)}</h3>
      ${aforo}
      ${boton}
    </article>`;
  }).join('');
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

// El <script> en línea del <head> ya aplicó el tema guardado antes del primer pintado;
// aquí solo se conecta el botón y se le pone la etiqueta del estado actual.
const pintarBotonTema = () => {
  const btn = $('#btn-tema');
  const oscuro = temaActual() === 'oscuro';
  btn.textContent = oscuro ? 'Tema oscuro' : 'Tema claro';
  btn.setAttribute('aria-pressed', String(oscuro));
};
const iniciarTema = () => {
  pintarBotonTema();
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
renderSalas();
iniciarTema();
iniciarContacto();
