'use strict';
/* Pruebas de scripts/publicar-disponibilidad.sh, el que sube los datos de la tarea programada:
   cuando sube algo deja «subido=true» en la salida del paso, que es lo que hace que
   «Actualizar disponibilidad» llame a «Publicar aplicación»; cuando no cambió nada, no.
   Corren el script de verdad en un repositorio de prueba (con su remoto) en una carpeta
   temporal, con un actualizar-disponibilidad.js simulado. No salen a internet.

   Uso:  node --test scripts/test/*.test.js */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const RAIZ = path.join(__dirname, '..', '..');

/* Un repositorio de prueba con disponibilidad.js y uso.js, publicado en un remoto local. */
function repositorioDePrueba() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'disponibilidad-'));
  const git = (dir, ...args) => execFileSync('git', ['-c', 'user.name=Prueba', '-c', 'user.email=prueba@ejemplo.org', ...args], { cwd: dir, stdio: 'pipe' }).toString();
  const remoto = path.join(tmp, 'remoto.git');
  const trabajo = path.join(tmp, 'trabajo');
  fs.mkdirSync(trabajo);
  git(tmp, 'init', '-q', '--bare', '-b', 'main', remoto);
  git(trabajo, 'init', '-q', '-b', 'main');
  fs.writeFileSync(path.join(trabajo, 'disponibilidad.js'), 'window.DISPONIBILIDAD = { "v": 1 };\n');
  fs.writeFileSync(path.join(trabajo, 'uso.js'), 'window.USO = { "v": 1 };\n');
  fs.mkdirSync(path.join(trabajo, 'scripts'));
  fs.copyFileSync(path.join(RAIZ, 'scripts', 'publicar-disponibilidad.sh'), path.join(trabajo, 'scripts', 'publicar-disponibilidad.sh'));
  // Simula la lectura de los calendarios: escribe en disponibilidad.js lo que diga NUEVO_CONTENIDO.
  fs.writeFileSync(path.join(trabajo, 'scripts', 'actualizar-disponibilidad.js'),
    "if (process.env.NUEVO_CONTENIDO) require('fs').writeFileSync('disponibilidad.js', process.env.NUEVO_CONTENIDO);\n");
  git(trabajo, 'add', '.');
  git(trabajo, 'commit', '-q', '-m', 'Inicio');
  git(trabajo, 'remote', 'add', 'origin', remoto);
  git(trabajo, 'push', '-q', 'origin', 'main');
  const salida = path.join(tmp, 'salida.txt');
  fs.writeFileSync(salida, '');
  const correr = (nuevo) => execFileSync('bash', ['scripts/publicar-disponibilidad.sh'], {
    cwd: trabajo, stdio: 'pipe',
    env: { ...process.env, RAMA: 'main', GITHUB_OUTPUT: salida, NUEVO_CONTENIDO: nuevo || '', ESPERA_REINTENTO: '0' }
  }).toString();
  return { tmp, remoto, trabajo, salida, git, correr };
}

test('sin cambios en los datos no sube nada ni pide publicar', () => {
  const r = repositorioDePrueba();
  const texto = r.correr('');
  assert.match(texto, /Sin cambios/);
  assert.strictEqual(fs.readFileSync(r.salida, 'utf8'), '', 'no debe dejar subido=true');
  assert.strictEqual(r.git(r.remoto, 'log', '--format=%s', 'main').trim(), 'Inicio');
  fs.rmSync(r.tmp, { recursive: true, force: true });
});

test('con datos nuevos los sube a la rama y deja subido=true para publicar', () => {
  const r = repositorioDePrueba();
  r.correr('window.DISPONIBILIDAD = { "v": 2 };\n');
  assert.match(fs.readFileSync(r.salida, 'utf8'), /^subido=true$/m);
  const historia = r.git(r.remoto, 'log', '--format=%s', 'main').trim().split('\n');
  assert.strictEqual(historia.length, 2);
  assert.match(historia[0], /^Disponibilidad: \d{2}\/\d{2}\/\d{4} \d{2}:\d{2}$/);
  assert.strictEqual(r.git(r.remoto, 'show', 'main:disponibilidad.js'), 'window.DISPONIBILIDAD = { "v": 2 };\n');
  // Una segunda lectura sin cambios no vuelve a pedir publicar.
  fs.writeFileSync(r.salida, '');
  r.correr('window.DISPONIBILIDAD = { "v": 2 };\n');
  assert.strictEqual(fs.readFileSync(r.salida, 'utf8'), '');
  fs.rmSync(r.tmp, { recursive: true, force: true });
});

test('si no puede subir, falla y no pide publicar', () => {
  const r = repositorioDePrueba();
  // Un remoto que ya no existe: el push falla en los tres intentos.
  r.git(r.trabajo, 'remote', 'set-url', 'origin', path.join(r.tmp, 'no-existe.git'));
  assert.throws(() => r.correr('window.DISPONIBILIDAD = { "v": 3 };\n'), (e) => {
    assert.match(String(e.stdout) + String(e.stderr), /No se pudieron subir disponibilidad\.js y uso\.js/);
    return true;
  });
  assert.strictEqual(fs.readFileSync(r.salida, 'utf8'), '', 'sin push no hay nada que publicar');
  fs.rmSync(r.tmp, { recursive: true, force: true });
});
