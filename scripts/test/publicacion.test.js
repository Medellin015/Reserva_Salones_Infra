'use strict';
/* Pruebas de la publicación en Firebase Hosting: el token de Google, la API de
   Hosting, la lista permitida, la revisión de lo publicado, la verificación en
   la dirección, el flujo «Publicar aplicación» y lo que GitHub Pages sigue
   publicando mientras dura el cambio. No salen a internet: cada prueba usa un
   «fetch» simulado que responde como Google. Adaptadas del kit del traspaso
   (versión 2, ParticipacionLogistica).

   Uso:  node --test scripts/test/*.test.js */

const test = require('node:test');
const assert = require('node:assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { armarJWT, tokenDeAcceso } = require('../token-google');
const { estadoSitio, apagarSitio, limitarVersiones, revisarPublicado } = require('../hosting');
const { archivosPublicables, prepararPublicacion, permitido, LISTA_PERMITIDA } = require('../preparar-publicacion');
const { rutasEsperadas, verificar } = require('../verificar-publicacion');

const RAIZ = path.join(__dirname, '..', '..');
const leer = (rel) => fs.readFileSync(path.join(RAIZ, rel), 'utf8');

/* ===== Utilidades ===== */

function respuesta(estado, cuerpo, encabezados = {}) {
  const mapa = new Map(Object.entries(encabezados).map(([k, v]) => [k.toLowerCase(), v]));
  return { status: estado, ok: estado >= 200 && estado < 300, json: async () => cuerpo,
           headers: { get: (k) => mapa.get(String(k).toLowerCase()) || null } };
}

/* fetch simulado: cada regla es [prueba(url, opciones), respuesta]. Anota las llamadas. */
function simulado(reglas) {
  const llamadas = [];
  const pedir = async (url, opciones = {}) => {
    llamadas.push({ url: String(url), metodo: opciones.method || 'GET', cuerpo: opciones.body });
    for (const [prueba, r] of reglas) if (prueba(String(url), opciones)) return typeof r === 'function' ? r(String(url), opciones) : r;
    throw new Error('URL no simulada: ' + url);
  };
  pedir.llamadas = llamadas;
  return pedir;
}

/* ===== Token de Google ===== */

test('el JWT de la cuenta de servicio se firma con RS256 y la llave privada', () => {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const cred = { client_email: 'cuenta@proyecto.iam.gserviceaccount.com', private_key_id: 'abc',
                 private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }) };
  const jwt = armarJWT(cred, 1000);
  const [cab, datos, firma] = jwt.split('.');
  const decodificar = (x) => JSON.parse(Buffer.from(x.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString());
  assert.deepStrictEqual(decodificar(cab), { alg: 'RS256', typ: 'JWT', kid: 'abc' });
  const d = decodificar(datos);
  assert.strictEqual(d.iss, cred.client_email);
  assert.strictEqual(d.scope, 'https://www.googleapis.com/auth/cloud-platform');
  assert.strictEqual(d.aud, 'https://oauth2.googleapis.com/token');
  assert.strictEqual(d.exp - d.iat, 3600);
  const ok = crypto.createVerify('RSA-SHA256').update(`${cab}.${datos}`)
    .verify(publicKey, Buffer.from(firma.replace(/-/g, '+').replace(/_/g, '/'), 'base64'));
  assert.ok(ok, 'la firma debe verificarse con la llave pública');
});

test('el token se pide con el JWT y un error de Google no muestra la llave', async () => {
  const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const pem = privateKey.export({ type: 'pkcs8', format: 'pem' });
  const cred = { client_email: 'c@p.iam.gserviceaccount.com', private_key: pem };
  const bien = simulado([[(u) => u.includes('oauth2'), respuesta(200, { access_token: 'tok-123' })]]);
  assert.strictEqual(await tokenDeAcceso(cred, bien), 'tok-123');
  assert.match(bien.llamadas[0].cuerpo, /grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer/);
  const mal = simulado([[(u) => u.includes('oauth2'), respuesta(400, { error: 'invalid_grant' })]]);
  await assert.rejects(tokenDeAcceso(cred, mal), (e) => {
    assert.match(e.message, /invalid_grant/);
    assert.ok(!e.message.includes('PRIVATE KEY'));
    return true;
  });
});

