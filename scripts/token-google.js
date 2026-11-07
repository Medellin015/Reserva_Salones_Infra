'use strict';
/* ============================================================================
   TOKEN DE ACCESO DE GOOGLE CON LA CUENTA DE SERVICIO — sin dependencias
   ----------------------------------------------------------------------------
   Lo usa el flujo «Publicar aplicación» (scripts/hosting.js) para llamar a la
   API de Firebase Hosting sin instalar paquetes:
   arma el JWT de la cuenta de servicio, lo firma con crypto de Node y lo
   cambia por un token de acceso que dura una hora.

   La credencial sale del secreto FIREBASE_SERVICE_ACCOUNT (leerCredencial de
   comunes.js). Nunca se imprimen la llave ni el token.

   Estructura del archivo:
     1. Firma del JWT
     2. Cambio del JWT por el token de acceso
   ============================================================================ */

const crypto = require('crypto');
const { leerCredencial } = require('./comunes');

const ALCANCE = 'https://www.googleapis.com/auth/cloud-platform';
const URL_TOKEN = 'https://oauth2.googleapis.com/token';

/* ===== 1. Firma del JWT ===== */

const base64url = (x) => Buffer.from(x).toString('base64')
  .replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');

/* JWT firmado con la llave privada de la cuenta de servicio (RS256), válido
   por una hora, para pedir el alcance cloud-platform. */
function armarJWT(cred, ahora = Math.floor(Date.now() / 1000)) {
  const cabecera = { alg: 'RS256', typ: 'JWT' };
  if (cred.private_key_id) cabecera.kid = cred.private_key_id;
  const datos = {
    iss: cred.client_email,
    scope: ALCANCE,
    aud: cred.token_uri || URL_TOKEN,
    iat: ahora,
    exp: ahora + 3600
  };
  const base = `${base64url(JSON.stringify(cabecera))}.${base64url(JSON.stringify(datos))}`;
  const firma = crypto.createSign('RSA-SHA256').update(base).sign(cred.private_key);
  return `${base}.${base64url(firma)}`;
}

/* ===== 2. Cambio del JWT por el token de acceso ===== */

async function tokenDeAcceso(cred = leerCredencial(), pedir = fetch) {
  const r = await pedir(cred.token_uri || URL_TOKEN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: armarJWT(cred)
    }).toString()
  });
  let j = {};
  try { j = await r.json(); } catch (e) { /* sin cuerpo legible */ }
  if (!r.ok || !j.access_token) {
    // Solo el código de error de Google (p. ej. invalid_grant): nunca la llave.
    throw new Error(`Google no entregó el token de acceso (HTTP ${r.status}` +
                    `${j.error ? ', ' + j.error : ''}). Revise el secreto FIREBASE_SERVICE_ACCOUNT.`);
  }
  return j.access_token;
}

module.exports = { armarJWT, tokenDeAcceso, ALCANCE };
