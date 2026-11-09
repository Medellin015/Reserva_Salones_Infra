'use strict';
/* Dirección anterior (GitHub Pages): solo la página del botón hacia la
   dirección nueva. _config.yml excluye toda la página, sus datos y el código, y
   la carpeta github-pages/ trae la página del botón, que sale en la raíz y como
   404.html. Firebase Hosting no la publica (no está en la lista permitida de
   publicar/). Adaptadas del kit del traspaso (versión 2, ParticipacionLogistica).

   Uso:  node --test scripts/test/*.test.js */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { archivosPublicables, LISTA_PERMITIDA } = require('../preparar-publicacion');
const { rutasEsperadas } = require('../verificar-publicacion');

const RAIZ = path.join(__dirname, '..', '..');
const NUEVA = 'https://salas-piso9-med.web.app/';
const LOGO = 'logo-alcaldia-medellin.png';      // lo usa la página del botón: se sigue publicando aquí
const leer = (rel) => fs.readFileSync(path.join(RAIZ, rel), 'utf8');

/* Las entradas de «exclude:» de _config.yml (sin comentarios). */
function excluidos() {
  const lineas = leer('_config.yml').split('\n');
  const desde = lineas.findIndex(l => /^exclude:\s*$/.test(l));
  assert.ok(desde >= 0, '_config.yml sin «exclude:»');
  const salida = [];
  for (const l of lineas.slice(desde + 1)) {
    if (/^\S/.test(l)) break;                          // fin de la lista
    const m = l.match(/^\s*-\s*([^#\s]+)/);
    if (m) salida.push(m[1]);
  }
  return salida;
}

const cuerpo = (t) => t.replace(/^---\n[\s\S]*?\n---\n/, '');

test('GitHub Pages no publica la página, sus datos, la documentación, la configuración ni los scripts', () => {
  const ex = excluidos();
  for (const rel of LISTA_PERMITIDA.filter(f => f !== LOGO)) assert.ok(ex.includes(rel), `${rel} debe estar en «exclude» de _config.yml`);
  for (const rel of ['README.md', 'docs', 'btn-centrado-1280.png', 'firebase.json', 'scripts', 'publicar']) assert.ok(ex.includes(rel), rel);
  assert.ok(!ex.includes('github-pages'), 'la página del botón sí se publica');
  assert.ok(!ex.includes(LOGO), 'el logo se sigue publicando: lo carga la página del botón');
  assert.ok(!/\{\{|\{%/.test(leer('_config.yml')));
  // Todo lo de la raíz se excluye, salvo el logo y la página del botón (los ocultos y los que
  // empiezan con «_» los deja por fuera Jekyll). Así, un archivo nuevo no se publica sin querer.
  for (const e of fs.readdirSync(RAIZ)) {
    if (e.startsWith('.') || e.startsWith('_') || ['publicar', 'node_modules', 'github-pages', LOGO].includes(e)) continue;
    assert.ok(ex.includes(e), `${e} debe estar en «exclude» de _config.yml`);
  }
});

test('la página del botón: raíz y 404 con el mismo contenido y un solo botón hacia la dirección nueva', () => {
  const inicio = leer('github-pages/index.html');
  const error = leer('github-pages/404.html');
  assert.match(inicio, /^---\npermalink: \/\n---\n/);
  assert.match(error, /^---\npermalink: \/404\.html\n---\n/);
  assert.strictEqual(cuerpo(error), cuerpo(inicio), '404.html debe ser la misma página');
  const html = cuerpo(inicio);
  const enlaces = html.match(/<a\s[^>]*>/g) || [];
  assert.strictEqual(enlaces.length, 1, 'un solo botón');
  assert.ok(enlaces[0].includes(`href="${NUEVA}"`));
  assert.ok(!/<button|<form|<input/.test(html), 'nada más que el botón');
  assert.ok(!/\{\{|\{%/.test(inicio), 'sin marcas de Liquid (Jekyll las interpretaría)');
  assert.match(html, /<html lang="es">/);
  assert.match(html, /<meta name="robots" content="noindex">/);
  assert.ok(html.includes(`<link rel="canonical" href="${NUEVA}">`));
  assert.match(html, /<meta name="viewport" content="width=device-width, initial-scale=1">/);
  assert.match(html, /prefers-color-scheme: dark/, 'tema oscuro');
  assert.ok(html.includes('El aplicativo tiene una nueva dirección.'));
  assert.ok(html.includes('<h1>Salas Piso 9 CAM</h1>'));
  assert.ok(html.includes('<p class="direccion">salas-piso9-med.web.app</p>'));
  // El logo, con dirección completa: el 404 sale en cualquier profundidad de la ruta.
  assert.ok(html.includes(`src="https://medellin015.github.io/Reserva_Salones_Infra/${LOGO}"`));
  // Sin rutas relativas ni /Reserva_Salones_Infra/: solo https completo (y el ícono en línea).
  assert.ok(!/(src|href)="(?!https:\/\/|data:image\/svg\+xml,)[^"]+"/.test(html), 'sin rutas relativas');
  // Nada que cargue de otros sitios: ni fuentes ni librerías (la red institucional las bloquea).
  assert.ok(!/<link[^>]+stylesheet|<script[^>]+src=/.test(html));
});

/* Corre el script del botón con una dirección simulada. */
function abrir(ruta) {
  const html = cuerpo(leer('github-pages/index.html'));
  const codigo = html.match(/<script>\s*\(function \(\) \{[\s\S]*?<\/script>/)[0].replace(/^<script>|<\/script>$/g, '');
  const url = new URL('https://medellin015.github.io' + ruta);
  const elementos = { ir: { href: NUEVA } };
  vm.runInNewContext(codigo, { location: { pathname: url.pathname, search: url.search, hash: url.hash },
                               document: { getElementById: (id) => elementos[id] } });
  return elementos.ir.href;
}

test('un enlace viejo lleva al mismo lugar en la dirección nueva, con su ?consulta y su #ancla', () => {
  assert.strictEqual(abrir('/Reserva_Salones_Infra/'), NUEVA);
  assert.strictEqual(abrir('/Reserva_Salones_Infra/#indicadores'), NUEVA + '#indicadores');
  assert.strictEqual(abrir('/Reserva_Salones_Infra/?a=1#indicadores'), NUEVA + '?a=1#indicadores');
  assert.strictEqual(abrir('/Reserva_Salones_Infra/index.html#indicadores'), NUEVA + 'index.html#indicadores');
  assert.strictEqual(abrir('/Reserva_Salones_Infra'), NUEVA);
  // Cualquier otra ruta (lo que GitHub contesta con 404.html) lleva a la portada nueva.
  assert.strictEqual(abrir('/Reserva_Salones_Infra/app.js?x=1'), NUEVA);
  assert.strictEqual(abrir('/Reserva_Salones_Infra/docs/correo-anuncio.html#a'), NUEVA);
  assert.strictEqual(abrir('/Reserva_Salones_Infra/carpeta/index.html'), NUEVA);
});

/* Corre el script del tema (en el <head>) con un almacenamiento simulado. */
function tema(guardado) {
  const html = cuerpo(leer('github-pages/index.html'));
  const codigo = html.match(/<script>(\(function\(\)\{try\{var t=localStorage[\s\S]*?)<\/script>/)[1];
  const atributos = {};
  const localStorage = { getItem: (k) => { if (guardado instanceof Error) throw guardado; return k === 'salas9-tema' ? guardado : null; } };
  vm.runInNewContext(codigo, { localStorage, document: { documentElement: { setAttribute: (k, v) => { atributos[k] = v; } } } });
  return atributos['data-tema'];
}

test('la página usa el tema que la persona eligió en la página anterior, sin guardar nada', () => {
  assert.strictEqual(tema('oscuro'), 'oscuro');
  assert.strictEqual(tema('claro'), 'claro');
  assert.strictEqual(tema(null), undefined, 'sin tema guardado sigue la preferencia del sistema');
  assert.strictEqual(tema('<script>'), undefined, 'un valor raro se ignora');
  assert.strictEqual(tema(new Error('almacenamiento bloqueado')), undefined, 'sin acceso al almacenamiento no falla');
  // Misma clave que la aplicación.
  assert.match(leer('app.js'), /CLAVE_TEMA = 'salas9-tema'/);
  // Solo lee: no escribe, no borra ni manda nada a ninguna parte.
  assert.ok(!/removeItem|setItem|clear\(|fetch\(|innerHTML|sendBeacon|XMLHttpRequest/.test(leer('github-pages/index.html')));
});

test('Firebase Hosting no publica la página del botón y la verificación lo revisa', () => {
  assert.ok(!archivosPublicables(RAIZ).some(f => f.startsWith('github-pages/')));
  const { ocultas } = rutasEsperadas(RAIZ);
  assert.ok(ocultas.includes('github-pages/index.html') && ocultas.includes('github-pages/404.html'));
});