/* ===== API de Hosting ===== */

test('Hosting: estado, apagado con SITE_DISABLE y versiones guardadas', async () => {
  const pedir = simulado([
    [(u) => u.endsWith('/sites/sitio-x/channels/live'), respuesta(200, { release: { type: 'DEPLOY' } })],
    [(u, o) => u.endsWith('/sites/sitio-x/releases') && o.method === 'POST', respuesta(200, {})],
    [(u, o) => u.includes('/config?updateMask=maxVersions') && o.method === 'PATCH', respuesta(200, { maxVersions: 20 })]
  ]);
  assert.strictEqual(await estadoSitio('t', 'sitio-x', pedir), 'encendido');
  await apagarSitio('t', 'sitio-x', 'prueba', pedir);
  const post = pedir.llamadas.find(l => l.metodo === 'POST');
  assert.deepStrictEqual(JSON.parse(post.cuerpo), { type: 'SITE_DISABLE', message: 'prueba' });
  assert.strictEqual(await limitarVersiones('t', 'sitio-x', 20, pedir), 20);
  assert.deepStrictEqual(JSON.parse(pedir.llamadas.find(l => l.metodo === 'PATCH').cuerpo), { maxVersions: 20 });

  const apagado = simulado([[(u) => u.endsWith('/sites/s/channels/live'), respuesta(200, { release: { type: 'SITE_DISABLE' } })]]);
  assert.strictEqual(await estadoSitio('t', 's', apagado), 'apagado');
  const sinSitio = simulado([[() => true, respuesta(404, {})]]);
  assert.strictEqual(await estadoSitio('t', 's', sinSitio), 'sin sitio');
  const sinPublicar = simulado([[(u) => u.endsWith('/channels/live'), respuesta(200, { name: 'sites/s/channels/live' })]]);
  assert.strictEqual(await estadoSitio('t', 's', sinPublicar), 'sin sitio');
  // El estado sale del canal en vivo, nunca del listado de publicaciones (no garantiza el orden).
  assert.ok(![pedir, apagado, sinPublicar].some(f => f.llamadas.some(l => /\/releases\?/.test(l.url))));
});

/* ===== Configuración de Firebase Hosting ===== */

test('firebase.json publica solo publicar/ en el sitio de la página, con los encabezados del kit', () => {
  const config = JSON.parse(leer('firebase.json'));
  const hosting = config.hosting;
  // Firebase publica SOLO la carpeta que arma la lista permitida, nunca la raíz:
  // en Actions la raíz tiene el archivo de credenciales gha-creds-*.json.
  assert.strictEqual(hosting.public, 'publicar');
  assert.strictEqual(hosting.site, 'salas-piso9-med');
  for (const patron of ['**/.*', '**/.*/**', '**/node_modules/**', '**/*.md']) assert.ok(hosting.ignore.includes(patron), patron);
  const encabezados = hosting.headers.find(h => h.source === '**').headers.map(h => `${h.key}: ${h.value}`);
  assert.ok(encabezados.includes('Cache-Control: no-cache'), 'la portada «/» también debe ir sin caché');
  assert.ok(encabezados.includes('X-Content-Type-Options: nosniff'));
  assert.ok(encabezados.includes('Referrer-Policy: strict-origin-when-cross-origin'));
  // Sin archivos de enlaces de apps móviles (.well-known/…): no hay apps.
  assert.strictEqual(hosting.appAssociation, 'NONE');
  // Sin reescrituras: una ruta que no existe debe dar 404, no la portada.
  assert.ok(!hosting.rewrites && !hosting.redirects);
  // Solo Hosting: la página no usa Firestore, funciones ni otros servicios de Firebase.
  assert.deepStrictEqual(Object.keys(config), ['hosting']);
  const rc = JSON.parse(leer('.firebaserc'));
  assert.strictEqual(rc.projects.default, 'salas-piso9-med');
  assert.match(leer('.gitignore'), /^publicar\/$/m);
});

