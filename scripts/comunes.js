'use strict';
/* Solo leerCredencial (extracto de scripts/comunes.js de ContratosParticipa),
   que usan token-google.js y, por él, hosting.js. Lee la
   cuenta de servicio del secreto FIREBASE_SERVICE_ACCOUNT sin imprimir nunca
   su contenido; si no la puede leer, solo da un diagnóstico de forma. */

function leerCredencial() {
  const bruto = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!bruto || !bruto.trim()) {
    throw new Error('Falta la variable FIREBASE_SERVICE_ACCOUNT. ' +
                    'Debe estar configurada como secret del repositorio en GitHub.');
  }

  let texto = bruto.trim().replace(/^﻿/, '');
  if ((texto.startsWith('"') && texto.endsWith('"')) ||
      (texto.startsWith("'") && texto.endsWith("'"))) {
    texto = texto.slice(1, -1).trim();
  }

  const intentos = [texto];
  if (!texto.startsWith('{') && /^[A-Za-z0-9+/=\s]+$/.test(texto)) {
    try { intentos.push(Buffer.from(texto, 'base64').toString('utf8').trim()); } catch (e) {}
  }

  for (const intento of intentos) {
    try {
      const o = JSON.parse(intento);
      if (o && o.private_key && o.client_email) return o;
    } catch (e) { /* se prueba el siguiente */ }
  }

  console.error('');
  console.error('Diagnóstico del secreto (sin revelar su contenido):');
  console.error(`  longitud:          ${texto.length} caracteres`);
  console.error(`  primer carácter:   ${JSON.stringify(texto[0])}`);
  console.error(`  último carácter:   ${JSON.stringify(texto[texto.length - 1])}`);
  console.error(`  empieza por "{":   ${texto.startsWith('{') ? 'sí' : 'NO'}`);
  console.error(`  contiene "private_key": ${texto.includes('private_key') ? 'sí' : 'NO'}`);
  console.error('');
  throw new Error('FIREBASE_SERVICE_ACCOUNT no se pudo leer como credencial de cuenta de servicio.');
}

module.exports = { leerCredencial };
