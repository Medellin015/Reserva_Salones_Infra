#!/usr/bin/env bash
# Lee los calendarios y, si disponibilidad.js o uso.js cambiaron, hace commit y push a la rama
# actual. Lo usa .github/workflows/disponibilidad.yml; se puede llamar varias veces en la misma
# ejecución.
set -euo pipefail
node scripts/actualizar-disponibilidad.js
if git diff --quiet -- disponibilidad.js uso.js; then
  echo "Sin cambios: no hay nada que publicar."
  exit 0
fi
git config user.name "github-actions[bot]"
git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
git add disponibilidad.js uso.js
git commit -m "Disponibilidad: $(TZ=America/Bogota date '+%d/%m/%Y %H:%M')"
# Si mientras tanto alguien subió algo a la rama, se trae antes de subir.
for intento in 1 2 3; do
  git pull --rebase origin "$RAMA" && git push origin "HEAD:$RAMA" && exit 0
  sleep $((intento * 5))
done
echo "::error::No se pudieron subir disponibilidad.js y uso.js"
exit 1
