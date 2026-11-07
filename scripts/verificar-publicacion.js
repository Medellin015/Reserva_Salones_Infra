'use strict';
/* ============================================================================
   VERIFICACIÓN DE LA PUBLICACIÓN EN FIREBASE HOSTING
   ----------------------------------------------------------------------------
   Lo corre el flujo «Publicar aplicación» justo después de publicar:
     node scripts/verificar-publicacion.js https://salas-piso9-med.web.app

   Revisa en la dirección publicada que:
     · abran (HTTP 200) la portada y cada archivo de la lista permitida
       (scripts/preparar-publicacion.js);
     · NO se vea (HTTP 404) nada más del repositorio: los scripts, las pruebas,
       la configuración (firebase.json, .firebaserc, _config.yml), la
       documentación (README.md, docs/), .git y .github. La lista sale del
       propio repositorio, así que un archivo nuevo queda revisado solo;
     · la portada llegue con los encabezados de firebase.json: sin caché vieja
       (no-cache) y con nosniff.
   Si algo falla, termina con error y lo anota en el resumen del flujo.

   Estructura del archivo:
     1. Qué debe verse y qué no
     2. Revisión en la dirección publicada
     3. Línea de comandos
   ============================================================================ */

const fs = require('fs');
const path = require('path');
const { archivosPublicables, permitido, DESTINO } = require('./preparar-publicacion');

const RAIZ = path.join(__dirname, '..');

/* ===== 1. Qué debe verse y qué no ===== */

// Carpetas que no son del repositorio: .git se revisa con rutas fijas,
// node_modules no existe aquí y publicar/ es la copia que se acaba de subir.
const NO_RECORRER = new Set(['.git', 'node_modules', DESTINO]);

// El archivo de credenciales que deja google-github-actions/auth en la carpeta
// de trabajo. Nunca se publica (firebase.json publica solo publicar/), y su
// nombre no se pide para no dejarlo en el registro.
const CREDENCIAL_DE_ACTIONS = /^gha-creds-.*\.json$/;

/* Todos los archivos del repositorio (rutas relativas, con «/»). */
function archivosDelRepositorio(raiz = RAIZ, dir = '') {
  const salida = [];
  for (const e of fs.readdirSync(path.join(raiz, dir), { withFileTypes: true })) {
    const rel = dir ? `${dir}/${e.name}` : e.name;
    if (e.isDirectory()) {
      if (!NO_RECORRER.has(rel)) salida.push(...archivosDelRepositorio(raiz, rel));
    } else if (e.isFile() && !CREDENCIAL_DE_ACTIONS.test(e.name)) {
      salida.push(rel);
    }
  }
  return salida;
}

// Se revisan aunque no existan en el repositorio: .git, el registro de
// firebase-tools, la configuración de GitHub Pages y lo que Jekyll genera.
const SIEMPRE_OCULTAS = [
  '.git/config',
  '.git/HEAD',
  'publicacion.log',
  '_config.yml',
  'README.md',
  'firebase.json',
  '.firebaserc',
  '.gitignore',
  '.github/workflows/publicar-aplicacion.yml',
  '.github/workflows/disponibilidad.yml',
  'github-pages/index.html',            // la página del botón es solo para GitHub Pages
  'github-pages/404.html',
  'assets/css/style.css'                // la hoja del tema que agrega GitHub Pages
];

function rutasEsperadas(raiz = RAIZ) {
  // La misma lista permitida con la que se arma publicar/.
  const publicas = ['', ...archivosPublicables(raiz)];     // '' = la portada (index.html)
  const ocultas = [...new Set([
    ...archivosDelRepositorio(raiz).filter(rel => !permitido(rel)),
    ...SIEMPRE_OCULTAS
  ])].sort();
  return { publicas, ocultas };
}

/* ===== 2. Revisión en la dirección publicada ===== */

const espera = (ms) => new Promise(r => setTimeout(r, ms));

async function pedirRuta(base, ruta, pedir, intentos = 3) {
  const url = base.replace(/\/+$/, '') + '/' + ruta.split('/').map(encodeURIComponent).join('/');
  for (let i = 1; ; i++) {
    try {
      const r = await pedir(url, { redirect: 'manual' });
      if (r.body && typeof r.body.cancel === 'function') r.body.cancel().catch(() => {});
      return { estado: r.status, encabezados: r.headers };
    } catch (e) {
      if (i >= intentos) return { estado: 0, error: e.message };
      await espera(2000);
    }
  }
}

async function verificar(base, rutas = rutasEsperadas(), pedir = fetch) {
  const fallas = [];
  for (const ruta of rutas.publicas) {
    const r = await pedirRuta(base, ruta, pedir);
    if (r.estado !== 200) fallas.push(`/${ruta} debería abrir y respondió ${r.estado || r.error}`);
    if (ruta === '' && r.estado === 200) {
      const cache = String(r.encabezados.get('cache-control') || '');
      const nosniff = String(r.encabezados.get('x-content-type-options') || '');
      if (!/no-cache/i.test(cache)) fallas.push(`la portada llegó sin «no-cache» (Cache-Control: ${cache || 'vacío'})`);
      if (!/nosniff/i.test(nosniff)) fallas.push('la portada llegó sin «X-Content-Type-Options: nosniff»');
    }
  }
  for (const ruta of rutas.ocultas) {
    const r = await pedirRuta(base, ruta, pedir);
    if (r.estado !== 404) fallas.push(`/${ruta} NO debería publicarse y respondió ${r.estado || r.error}`);
  }
  return { revisadas: rutas.publicas.length + rutas.ocultas.length, fallas };
}

/* ===== 3. Línea de comandos ===== */

if (require.main === module) {
  (async () => {
    const base = process.argv[2] || '';
    if (!/^https:\/\/[a-z0-9.-]+$/.test(base.replace(/\/+$/, ''))) {
      throw new Error('Uso: node scripts/verificar-publicacion.js https://<sitio>.web.app');
    }
    const rutas = rutasEsperadas();
    const { revisadas, fallas } = await verificar(base, rutas);
    const resumen = [
      `### Verificación de ${base}`,
      `- Abren: ${rutas.publicas.length} rutas (portada y lista permitida).`,
      `- No se publican: ${rutas.ocultas.length} rutas (scripts, pruebas, configuración, documentación, .git y .github).`,
      fallas.length ? `- **Fallas (${fallas.length}):**\n${fallas.map(f => `  - ${f}`).join('\n')}` : '- Todo en orden.'
    ].join('\n');
    console.log(resumen);
    if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, resumen + '\n');
    console.log(`Rutas revisadas: ${revisadas}.`);
    if (fallas.length) process.exit(1);
  })().catch(e => { console.error(e.message); process.exit(1); });
}

module.exports = { rutasEsperadas, verificar, archivosDelRepositorio };
