# Estilos de Pollería: CSS Modules

Se conserva Next.js + React + Tailwind 4 + HeroUI. No se incorpora Sass ni se
traslada código de otros proyectos. La migración de estilos es incremental;
el primer bloque fue el tablero de `/mozo`. El rediseño POS aprobado en
Figma extiende ese trabajo a la toma de pedidos y la lista de Carta.

## Responsabilidad

- `src/app/globals.css`: imports de Tailwind/HeroUI, tokens `:root`, base,
  tipografía, accesibilidad y estilos compartidos del chrome. Aún contiene
  superficies pendientes de migrar; no se considera completada la extracción.
- `src/app/mozo/page.module.css`: geometría y presentación del tablero, sus
  tarjetas y popup de acciones. `page.tsx` importa y aplica clases locales.
- `src/app/mozo/mesas/[tableId]/agregar/page.module.css`: categorías, catálogo,
  tarjetas blancas, filtros no modales, personalización modal y tanda por
  enviar (aside >=1024px, barra fija y panel inferior bajo ese ancho).
- `src/app/admin/carta/page.module.css`: lista de productos y sus acciones.
- `src/components/auth/role-guard.module.css`: navegación lateral compartida
  de todas las rutas RoleGuard y drawer móvil. Los tokens del contenido POS
  siguen limitados a `appearance="pos"`; no cambiar `:root` para una vista.
  `authRoot` permite heredar tokens al drawer, que es hermano del fondo inert.
- Para componentes reutilizados, colocar el módulo junto al componente que
  posee el diseño, no copiar reglas a cada ruta consumidora.

## Convenciones

1. Usar `.module.css`, con clases locales descriptivas como `board`, `card`,
   `name` y `details`. No depender del nombre generado por Next.js en tests,
   selectores globales, scripts ni documentación.
2. Reutilizar variables CSS globales para valores compartidos. No importar
   Tailwind/HeroUI dentro de cada módulo ni usar `@apply` para duplicar
   utilidades ya presentes en el JSX.
3. Dar un propietario claro a cada propiedad visual: el módulo del bloque o
   una utilidad. Evitar combinaciones que dependan del orden de los bundles.
4. Mantener `:global(...)` limitado a contratos intencionales existentes, por
   ejemplo las clases semánticas de color de estado. No convertir todo el
   módulo en global ni conservar alias antiguos para evitar una extracción real.
5. La lista de mesas usa `data-layout="table-board"` para quedar fuera del
   tratamiento global de listas convencionales. Es un contrato de presentación,
   no un permiso ni un estado de negocio. No añadir wrappers que alteren el
   espaciado de hermanos o la sección compartida de comandas.
6. Conservar hover, foco visible, movimiento reducido, nombres largos y
   breakpoints del bloque al extraerlo. No rediseñar durante un refactor;
   para POS v1 el rediseño es una tarea nueva expresamente aprobada.
7. No trasladar autorización, validaciones, dinero ni llamadas de API a estilos.
   Los permisos deben seguir evitando renderizar las acciones no autorizadas.

## Cómo continuar

La [propuesta POS v1](https://www.figma.com/design/Hkuwm8zQT2kNj1SSSyWJwO/?node-id=40-56)
guio Mesas, toma de pedidos y lista de Carta. Tras la revisión del usuario,
la estructura vigente es la [barra lateral](../../docs/specs/pos-sidebar/spec.md)
basada en la referencia WebP local: común a todas las rutas autenticadas.
Eso no significa rediseñar su contenido; login/PIN y selector de áreas
permanecen fuera del cambio. El siguiente bloque implementa
[popup de mesa, categorías y pedido adaptable](../../docs/specs/pos-order-flow/spec.md),
sin copiar pagos/delivery/descuentos ni reemplazar la lógica de pedidos.
Los componentes compartidos y sus consumidores se verifican juntos. No es
necesario migrar todo para trabajar en un módulo nuevo.

## Datos y recursos en la propuesta POS

Figma no es una fuente de datos operativos. Los nombres, estados, cantidades,
precios y totales vienen de los contratos actuales; no copiar cifras demo.
`src/lib/product-image.ts` comparte asociaciones de imágenes locales entre
catálogo y administrador. Un producto sin imagen conserva un fallback:
no implica que exista un campo de foto en la API ni un gestor de archivos.

La agrupación y el orden de categorías, los editores de pollo/combos/cremas,
los mensajes, el reintento de envío y los permisos se conservan aunque no
estén dibujados por completo en la muestra estática. No copiar sus recortes
ni tamaños fijos a la aplicación. Ver [alcance aprobado](../../docs/specs/pos-figma-v1/spec.md).

Antes de extraer una superficie, guardar su apariencia actual y añadir una
regresión acotada. Después ejecutar las pruebas web, tipos, lint y build;
comparar escritorio/móvil y otra ruta que comparta estilos. Las pruebas
unitarias en jsdom no sustituyen comprobar CSS compilado en un navegador.
Usar mocks de API para la revisión visual, sin modificar la base de desarrollo.

La sidebar reserva 216px desde 1024px; comprobar ancho útil además del
viewport al elegir breakpoints del contenido. En móvil no duplicar menús:
el fondo queda inert y el drawer vive fuera de esa rama, con foco contenido,
Escape y restauración al trigger. Nunca esconder un desborde globalmente.

El compositor mantiene un solo estado de carrito y renderiza una sola copia
de sus controles: aside o panel móvil. Sus modales usan React Aria (foco,
Escape y fondo bloqueado); Filtros es un popover no modal y no deja inert el
catálogo. El panel inferior desplaza su contenido hasta total/envío, con
reserva de espacio y safe-area para la barra. No compartir IDs de formularios
entre variantes ocultas ni ocultar errores detrás de otro modal.

