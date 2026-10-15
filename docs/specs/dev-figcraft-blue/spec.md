# Rediseño FigCraft azul — dev

Solicitud autorizada por el usuario el 2026-10-15: continuar en dev y aplicar diseños/colorimetría de FigCraft con Motion.

Fuente: documento polleria en outputs/polleria.figcraft. Frames 6051 (tokens), 6120 (decisiones), 1925 (carta desktop), 5000/729 (salón), 5047/762 (acceso), tablet 3104/4052. Referencias exportadas en docs/ui-figcraft.

AC-01: paleta #EFF8FF (base), #3B82F6 (acción), #60A5FA (bordes/acento), #1E3A8A (texto); Nunito local, sin solicitudes de fuentes en ejecución. Botones blancos sobre azul requieren 20px bold, o texto oscuro accesible.
AC-02: escritorio >=1200: cabecera superior de navegación; carta con categorías laterales, productos y resumen simultáneos. Móvil/tablet: cabecera compacta y navegación inferior segura, catálogo de dos columnas móvil, sin desbordar 360/390/768/1024/1440.
AC-03: preservar acceso/PIN, permisos, navegación permitida, roles, formularios y estados de error/carga/vacío, acciones de mesa, idempotencia y resumen/envío del pedido. No implementar pagos/inventario/reportes futuros de los mockups.
AC-04: Motion en respuesta a acciones (carrito/selección/cambio visible), animaciones breves de opacity/transform y reduced motion sin movimiento. Sin reanimar al polling, ni retrasar acciones.
AC-05: controles semánticos, foco visible, salto a contenido, nombres accesibles, objetivos táctiles >=44px. Estados de mesa identificados por texto.
AC-06: conservar todas las regresiones web; comprobar tipos, lint y build. Revisar visualmente mismos estados y tamaños; documentar cualquier bloqueo real.

Flujo: test-writer Luna medium (bloque rojo significativo de navegación responsive/motion), implementer Luna medium (UI sin lógica de dominio), revisión principal. Cambios en dev, sin integrar main. El usuario autorizó Motion explícitamente; registrar dependencia exacta y ADR. Usar assets existentes de FigCraft, nunca imágenes remotas en ejecución.
