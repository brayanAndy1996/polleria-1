---
name: project-test-db-guard-gap
description: La guardia assertTestDatabase solo valida nombre + database/dbname; Sequelize honra ?host= y ?options= de la misma URL
metadata:
  type: project
---

`assertTestDatabase` / `getTestDatabaseName` (apps/api/src/db/) solo inspeccionan el NOMBRE de la base (path de la URL) y rechazan los parámetros `database` y `dbname`. Pero Sequelize 6, al construir la conexión desde la MISMA URL, honra otros parámetros de query que la guardia nunca mira:
- `?host=otro` redirige la conexión a otro servidor (Sequelize hace `options.host = urlParts.query.host`).
- `?options=-c search_path=...` inyecta opciones de libpq (cambia el esquema activo).

La segunda barrera (`SELECT current_database()` en assertConnectedToTestDatabase) tampoco lo detecta, porque el nombre de la base sigue siendo `polleria_test`.

**Why:** Sequelize usa el `url.parse` heredado y luego mezcla la query en dialectOptions; AC-11 definió la "regla exacta" de la guardia solo contra `database`/`dbname`, así que este hueco es un gap de diseño, no un bug contra un AC. Demostrado en apps/api/tests/adversarial/test-database-guard.adversarial.test.ts (ADV-001-04 y ADV-001-05).

**How to apply:** En specs futuras que toquen la base de pruebas, este riesgo sigue vigente hasta que la guardia valide (o rechace) host/options/service. Reatácalo si cambia assert-test-database.ts o si se agrega conexión a otra base. Relacionado: [[project-adversarial-findings-001]].
