# Rediseño visual de dev — 2026-10-13

Autorizado por la solicitud del usuario de instalar frontend-design, web-design-guidelines y ui-ux-pro-max y rehacer la interfaz. Es una entrega visual sobre dev; la 014 aprobada sigue separada. No necesita otra confirmación del alcance ya solicitado.

## Dirección de diseño

Producto: herramienta de trabajo de una pollería, utilizada por mozos en celulares y administrador/caja en PC. La prioridad es reconocer una mesa, registrar un pedido y encontrar una acción sin recorrer una página genérica.

La búsqueda de ui-ux-pro-max encontró Restaurant/POS, diseño flat, contraste fuerte y controles táctiles. Se toma esa orientación; sus fuentes remotas se sustituyen por familias locales para funcionar sin internet. El criterio de frontend-design lleva a descartar el primer planteamiento genérico de crema/serif/terracota: se propone un tablero operativo claro con identidad de salón y brasa, sin hero comercial ni tarjetas de estadísticas ficticias.

- Paleta: tinta #142536, navegación petróleo #173446, base #F7F8FA, blanco #FFFFFF, acento brasa #EAAA35 con texto oscuro, enlace/foco #147D85. Estados con etiqueta además de color; validar contraste de pares reales, no solo de tokens aislados.
- Tipografía: Trebuchet MS para títulos/marca, Arial/sans-serif para controles y lectura; tamaños y pesos definidos, números tabulares para precios. No fuentes, imágenes ni APIs externas.
- Estructura: navegación lateral en PC, cabecera compacta y navegación adaptable en móvil; contenido alineado a izquierda, ancho mayor para salón/administración, formularios legibles. Sin navbar que tape foco o controles ni enlaces duplicados ambiguos.
- Rasgo principal: mesas como tablero de salón con número/nombre dominante y estado visible; la página de pedido separa detalle y acciones, y el compositor separa carta/carrito. La jerarquía cambia por contenido, no una tarjeta idéntica para cada sección.
- Iconos SVG locales de trazo consistente, decorativos aria-hidden cuando hay texto. Marca vectorial discreta; no emoji como icono ni inventar nombre de negocio o ventas.
- Movimiento solo para feedback de interacción, respetando prefers-reduced-motion; botones de al menos 48 px, foco visible y enlaces con intención clara.

```text
PC:     [marca / áreas] | [título y contexto]       [sesión]
        [navegación]   | [salón / lista / carta] [acciones]
Móvil:  [marca] [sesión]
        [áreas permitidas]
        [título + acción]
        [contenido adaptable]
```

## Alcance

Home, login/PIN, selector de áreas, shell autorizado, salón/mozo, pedido por mesa, agregar ítems/carrito, administración y formularios de usuarios/carta/mesas, placeholders reales de caja/cocina y estados de generación de comandas. Caja/cocina no recibirán funcionalidades ficticias. Mantener los flujos, respuestas, claves idempotentes, permisos, textos esenciales accesibles y rutas existentes.

## Criterios verificables

1. Sistema visual consistente y cambio visible de composición, navegación y jerarquía en todos los grupos de pantallas; no solo recolorear botones.
2. Skip link «Saltar al contenido», un main por pantalla, encabezados ordenados, foco y navegación por teclado. Navegación solo a áreas permitidas; área actual indicada semánticamente.
3. Botones táctiles de 48 px, etiquetas de campos visibles y errores/estados legibles. Mantener la corrección existente del hit target de checkbox de HeroUI.
4. Sin scroll horizontal a 360 px, 768 px y desktop; formularios, diálogos, nombres largos y carrito utilizables. Verificar con Chromium del sistema y capturas antes/después.
5. Los importes siguen mostrando soles; la API y lógica monetaria no cambian. Auth, roles, pedido/void/move/merge, reintentos e impresión 013 mantienen regresiones.
6. Todo funciona con recursos locales. Verificar los recorridos E2E existentes y las pruebas web; lint/tipos/formato pertinentes. Registrar cualquier deuda preexistente y los checks realmente ejecutados.

## Ejecución

Principal documenta/revisa y aplica web-design-guidelines actualizadas. Test-writer Luna medium añade únicamente regresiones significativas de navegación/accesibilidad y mantiene las existentes; implementer Luna medium cubre toda la web y no modifica tests. No rondas independientes ni agentes adicionales. Skills instalados en .agents/skills con skills-lock.json; conservar origen y archivos originales.

Integrar y publicar el resultado en dev para que el usuario pueda probar esta nueva interfaz; main y 014 conservan sus ramas. Revisar visualmente antes de terminar y entregar capturas.
