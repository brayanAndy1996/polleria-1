# QA de diseño — FigCraft azul

Fecha: 2026-10-15. Rama dev. Revisión del principal; sin auditoría independiente.

## Fuentes y comparación

Fuente visual: docs/ui-figcraft/{salon-mobile,salon-desktop,carta-desktop,login-desktop}.png, exportadas de los frames 729/5000/1925/5047 de polleria.figcraft. Implementación: http://127.0.0.1:3000, Next real con API local de fixtures aislados en 4400. Fotografías originales del prototipo, fuente local Nunito Variable.

Las capturas válidas de Playwright usan Chrome instalado, deviceScaleFactor=1 y viewport CSS explícito. Fuente móvil390×844, desktop1440×900; implementación de iguales dimensiones. Comparaciones combinadas: docs/ui-figcraft/compare-salon-mobile.png, compare-carta-desktop.png y compare-login-desktop.png. Las capturas del navegador integrado con tamaño incorrecto se descartaron; no se atribuye validación móvil a esas capturas.

Los datos cambian respecto al mockup (nombres/precios/productos y cantidad de mesas), y se preservan textos/acciones/permisos reales. El usuario pidió guiarse por el diseño: no se declara identidad píxel a píxel. Las pantallas futuras de Caja/inventario/reportes del mockup no se implementan aquí.

## Iteraciones

- P0 corregido: al limpiar selectores se había aplicado min-height:100dvh a títulos y marca. La captura mostró grandes regiones vacías; se separó el selector tipográfico de app-shell y se recapturó a igual tamaño.
- P2 corregidos: doble cabecera desktop, contraste de enlaces, fondo ocupado vencido por bg-surface, tamaño de imágenes y geometría móvil de mesas.
- P2 corregido: catálogo separado en filas incompletas por categoría; se conservan secciones/listas accesibles y los productos fluyen en un grid continuo.
- P2 corregido: el editor abierto dentro de una tarjeta estrecha desbordaba con el carrito lleno; ahora ocupa una fila completa, sin recortar campos ni ocultar el overflow global. Recorrido final serializado con carrito/nota y filtros: sin desbordamiento en360/390/768/1024/1440.

## Superficies evaluadas

- Tipografía: Nunito local; jerarquía conservada para el sistema operativo, tamaños táctiles y números legibles. Botones primarios azul/blanco20px bold; fuente no requiere internet.
- Espacio/layout: cabecera única desktop, categorías/catálogo/resumen simultáneos; tablet/móvil con navegación inferior y padding de zona segura; imágenes con espacio reservado.
- Tokens: base #EFF8FF, acción #3B82F6, selección/borde #60A5FA e ink #1E3A8A; estados siempre tienen etiqueta. Se preservan colores semánticos de errores/estados existentes.
- Imágenes: originales locales, mapeadas por nombre solo a pollo a la brasa/chaufa/chicha morada; no inventar fotos de otros productos. Next Image optimiza dimensiones de entrega.
- Copy: se conservan nombres de acciones del producto y moneda existente. Las notas del documento FigCraft no se copian para rellenar pantallas.
- Interacción/accesibilidad: login PIN, búsqueda, filtro, carrito/nota y editor probados con fixtures; foco, nombres accesibles, skip link y permisos cubiertos por regresiones. MotionConfig reducedMotion=user y variante CSS sin desplazamiento hover; recorrido con media reduce.

## Evidencia técnica disponible

- 42 archivos web, 738 pruebas aprobadas; pruebas nuevas conservan carrito/nota en refetch, nodo de motivo en polling, navegación y preferencia de movimiento.
- Tras ajustes JSX finales, 116 pruebas dirigidas aprobadas.
- Tipos globales y build producción aprobados; lint y formato aprobados.
- Fixtures verificados contra esquemas compartidos en16 rutas; sin DB, no representan E2E de API real.
- No se ejecutó suite API/DB ni cobertura global para este cambio visual.

final result: passed

## Cierre visual posterior a correcciones

Se recapturaron y revisaron las comparaciones combinadas a escala1 después de cada corrección material. Cabecera de administrador360 sin solapamiento; imagen del editor completa a130px; texto Abrir sección azul oscuro. Evidencia final: implementation-admin-mobile.png, implementation-carta-mobile.png, implementation-carta-desktop.png y compare-*.png.

14 capturas de estados/vistas del recorrido final, cero errores de página y sin desbordamiento horizontal. Incluye fuente Nunito confirmada por estilo calculado, login, búsqueda/filtro conservando nota, editor con movimiento reducido, salón y administración. browser-verification.json conserva dimensiones y resultados. La navegación muestra solo áreas permitidas; en mozo de un solo rol no se inventan enlaces globales de Carta/Pedido que necesitan elegir una mesa. Cabecera móvil puede ocupar más alto para mostrar nombres/roles reales. Se conservan iconos previos del sistema; no se agregaron ilustraciones ni iconos de sustitución.

Refinamientos P3: datos/textos de demo y densidad de la cabecera difieren del mockup; probar con el personal para ajustar preferencias. Sin P0/P1/P2 abiertos en la adaptación aprobada. La API de fixtures valida UI, no la integración real ni impresión física.
