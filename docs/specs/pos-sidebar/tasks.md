# Sidebar POS — tareas

- [x] Referencia analizada y primer bloque autorizado por el usuario.
- [x] Alcance, accesibilidad y adaptación por permisos definidos.
- [x] T-01: test-writer añade/registra rojo causal y adapta expectativas visuales.
- [x] I-01: implementer conecta sidebar/drawer y ajusta ancho disponible.
- [x] R-01: revisión del principal y recorrido responsive con API simulada.
- [x] V-01: tests frontend, tipos, lint y build.
- [x] D-01: documentación de cierre y siguiente bloque.

No hay revisión/auditoría independientes. No usar DB ni modificar backend.
Rama actual `feat/pos-figma-v1`; trabajo previo sin commit conservado.

## Rojo y preparación

- Test-writer Luna medium ejecutó antes de producción:
  `pnpm exec vitest run --project web frontend/src/components/auth/navigation-accessibility.test.tsx frontend/src/components/auth/auth.test.tsx frontend/src/app/admin/carta/page.test.tsx --testNamePattern='AC-S01|AC-S02|AC-S03|AC-P05|AC-06: cada fila' --maxWorkers=2`.
  Seis fallos causales: sidebar/nav y subnav compartidas ausentes, drawer y
  trigger ausentes, expectativas de navegación nueva aún no satisfechas.
- Mocks de next/navigation preparados con usePathname en quince archivos;
  reparación de fixtures para el hook nuevo, no cambio de dominio ni permiso.
  Se conservan las regresiones de dinero, idempotencia y autorización.
- Baseline Chromium anterior a producción: seis escenarios con API simulada,
  sin pageerrors ni overflow. Capturas `sidebar-before-*` en
  `/tmp/polleria-pos-implementation-BsUNJC/`. Next dev de usuario ya activo
  en 3000; no se inicia ni se detiene ese servidor ni se toca su DB.

## Revisión y correcciones

- Producción del implementer Luna medium en RoleGuard y su CSS Module:
  sidebar común de 216px, marca/nav/sesión únicas, Mesas por `/mozo`, subnav
  admin real, drawer bajo 1024px. Conserva SessionHeader para selector de áreas.
  Carta pierde solo los chips duplicados; no se cambian operaciones de negocio.
- Se retiraron estilos globales de cabecera/nav sustituidos; el reflow de
  Mesas y compositor se ajusta a 1350px para reservar espacio al lateral.
  No se copió aún toda la pantalla de la referencia ni su sistema de cobro.
- Principal encontró el drawer dentro del shell marcado inert: jsdom no
  simula su bloqueo real. Test-writer añadió rojo causal AC-S03 comprobando
  ancestros inert y bloqueo/restauración del fondo. Implementer movió el
  drawer a una rama hermana, con tokens en authRoot. También corrigió
  Shift+Tab desde el contenedor inicial. Bloque dirigido 90/90 aprobado.
- Lint detectó mutación de ref durante render; se movió su sincronización
  a efecto, sin desactivar reglas. El cierre por ruta/resize se conserva.
- Última revisión añadió una regresión de caída/recuperación de sesión con
  drawer abierto. Rojo causal: al desaparecer el menú por un 500 de auth/me,
  body quedaba `hidden` en vez de recuperar su valor previo `clip`.
  Comando: `pnpm exec vitest run --project web frontend/src/components/auth/navigation-accessibility.test.tsx --testNamePattern='AC-S03: libera fondo y scroll' --maxWorkers=1`.
  El caso exige también no reabrir el drawer al pulsar Reintentar y recuperar
  la sesión. No se cambia autenticación; se corrige el ciclo de vida del lock.
  Implementer ligó el estado abierto a la versión de sesión y añadió su
  disponibilidad al efecto de bloqueo. La regresión completa quedó verde.
- Primera suite completa: 218 fallos/53 errores por seis mocks usePathname
  faltantes fuera de src y tres consultas globales duplicadas en el dashboard.
  Test-writer reparó solo mocks y scope de consultas a main, sin eliminar
  aserciones adversariales. Revalidación de tres archivos adversariales:
  152/152; dashboard: 3/3. No contar esos fallos como rojo de producto.

## Cierre — 2026-10-19

- Principal: `pnpm test:frontend` 754/754 en 45 archivos; tipos frontend,
  lint/formato, build de producción y diff-check aprobados.
  Cierre repetido con fuentes estables tras el último ajuste: no se cuenta
  un recorrido intermedio que expiró esperando el diálogo de un preview
  compilado antes de terminar ese ajuste. `sidebar-final.json` confirma los
  nueve escenarios en la compilación definitiva, posterior al código final.
- Chromium desarrollo y producción con API interceptada y fixtures validados:
  360/390/768/844/1024/1200/1440px, 1440x480 y 390 con reduced motion
  (nueve escenarios). Sin overflow horizontal, pageerrors ni APIs inesperadas.
- Roles mozo/admin: links autorizados, sección activa, drawer cerrado por
  defecto, abrir/cerrar/navegar, Tab/Shift+Tab contenidos, Escape y foco
  restaurado. Resize móvil→desktop→móvil no deja fondo bloqueado ni pierde
  el total de la tanda. Un solo main y salto con foco visible comprobados.
- Flujo mesa→detalle→agregar, búsqueda, filtro, personalización, cantidades,
  quitar y totales conservados. Error de envío mock/reintento mantiene cuerpo
  y clave idempotente. Cancelar desactivación no genera PATCH; fotos cargadas.
- Revisión adicional con nombre largo válido y viewport 1440x480: sidebar
  de 216px, scroll propio y Cerrar sesión alcanzable/visible, sin overflow.
  Primer fixture excedía el límite de 40 caracteres y fue rechazado antes
  de abrir navegador; se corrigió el fixture, no el contrato de producción.
- Artefactos locales: `/tmp/polleria-pos-implementation-BsUNJC/sidebar-dev.json`,
  `sidebar-prod.json`, `sidebar-final.json`, capturas y diagnóstico footer.
  No assets de aplicación.
- Sin backend/shared/contratos/dependencias, migraciones, seeds ni DB real.
  No se ejecutaron suites API/DB, cobertura global o E2E oficiales con DB.
  Revisión principal sin auditoría independiente. Sin commit/merge/push.
- Se retira solo el preview propio de producción 3200. Next dev del usuario
  en 3000 permanece activo. Próximo bloque: categorías arriba del catálogo
  y composición del pedido tras revisar esta base con el usuario.
