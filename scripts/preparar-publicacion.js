'use strict';
/* ============================================================================
   PREPARAR LA CARPETA publicar/ PARA FIREBASE HOSTING (lista permitida)
   ----------------------------------------------------------------------------
   Firebase Hosting publica la carpeta publicar/ (firebase.json → hosting.public).
   Este script la arma desde cero copiando SOLO los archivos que el navegador
   carga, nombrados uno por uno en LISTA_PERMITIDA: la página, sus estilos, su
   configuración, su código, el logo y los dos archivos de datos que escribe la
   tarea programada (disponibilidad.js y uso.js).

   Nada más puede colarse: ni la documentación (.md, docs/), ni firebase.json,
   ni scripts/, ni lo que GitHub Actions deja en la carpeta de trabajo (por
   ejemplo, el archivo de credenciales gha-creds-*.json que crea la
   autenticación de Google).

   Si la página empieza a cargar un archivo nuevo, hay que agregarlo aquí (lo
   revisa scripts/test/publicacion.test.js) y en las rutas del flujo
   .github/workflows/publicar-aplicacion.yml.

   Uso:  node scripts/preparar-publicacion.js        (deja publicar/ lista)

   Estructura del archivo:
     1. Lista permitida
     2. Copia
     3. Línea de comandos
   ============================================================================ */

const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..');
const DESTINO = 'publicar';

/* ===== 1. Lista permitida ===== */

// Todos en la raíz del repositorio: la aplicación es una sola página.
const LISTA_PERMITIDA = [
  'index.html',
  'styles.css',
  'config.js',
  'app.js',
  'disponibilidad.js',            // horas ocupadas de cada sala (lo escribe la tarea programada)
  'uso.js',                       // historial de la pestaña Indicadores (lo escribe la tarea programada)
  'logo-alcaldia-medellin.png'
];

const permitido = (rel) => LISTA_PERMITIDA.includes(rel);

/* Rutas de la lista que existen en la raíz, en orden. */
function archivosPublicables(raiz = RAIZ) {
  return LISTA_PERMITIDA
    .filter(rel => { try { return fs.statSync(path.join(raiz, rel)).isFile(); } catch (e) { return false; } })
    .sort();
}

/* ===== 2. Copia ===== */

function prepararPublicacion(raiz = RAIZ) {
  // Un archivo de la lista que no está es un error, no un olvido silencioso: la
  // página saldría rota en la dirección nueva.
  const lista = archivosPublicables(raiz);
  const faltan = LISTA_PERMITIDA.filter(rel => !lista.includes(rel));
  if (faltan.length) throw new Error(`Faltan archivos de la lista permitida: ${faltan.join(', ')}.`);
  const destino = path.join(raiz, DESTINO);
  fs.rmSync(destino, { recursive: true, force: true });
  fs.mkdirSync(destino, { recursive: true });
  for (const rel of lista) fs.copyFileSync(path.join(raiz, rel), path.join(destino, rel));
  return lista;
}

/* ===== 3. Línea de comandos ===== */

if (require.main === module) {
  try {
    const lista = prepararPublicacion();
    console.log(`publicar/ lista con ${lista.length} archivos:`);
    for (const f of lista) console.log('  ' + f);
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}

module.exports = { archivosPublicables, prepararPublicacion, permitido, LISTA_PERMITIDA, DESTINO };
