# Primer bloque de CSS Modules: Mesas

Autorización: el usuario aprobó CSS Modules y pidió comenzar el 2026-10-19.
Refactor interno, sin comportamiento nuevo ni rediseño. Solo Pollería.

## Alcance

- Conservar Next.js, React, Tailwind 4 y HeroUI, sin nuevas dependencias.
- Migrar exclusivamente tablero y tarjetas de `/mozo` a
  `frontend/src/app/mozo/page.module.css` y conectarlo a `page.tsx`.
- Consolidar las reglas `.salon-board` dispersas de `globals.css`, respetando
  el resultado de su cascada actual: geometría, tipografía Nunito, colores,
  hover, foco, breakpoint 640px y movimiento reducido.
- Mantener globales los tokens, framework, chrome compartido y etiquetas
  semánticas de color. Atención de comandas, login, detalle y compositor no
  se migran en este bloque. Documentar la continuación por superficies.

## Criterios de aceptación

- AC-M01: el tablero y sus tarjetas consumen clases de un CSS Module real,
  sin conservar la clase global `salon-board` como alias ni introducir Sass.
- AC-M02: `globals.css` deja de contener estilos `.salon-board`; cualquier
  excepción del tratamiento global de listas usa un atributo semántico
  estable (`data-layout="table-board"`), nunca un nombre de clase generado.
  No añadir wrappers que cambien selectores del chrome o de comandas.
- AC-M03: los cuatro estados conservan sus etiquetas y colores; mesa libre,
  ocupada, lista y cuenta mantienen su apariencia actual. Las marcas de
  unión, cuenta y anulación permanecen. No cambiar reglas ni esquemas de datos.
- AC-M04: conservar enlaces, filtrado de mesas inactivas, permisos, polling,
  estados de carga/error/vacío, reintento y accesibilidad. Reutilizar las
  regresiones funcionales existentes; no debilitarlas.
- AC-M05: comparar antes/después en Chromium a 360, 390, 768 y 1440 px,
  cuatro estados, nombres largos, foco y movimiento reducido. Sin overflow
  nuevo ni diferencias visuales involuntarias. Capturas con API simulada
  exclusivamente en el navegador, sin datos ni sesiones reales.
- AC-M06: sin cambios en backend, shared, contratos, dependencias ni locks.
  Sin migraciones, seeds, escrituras DB, commits, merge ni push.
- AC-M07: pruebas web dirigidas y completas, tipos y lint pasan; build
  frontend válido. Reportar límites reales sin atribuir auditoría independiente.

## Organización de estilos

- Global: tokens/base, importaciones Tailwind/HeroUI y chrome común.
- Módulo local: tablero, tarjeta, nombre, detalle y estados visuales propios.
- Clases semánticas compartidas pueden permanecer para etiquetas de estado;
  un atributo de estado derivado de `table.state` puede estilizar el fondo sin
  alterar el dominio. No duplicar control de permisos o lógica de negocio.
- Evitar `@apply`, importaciones de Tailwind en cada módulo y nuevos
  `!important` si la especificidad local basta. No reemplazar utilidades
  ajenas ni cambiar la paleta como parte de la extracción.

## Método

Principal: spec/documentación, captura baseline, revisión y verificación.
Test-writer Luna medium: regresiones acotadas, rojo causal y verde.
Implementer Luna medium: producción exclusivamente tras evidencia de rojo.
Sin reviewer ni auditoría adversarial independientes; conservar regresiones.

