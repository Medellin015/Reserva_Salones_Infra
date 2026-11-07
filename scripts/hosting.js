'use strict';
/* ============================================================================
   FIREBASE HOSTING POR SU API — estado, freno y versiones guardadas
   ----------------------------------------------------------------------------
   Lo usa el flujo «Publicar aplicación» (guardar solo las últimas versiones,
   revisar lo publicado y apagar el sitio si se coló un archivo ajeno).

   Uso por línea de comandos (en GitHub Actions, con FIREBASE_SERVICE_ACCOUNT):
     node scripts/hosting.js versiones <sitio> [n]   deja guardadas n versiones (20)
     node scripts/hosting.js estado <sitio>          dice si el sitio está encendido
     node scripts/hosting.js revisar <sitio>         compara lo publicado con la lista
                                                     permitida y borra las versiones
                                                     viejas que tengan archivos ajenos;
                                                     si la versión en vivo tiene alguno,
                                                     APAGA el sitio
     node scripts/hosting.js apagar <sitio> [motivo] apaga el sitio

   La versión en vivo se lee del canal «live» del sitio, como hace
   firebase-tools: el listado de publicaciones del sitio no garantiza el
   orden y mezcla los canales de vista previa.

   Firebase Hosting agrega por su cuenta dos archivos a cada versión, en sus
   direcciones reservadas: __/firebase/init.js y __/firebase/init.json (la
   configuración pública de la app web). No salen de publicar/ ni los sube
   firebase-tools, así que la revisión los acepta; solo esos dos.

   El sitio se vuelve a encender publicando de nuevo (flujo «Publicar
   aplicación»): toda publicación nueva reemplaza la de apagado.

   Estructura del archivo:
     1. Llamadas a la API
     2. Publicación en vivo, estado, apagado y versiones
     3. Archivos publicados y versiones con archivos ajenos
     4. Línea de comandos
   ============================================================================ */

const API = 'https://firebasehosting.googleapis.com/v1beta1';

/* ===== 1. Llamadas a la API ===== */

async function llamar(token, url, opciones = {}, pedir = fetch) {
  const r = await pedir(url, {
    ...opciones,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(opciones.headers || {}) }
  });
  let cuerpo = null;
  try { cuerpo = await r.json(); } catch (e) { /* sin cuerpo */ }
  return { ok: r.ok, estado: r.status, cuerpo };
}

/* ===== 2. Publicación en vivo, estado, apagado y versiones ===== */

/* La publicación que sirve el canal en vivo, o null si el sitio no existe o
   nunca se ha publicado. */
async function publicacionEnVivo(token, sitio, pedir) {
  const r = await llamar(token, `${API}/sites/${encodeURIComponent(sitio)}/channels/live`, {}, pedir);
  if (r.estado === 404) return null;
  if (!r.ok) throw new Error(`Hosting no respondió la publicación en vivo del sitio ${sitio} (HTTP ${r.estado}).`);
  return (r.cuerpo && r.cuerpo.release) || null;
}

/* 'encendido', 'apagado' (lo que está en vivo es la publicación de apagado)
   o 'sin sitio'. */
async function estadoSitio(token, sitio, pedir) {
  const enVivo = await publicacionEnVivo(token, sitio, pedir);
  if (!enVivo) return 'sin sitio';
  return enVivo.type === 'SITE_DISABLE' ? 'apagado' : 'encendido';
}

/* Publica una versión de apagado: el sitio deja de servir las páginas (y de
   gastar tráfico) hasta la próxima publicación. */
async function apagarSitio(token, sitio, motivo, pedir) {
  const r = await llamar(token, `${API}/sites/${encodeURIComponent(sitio)}/releases`, {
    method: 'POST',
    body: JSON.stringify({ type: 'SITE_DISABLE', message: String(motivo || 'Vigía de costos').slice(0, 500) })
  }, pedir);
  if (!r.ok) throw new Error(`No se pudo apagar el sitio ${sitio} (HTTP ${r.estado}). ` +
    'La cuenta de servicio necesita el rol «Administrador de Firebase Hosting».');
  return true;
}

/* Cuántas versiones anteriores guarda Firebase (para volver atrás). */
async function limitarVersiones(token, sitio, n = 20, pedir) {
  const r = await llamar(token, `${API}/sites/${encodeURIComponent(sitio)}/config?updateMask=maxVersions`, {
    method: 'PATCH',
    body: JSON.stringify({ maxVersions: n })
  }, pedir);
  if (!r.ok) throw new Error(`No se pudo fijar el número de versiones del sitio ${sitio} (HTTP ${r.estado}).`);
  return n;
}

/* ===== 3. Archivos publicados y versiones con archivos ajenos ===== */

/* Lista paginada de la API (campo «clave» de cada página). */
async function todas(token, url, clave, pedir) {
  const salida = [];
  let pagina = '';
  do {
    const sep = url.includes('?') ? '&' : '?';
    const r = await llamar(token, `${url}${sep}pageSize=100${pagina ? '&pageToken=' + encodeURIComponent(pagina) : ''}`, {}, pedir);
    if (!r.ok) throw new Error(`Hosting respondió HTTP ${r.estado} al listar ${clave}.`);
    salida.push(...((r.cuerpo && r.cuerpo[clave]) || []));
    pagina = (r.cuerpo && r.cuerpo.nextPageToken) || '';
  } while (pagina);
  return salida;
}