/* ===== Lista permitida ===== */

// Rutas propias (relativas) de una lista de direcciones, sin «?v=» ni «#…».
const propias = (lista) => lista
  .filter(u => !/^(https?:)?\/\//.test(u) && !/^(#|mailto:|data:)/.test(u))
  .map(u => u.split(/[?#]/)[0])
  .map(u => (u === './' || u === '' ? 'index.html' : u.replace(/^\.\//, '')));

test('la lista permitida cubre todo lo que carga la página y nada más', () => {
  // Cada recurso propio de index.html (src/href relativos).
  const html = leer('index.html');
  const deIndex = propias([...html.matchAll(/\b(?:src|href)="([^"]+)"/g)].map(m => m[1]));
  assert.deepStrictEqual([...new Set(deIndex)].sort(),
    ['app.js', 'config.js', 'disponibilidad.js', 'logo-alcaldia-medellin.png', 'styles.css'],
    'index.html carga sus estilos, el logo, la configuración, los datos y el código');
  for (const u of deIndex) {
    assert.ok(!u.startsWith('/'), `${u}: las rutas deben ser relativas`);
    assert.ok(permitido(u), `${u} lo carga index.html y falta en la lista permitida`);
  }
  // Lo que app.js pide después: los datos con <script src> (disponibilidad.js cada 5 minutos y
  // uso.js al abrir Indicadores), lo que vuelve a pedir el botón «Recargar» (ARCHIVOS_PAGINA) y
  // cualquier fetch con una dirección escrita.
  const app = leer('app.js');
  const pedidos = [
    ...[...app.matchAll(/\.src\s*=\s*[`'"]([^`'"$?]+)/g)].map(m => m[1]),
    ...[...app.matchAll(/fetch\(\s*[`'"]([^`'"]+)[`'"]/g)].map(m => m[1])
  ];
  const recargar = /const ARCHIVOS_PAGINA = \[([^\]]*)\]/.exec(app);
  assert.ok(recargar, 'app.js define ARCHIVOS_PAGINA');
  pedidos.push(...[...recargar[1].matchAll(/'([^']*)'/g)].map(m => m[1]));
  const deApp = propias(pedidos);
  for (const u of ['disponibilidad.js', 'uso.js', 'index.html', 'styles.css', 'config.js', 'app.js']) {
    assert.ok(deApp.includes(u), `app.js debería pedir ${u} (¿cambió la forma de cargarlo?)`);
  }
  for (const u of deApp) assert.ok(permitido(u), `${u} lo pide app.js y falta en la lista permitida`);
  // config.js y styles.css no cargan archivos propios.
  assert.ok(!/url\(\s*['"]?(?!data:|https?:)/.test(leer('styles.css')), 'styles.css no debe cargar archivos propios');
  assert.ok(!/['"][\w./-]+\.(png|jpe?g|svg|js|css|json|html)['"]/.test(leer('config.js').replace(/https?:\/\/[^'"]+/g, '')),
    'config.js no debe nombrar archivos propios');
  // Nada de documentación, configuración, scripts ni ocultos.
  for (const rel of LISTA_PERMITIDA) {
    assert.ok(!rel.includes('/') && !rel.startsWith('.') && !rel.endsWith('.md'), rel);
    assert.ok(!['firebase.json', '.firebaserc', '_config.yml'].includes(rel), rel);
  }
  assert.deepStrictEqual(archivosPublicables(RAIZ), [...LISTA_PERMITIDA].sort(), 'todos los archivos de la lista existen');
});

test('publicar/ se arma desde cero solo con la lista: deja por fuera credenciales, registros, documentación y ocultos', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'publicar-'));
  const crear = (rel, texto = 'x') => { fs.mkdirSync(path.dirname(path.join(tmp, rel)), { recursive: true }); fs.writeFileSync(path.join(tmp, rel), texto); };
  for (const rel of [...LISTA_PERMITIDA, 'gha-creds-0123456789abcdef.json', 'publicacion.log', 'README.md',
                     'docs/correo-anuncio.html', 'btn-centrado-1280.png', 'firebase.json', '.firebaserc', '_config.yml',
                     'scripts/hosting.js', 'scripts/actualizar-disponibilidad.js', '.git/config', '.github/workflows/w.yml',
                     '.oculto.js', 'github-pages/index.html']) crear(rel);
  const esperado = [...LISTA_PERMITIDA].sort();
  assert.deepStrictEqual(archivosPublicables(tmp), esperado);
  crear('publicar/sobrante-de-antes.json');
  assert.deepStrictEqual(prepararPublicacion(tmp), esperado);
  assert.deepStrictEqual(fs.readdirSync(path.join(tmp, 'publicar')).sort(), esperado, 'publicar/ se rehace desde cero');
  // Un archivo de la lista que falta es un error: la aplicación saldría rota.
  fs.rmSync(path.join(tmp, 'app.js'));
  assert.throws(() => prepararPublicacion(tmp), /Faltan archivos de la lista permitida: app\.js/);
  fs.rmSync(tmp, { recursive: true, force: true });
});

/* ===== Revisión de lo publicado por la API ===== */

const V = 'sites/s/versions';
function hostingConVersiones(archivos, enVivo) {
  return simulado([
    [(u) => u.endsWith('/sites/s/channels/live'), respuesta(200, { release: enVivo })],
    [(u) => u.includes('/sites/s/versions?pageSize=100'), respuesta(200, { versions: Object.keys(archivos).map(name => ({ name, status: 'FINALIZED' })) })],
    [(u) => u.includes('/files?pageSize=100'), (u) => respuesta(200, { files: archivos[Object.keys(archivos).find(k => u.includes(`/${k}/files`))].map(p => ({ path: p })) })],
    [(u, o) => o.method === 'DELETE', respuesta(200, {})]
  ]);
}

test('revisar lo publicado: borra versiones viejas con archivos ajenos y no toca la actual', async () => {
  const archivos = { [`${V}/actual`]: ['/index.html', '/app.js'], [`${V}/filtrada`]: ['/index.html', '/gha-creds-0a1b.json', '/publicacion.log'],
                     [`${V}/vieja-buena`]: ['/index.html', '/styles.css'] };
  const pedir = hostingConVersiones(archivos, { type: 'DEPLOY', version: { name: `${V}/actual` } });
  const r = await revisarPublicado('t', 's', permitido, pedir);
  assert.strictEqual(r.actual, `${V}/actual`);
  assert.strictEqual(r.publicados, 2);
  assert.deepStrictEqual(r.ajenosActual, []);
  assert.deepStrictEqual(r.borradas, [{ version: `${V}/filtrada`, ajenos: ['gha-creds-0a1b.json', 'publicacion.log'] }]);
  assert.deepStrictEqual(r.revisadas.map(v => [v.version, v.archivos, v.ajenos]),
    [[`${V}/filtrada`, 3, 2], [`${V}/vieja-buena`, 2, 0]]);
  const borrados = pedir.llamadas.filter(l => l.metodo === 'DELETE').map(l => l.url);
  assert.deepStrictEqual(borrados, [`https://firebasehosting.googleapis.com/v1beta1/${V}/filtrada`]);
});

test('revisar lo publicado: avisa si la versión que se sirve tiene un archivo ajeno', async () => {
  const archivos = { [`${V}/v1`]: ['/index.html', '/README.md'] };
  const pedir = hostingConVersiones(archivos, { type: 'DEPLOY', version: { name: `${V}/v1` } });
  const r = await revisarPublicado('t', 's', permitido, pedir);
  assert.deepStrictEqual(r.ajenosActual, ['README.md']);
  assert.ok(!pedir.llamadas.some(l => l.metodo === 'DELETE'), 'la versión que se sirve no se borra: se apaga el sitio');
});

test('revisar lo publicado: acepta los dos archivos que agrega Firebase Hosting y nada más bajo __/', async () => {
  const archivos = { [`${V}/actual`]: ['/index.html', '/app.js', '/__/firebase/init.js', '/__/firebase/init.json'],
                     [`${V}/vieja`]: ['/index.html', '/__/firebase/init.js', '/__/firebase/init.json'],
                     [`${V}/rara`]: ['/index.html', '/__/firebase/otro.js'] };
  const pedir = hostingConVersiones(archivos, { type: 'DEPLOY', version: { name: `${V}/actual` } });
  const r = await revisarPublicado('t', 's', permitido, pedir);
  assert.strictEqual(r.publicados, 4);
  assert.deepStrictEqual(r.ajenosActual, [], 'la versión en vivo queda encendida');
  assert.deepStrictEqual(r.borradas, [{ version: `${V}/rara`, ajenos: ['__/firebase/otro.js'] }], 'la vieja buena se guarda para volver atrás');
});

test('revisar lo publicado con el sitio apagado: revisa y limpia todas las versiones', async () => {
  const archivos = { [`${V}/nueva`]: ['/index.html', '/app.js'], [`${V}/filtrada`]: ['/index.html', '/gha-creds-0a1b.json'] };
  // Lo que está en vivo es la publicación de apagado: no hay versión que proteger.
  const pedir = hostingConVersiones(archivos, { type: 'SITE_DISABLE' });
  const r = await revisarPublicado('t', 's', permitido, pedir);
  assert.strictEqual(r.actual, null);
  assert.deepStrictEqual(r.ajenosActual, []);
  assert.deepStrictEqual(r.borradas, [{ version: `${V}/filtrada`, ajenos: ['gha-creds-0a1b.json'] }]);
  assert.ok(!pedir.llamadas.some(l => /\/releases\?/.test(l.url)), 'la versión en vivo sale del canal, no del listado');
});

/* ===== Verificación en la dirección publicada ===== */

test('la verificación pide lo permitido y revisa que el resto del repositorio no se vea', () => {
  const { publicas, ocultas } = rutasEsperadas(RAIZ);
  assert.deepStrictEqual(publicas, ['', ...[...LISTA_PERMITIDA].sort()]);
  assert.ok(!ocultas.some(permitido), 'nada de la lista permitida puede estar entre las ocultas');
  for (const rel of ['README.md', 'docs/correo-anuncio.html', 'btn-centrado-1280.png', 'firebase.json', '.firebaserc',
                     '.gitignore', '_config.yml', '.git/config', '.git/HEAD', 'publicacion.log', 'assets/css/style.css',
                     '.github/workflows/publicar-aplicacion.yml', '.github/workflows/disponibilidad.yml',
                     'scripts/actualizar-disponibilidad.js', 'scripts/publicar-disponibilidad.sh',
                     'scripts/hosting.js', 'scripts/comunes.js', 'scripts/token-google.js', 'scripts/preparar-publicacion.js',
                     'scripts/verificar-publicacion.js', 'scripts/test/publicacion.test.js', 'scripts/test/disponibilidad.test.js',
                     'github-pages/index.html', 'github-pages/404.html']) {
    assert.ok(ocultas.includes(rel), `${rel} debe revisarse como oculta`);
  }
  assert.ok(!ocultas.some(r => /^gha-creds-/.test(r)), 'el nombre de la credencial de Actions no se pide ni se registra');
  assert.ok(!ocultas.some(r => r.startsWith('publicar/')));
});

test('la verificación falla si algo oculto se ve o falta el encabezado sin caché', async () => {
  const rutas = { publicas: ['', 'index.html'], ocultas: ['README.md', 'scripts/test/publicacion.test.js'] };
  const bien = simulado([
    [(u) => u.endsWith('.md') || u.includes('/scripts/'), respuesta(404, null)],
    [() => true, respuesta(200, null, { 'cache-control': 'no-cache', 'x-content-type-options': 'nosniff' })]
  ]);
  let r = await verificar('https://sitio.web.app', rutas, bien);
  assert.deepStrictEqual(r.fallas, []);
  assert.strictEqual(r.revisadas, 4);
  assert.ok(bien.llamadas.some(l => l.url === 'https://sitio.web.app/scripts/test/publicacion.test.js'));

  const expuesto = simulado([[() => true, respuesta(200, null, {})]]);
  r = await verificar('https://sitio.web.app', rutas, expuesto);
  assert.ok(r.fallas.some(f => f.includes('README.md NO debería publicarse')));
  assert.ok(r.fallas.some(f => f.includes('no-cache')));
  assert.ok(r.fallas.some(f => f.includes('nosniff')));
});

/* ===== Flujo «Publicar aplicación» ===== */

test('el flujo arma publicar/ antes de autenticarse y publica solo Hosting con versión fija', () => {
  const flujo = leer('.github/workflows/publicar-aplicacion.yml');
  const pos = (texto) => { const i = flujo.indexOf(texto); assert.ok(i >= 0, `falta «${texto}» en el flujo`); return i; };
  assert.ok(pos('node scripts/preparar-publicacion.js') < pos('google-github-actions/auth@'),
    'publicar/ debe quedar lista ANTES de que la autenticación deje la credencial en la carpeta de trabajo');
  assert.ok(pos('node --test scripts/test/*.test.js') < pos('google-github-actions/auth@'));
  assert.ok(pos('google-github-actions/auth@') < pos('firebase-tools@'));
  assert.match(flujo, /persist-credentials: false/);
  // La cabeza de main, también cuando lo llama «Actualizar disponibilidad» después de subir datos.
  assert.match(flujo, /uses: actions\/checkout@v\d+\n\s+with:\n\s+ref: main\n\s+persist-credentials: false/);
  assert.match(flujo, /node-version: '22'/);
  assert.match(flujo, /^permissions:\n {2}contents: read$/m);
  // Una publicación a la vez: la concurrencia va en el trabajo, para que valga también al llamarlo.
  assert.match(flujo, /^ {4}concurrency:\n {6}group: publicar-aplicacion\n {6}cancel-in-progress: false$/m);
  assert.ok(!/^concurrency:/m.test(flujo), 'sin concurrencia a nivel del flujo (se trabaría con la del trabajo)');
  assert.match(flujo, /timeout-minutes: \d+/);
  assert.match(flujo, /firebase-tools@\d+\.\d+\.\d+ deploy --only hosting/, 'versión fija y solo Hosting');
  assert.match(flujo, /--project salas-piso9-med/);
  assert.match(flujo, /--message "main \$\(git rev-parse --short HEAD\)"/, 'el mensaje nombra lo que de verdad se publicó');
  assert.match(flujo, /found \[0-9\]\+ files/, 'freno por conteo');
  assert.match(flujo, /hosting\.js apagar salas-piso9-med/);
  assert.match(flujo, /if \[ "\$sitio" != "salas-piso9-med" \]/, 'comprueba el sitio publicado');
  assert.match(flujo, /hosting\.js versiones "\$\{\{ steps\.publicar\.outputs\.sitio \}\}" 20/);
  assert.match(flujo, /hosting\.js revisar/);
  assert.match(flujo, /verificar-publicacion\.js "\$\{\{ steps\.publicar\.outputs\.url \}\}"/);
  assert.match(flujo, /workflow_dispatch:/);
  assert.match(flujo, /workflow_call:\n\s+secrets:\n\s+FIREBASE_SERVICE_ACCOUNT:\n\s+required: true/);
  // Un cambio en cualquier archivo de la página vuelve a publicar.
  const rutas = [...flujo.matchAll(/^ {6}- '([^']+)'$/gm)].map(m => m[1]);
  for (const rel of [...LISTA_PERMITIDA, 'firebase.json', '.firebaserc', '.github/workflows/publicar-aplicacion.yml',
                     'scripts/preparar-publicacion.js', 'scripts/verificar-publicacion.js', 'scripts/hosting.js',
                     'scripts/token-google.js', 'scripts/comunes.js', 'scripts/test/publicacion.test.js']) {
    assert.ok(rutas.includes(rel), `${rel} debe disparar la publicación`);
  }
});

test('«Actualizar disponibilidad» llama a «Publicar aplicación» cada vez que sube datos', () => {
  const flujo = leer('.github/workflows/disponibilidad.yml');
  // Los push hechos con el GITHUB_TOKEN no disparan otros flujos: sin esta llamada, los datos
  // nuevos no llegarían a Firebase Hosting.
  for (const [trabajo, previo, salida] of [['publicar', 'actualizar', 'actualizar'], ['publicar-releido', 'releer', 'releer']]) {
    const i = flujo.indexOf(`\n  ${trabajo}:\n`);
    assert.ok(i >= 0, `falta el trabajo ${trabajo}`);
    const cuerpo = flujo.slice(i, flujo.indexOf('\n\n', i + 1) === -1 ? undefined : flujo.indexOf('\n\n', i + 1));
    assert.match(cuerpo, new RegExp(`needs: ${previo}\\n`));
    assert.match(cuerpo, new RegExp(`if: \\$\\{\\{ !cancelled\\(\\) && needs\\.${salida}\\.outputs\\.subido == 'true' \\}\\}`));
    assert.match(cuerpo, /permissions:\n {6}contents: read/);
    assert.match(cuerpo, /uses: \.\/\.github\/workflows\/publicar-aplicacion\.yml/);
    // Solo el secreto de la cuenta de servicio, no todos los del repositorio.
    assert.match(cuerpo, /secrets:\n {6}FIREBASE_SERVICE_ACCOUNT: \$\{\{ secrets\.FIREBASE_SERVICE_ACCOUNT \}\}/);
  }
  assert.ok(!/secrets: inherit/.test(flujo));
  assert.match(flujo, /outputs:\n {6}subido: \$\{\{ steps\.leer\.outputs\.subido \}\}/);
  assert.match(flujo, /outputs:\n {6}subido: \$\{\{ steps\.releer\.outputs\.subido \}\}/);
  // La segunda lectura sigue siendo solo para el aviso del flujo de reservas.
  assert.match(flujo, /releer:\n {4}needs: actualizar\n {4}if: \$\{\{ !cancelled\(\) && github\.event_name == 'repository_dispatch' && github\.event\.action == 'actualizar-disponibilidad' \}\}/);
});

/* ===== GitHub Pages mientras dura el cambio (fase C) ===== */

test('GitHub Pages publica solo la página y sus datos: lo demás de la raíz está excluido en _config.yml', () => {
  const config = leer('_config.yml');
  const excluidos = [...config.matchAll(/^ {2}- (\S+)$/gm)].map(m => m[1]);
  // La página sigue en github.io hasta la fase F: nada de la lista permitida se excluye.
  for (const rel of LISTA_PERMITIDA) assert.ok(!excluidos.includes(rel), `${rel} todavía se publica en GitHub Pages`);
  for (const rel of ['README.md', 'docs', 'btn-centrado-1280.png', 'firebase.json', 'scripts', 'publicar']) {
    assert.ok(excluidos.includes(rel), `${rel} debe quedar fuera de GitHub Pages`);
  }
  // Todo lo de la raíz que no es de la página está excluido (los ocultos y los que empiezan
  // con «_» los deja por fuera Jekyll). Así, un archivo nuevo no se publica sin querer.
  for (const e of fs.readdirSync(RAIZ)) {
    if (e.startsWith('.') || e.startsWith('_') || e === 'publicar' || e === 'node_modules') continue;
    assert.ok(permitido(e) || excluidos.includes(e), `${e} no es de la página y debe estar en el exclude de _config.yml`);
  }
});
