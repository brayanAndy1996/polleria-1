# Propuesta POS v1: implementación del diseño aprobado

Estado: autorizado por el usuario el 2026-10-19: «OK SI ME AGRADO,
implementalo en este proyecto». La aprobación corresponde al diseño visual,
no a las integraciones futuras del panel Next steps.

## Fuente de verdad y alcance

[Propuesta Figma](https://www.figma.com/design/Hkuwm8zQT2kNj1SSSyWJwO/?node-id=40-56).
Frames: Mesas `40:59`, Toma de pedidos `40:60`, Carta `40:62`, móvil `40:63`.
Contexto de diseño y capturas consultados con figma-design-to-code antes de
editar. No hay Code Connect. Se reutilizan las fotos originales ya locales:
`pollo-demo.png`, `chaufa-demo.png`, `chicha-demo.png`; son los recursos de
contenido usados en Figma, no capturas de interfaz.

Cambios de producción solo en frontend. Conservar Next, React, HeroUI,
Tailwind, Motion y Nunito; no añadir dependencias. CSS Modules para las
superficies y componentes nuevos. Documentación de avance a cargo del
principal. Conservar el trabajo anterior y el video del usuario. Sin commits,
merge ni push automáticos.

## Decisiones de adaptación

- Los datos ilustrativos de Figma se sustituyen por los datos de API y
  funciones existentes. Nunca fijar mesas, usuarios, productos, precios,
  cantidades ni totales de demostración en producción.
- La cabecera POS se aplica solo a las tres superficies aprobadas, mediante
  una opción explícita del chrome/RoleGuard. Su valor por defecto conserva
  las demás rutas, login, Caja y Cocina. Mantener acceso a las áreas
  permitidas, cambio de área, cierre de sesión y salto al contenido.
- Los tokens `--pos-v1-*` quedan limitados al contenedor POS. No sustituir
  globalmente la paleta anterior ni crear una segunda hoja global de parches.
- Cartas y fotos comparten un helper frontend de asociación local por nombre.
  Conservar las asociaciones previas y añadir el nombre exacto `Demo Pollo`
  para la foto de pollo usada en la propuesta; no asignar fotos arbitrarias
  solo por categoría ni simular una gestión de fotografías.
- El catálogo mantiene sus categorías y orden actuales. No ocultar Cremas,
  Extras, Postres ni productos por copiar la muestra parcial de móvil.
- Se conservan los editores existentes de presentación, parte, distribución,
  combos, cremas, cantidad y notas, adaptados visualmente sin cambiar su
  validación. No inventar un modal/drawer nuevo sin diseño aprobado.
- El móvil mantiene edición de cantidades y eliminación de líneas. La
  simplificación estática del mockup no autoriza quitar esos controles.
- La carta administrativa conserva agrupación por categorías y orden de
  API, estados/desactivación y mensajes existentes, aunque se use la
  composición de lista alineada del diseño.
- Mesas pasa intencionalmente del fondo azul especial a tarjetas blancas
  con badges semánticos. Esto sustituye únicamente la apariencia histórica
  AC-M03 del refactor anterior; sus pruebas deben actualizarse con evidencia
  de esta autorización, no eliminarse para ocultar fallos funcionales.
- No mostrar notas internas de Figma (muestra, tokens, próximos pasos) en
  pantallas operativas ni convertir la leyenda de estados en filtros falsos.

## Criterios de aceptación

- AC-P01: Mesas usa tarjetas claras, nombres, badges de los cuatro estados,
  importes en soles, mozo, mesas unidas y marcas de cuenta/anulación reales.
  Solo se muestran mesas activas; cada tarjeta mantiene su URL de detalle.
  Cabecera, descripción y contador se derivan de los datos, sin conteos fijos.
- AC-P02: Toma de pedidos adopta categorías, búsqueda, tarjetas fotográficas
  o fallback honesto y tanda lateral en escritorio; una columna y dos
  tarjetas por fila cuando el ancho lo permita en móvil. Todos los productos
  siguen accesibles. El precio Desde se deriva de las ofertas reales.
- AC-P03: Personalización, cantidades, quitar, notas, total en céntimos,
  límites, permisos, errores, reintentos e idempotencia de envío se conservan.
  La acción continúa llamándose Enviar a cocina, nunca Cobrar.
- AC-P04: Carta adopta miniaturas, nombre/categoría, precio, estado y acciones
  alineadas. Agregar, editar y activar/desactivar siguen operativos, con
  confirmaciones, validaciones y control de instancia principal existentes.
- AC-P05: Chrome POS con Nunito, monograma P, superficies neutrales,
  bordes suaves y azul de acción según Figma. No filtrar acciones por CSS ni
  alterar la autorización. Rutas no aprobadas conservan el chrome anterior.
- AC-P06: Estilos propios en CSS Modules y tokens compartidos acotados.
  Retirar reglas antiguas solo si su propietario fue migrado por completo;
  no dejar duplicaciones activas que dependan del orden de los bundles.
- AC-P07: Teclado, foco visible, controles etiquetados, áreas táctiles de
  al menos 44px, estados no indicados solo por color, imágenes con geometría
  reservada, nombres largos y reduced motion funcionan. Sin overflow de
  página a 360/390/768/1024/1440px; no ocultarlo con un recorte global.
- AC-P08: Fotos locales correctas en cada slot; ningún enlace temporal de
  Figma ni screenshot de UI en producción. Sin nuevas APIs ni funciones
  futuras de caja, cobros, descuentos, KDS, recibos, inventario o hardware.

## Verificación y metodología

Test-writer e implementer existentes: gpt-6-luna/medium para pruebas y UI.
El principal no escribe producción ni tests. Bloques: pruebas nuevas en
rojo causal, implementación mínima, revisión y verificaciones. Mantener las
regresiones de permisos, dinero y envío existentes. Pruebas web/MSW sin DB;
capturas y recorrido Chromium con API simulada sin escribir datos reales.

Cierre: pruebas frontend, tipos, lint/formato, build y revisión visual con
Figma; controles de login y Usuarios para detectar filtraciones de estilo.
Registrar las diferencias funcionales justificadas frente al mockup estático.
No atribuir revisión o auditoría independientes: el principal hace ambas.
Suites API/DB/cobertura global no se ejecutan por un cambio visual aislado;
informar su omisión y no contarlas como aprobadas.

## Fuera de alcance / next steps

Gestor de fotos y contrato de imagen por producto; cobros/014; descuentos;
recibos; KDS; hardware; inventario/reportes. Ampliación a login, detalle de
pedido y otras rutas requiere siguiente bloque visual, no una migración de
framework ni un rediseño global implícito.