/* Nombre de la versión que el sitio sirve ahora (null si está apagado o
   nunca se ha publicado). */
async function versionActual(token, sitio, pedir) {
  const enVivo = await publicacionEnVivo(token, sitio, pedir);
  if (!enVivo || enVivo.type === 'SITE_DISABLE') return null;
  return (enVivo.version && enVivo.version.name) || null;
}

/* Los que agrega Firebase Hosting a cada versión (ver el encabezado). */
const DE_HOSTING = new Set(['__/firebase/init.js', '__/firebase/init.json']);

/* Rutas (sin «/» inicial) de los archivos de una versión. */
async function archivosDeVersion(token, nombreVersion, pedir) {
  const files = await todas(token, `${API}/${nombreVersion}/files`, 'files', pedir);
  return files.map(f => String(f.path || '').replace(/^\/+/, '')).filter(Boolean).sort();
}

/* Compara la versión en vivo con la lista permitida y borra las versiones
   VIEJAS que tengan algún archivo fuera de ella (por ejemplo, una credencial
   o un registro que se hubiera colado). Devuelve las rutas encontradas, nunca
   el contenido de los archivos. */
async function revisarPublicado(token, sitio, permitido, pedir) {
  const ajeno = (f) => !DE_HOSTING.has(f) && !permitido(f);
  const actual = await versionActual(token, sitio, pedir);
  const enActual = actual ? await archivosDeVersion(token, actual, pedir) : [];
  const ajenosActual = enActual.filter(ajeno);
  const revisadas = [];
  const borradas = [];
  const versiones = await todas(token, `${API}/sites/${encodeURIComponent(sitio)}/versions`, 'versions', pedir);
  for (const v of versiones) {
    if (!v.name || v.name === actual || v.status === 'DELETED' || v.status === 'ABANDONED') continue;
    const archivos = await archivosDeVersion(token, v.name, pedir);
    const ajenos = archivos.filter(ajeno);
    revisadas.push({ version: v.name, estado: v.status || '', archivos: archivos.length, ajenos: ajenos.length });
    if (!ajenos.length) continue;
    const r = await llamar(token, `${API}/${v.name}`, { method: 'DELETE' }, pedir);
    if (!r.ok) throw new Error(`No se pudo borrar la versión ${v.name} (HTTP ${r.estado}).`);
    borradas.push({ version: v.name, ajenos });
  }
  return { actual, publicados: enActual.length, ajenosActual, revisadas, borradas };
}

/* Hasta 20 rutas, para el registro del flujo. */
const muestra = (rutas) => rutas.slice(0, 20).map(r => r.slice(0, 200)).join(', ') +
  (rutas.length > 20 ? ` y ${rutas.length - 20} más` : '');

/* ===== 4. Línea de comandos ===== */

if (require.main === module) {
  (async () => {
    const [accion, sitio, n] = process.argv.slice(2);
    if (!sitio || !/^[a-z0-9-]+$/.test(sitio)) throw new Error('Falta el nombre del sitio (p. ej. salas-piso9-med).');
    const { tokenDeAcceso } = require('./token-google');
    const token = await tokenDeAcceso();
    if (accion === 'versiones') {
      const k = await limitarVersiones(token, sitio, Number(n) || 20);
      console.log(`El sitio ${sitio} guarda ahora las últimas ${k} versiones.`);
    } else if (accion === 'estado') {
      console.log(`El sitio ${sitio} está ${await estadoSitio(token, sitio)}.`);
    } else if (accion === 'revisar') {
      const { permitido } = require('./preparar-publicacion');
      const r = await revisarPublicado(token, sitio, permitido);
      // Solo rutas, cantidades y nombres de versión: nunca el contenido de un archivo.
      console.log(`Versión en vivo: ${r.actual || 'ninguna (sitio apagado o sin publicar)'} con ${r.publicados} archivos.`);
      console.log(`Otras versiones guardadas: ${r.revisadas.length}.`);
      for (const v of r.revisadas) console.log(`  · ${v.version} (${v.estado}): ${v.archivos} archivos, ${v.ajenos} fuera de la lista`);
      for (const b of r.borradas) {
        console.log(`Borré la versión vieja ${b.version}: tenía ${b.ajenos.length} archivo(s) fuera de la lista permitida: ${muestra(b.ajenos)}.`);
      }
      if (r.ajenosActual.length) {
        await apagarSitio(token, sitio, 'Publicación con archivos fuera de la lista permitida');
        console.error(`La versión en vivo tenía ${r.ajenosActual.length} archivo(s) fuera de la lista permitida ` +
                      `(${muestra(r.ajenosActual)}): APAGUÉ el sitio.`);
        process.exit(1);
      }
      console.log('Lo publicado coincide con la lista permitida.');
    } else if (accion === 'apagar') {
      await apagarSitio(token, sitio, n || 'Apagado a mano');
      console.log(`Apagué el sitio ${sitio}.`);
    } else {
      throw new Error('Acción desconocida. Use: versiones <sitio> [n] | estado <sitio> | revisar <sitio> | apagar <sitio> [motivo]');
    }
  })().catch(e => { console.error(e.message); process.exit(1); });
}

module.exports = { estadoSitio, apagarSitio, limitarVersiones, publicacionEnVivo, versionActual, archivosDeVersion, revisarPublicado, DE_HOSTING, API };
