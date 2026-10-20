# Navegación lateral POS — primer bloque

Estado: aprobado el 2026-10-19 por el usuario tras analizar la referencia
`frontend/references/original-c26bfacac66444e44e4a120777feca92.webp`.
«Dale haz los cambios»: primero barra izquierda y redistribución del espacio.
La imagen corresponde a una mesa ya seleccionada, antes de elegir productos.

## Alcance y diseño

- Navegación compartida lateral en todas las rutas autenticadas de RoleGuard,
  incluidas Mesas, detalle, compositor y administración. No cambiar login,
  selector de áreas ni estados sin sesión. No migrar framework ni dependencias.
- Escritorio desde 1024px: barra blanca de 208–220px, altura de viewport,
  marca arriba, navegación icono/texto, usuario/rol/cambio de área/salir abajo.
  El main reserva su ancho, sin cabecera superior duplicada. Sidebar puede
  desplazarse verticalmente si la altura disponible no alcanza.
- Móvil/tablet menor a 1024px: cabecera compacta y botón «Abrir navegación»;
  panel lateral modal con título, cierre, Escape, foco contenido/restaurado,
  fondo no interactivo y cierre al navegar. En escritorio no ocultar links.
- Reutilizar Nunito y paleta existente (blanco #FFFFFF, fondo #F5F6F8,
  texto #20242B, secundario #626A77, línea #E2E5EA, acción #0967D2).
  Esta decisión fija estructura; no convierte todavía la UI a verde.
- Área Mozo se presenta como «Mesas», manteniendo `/mozo` y sus permisos.
  Caja/Cocina/Administración solo si están autorizadas por roles existentes.
  Admin cuenta con subnavegación Carta, Configurar mesas y Usuarios, con rutas
  reales y activo correcto en detalle/nuevo. No accesos falsos a tomar pedido:
  éste se abre desde una mesa y mantiene su URL/contexto actual.
- La subnavegación de Carta pasa al lateral, sin duplicar sus chips arriba.
  El dashboard administrativo puede conservar sus accesos de contenido.
- Se conserva appearance default/pos para la apariencia del contenido; la
  distribución lateral compartida sustituye el chrome superior anterior en
  ambos. Las pruebas históricas de default deben preservar sus garantías de
  datos/permisos, no exigir la cabecera superior expresamente sustituida.
- Catálogo, categorías y tanda conservan su composición actual en este bloque.
  Solo adaptar breakpoints/ancho útil tras reservar sidebar para no comprimir
  formularios o tarjetas. Categorías horizontales y nuevo pedido lateral son
  siguientes bloques; no copiar cobros, delivery, reservas ni descuentos.

## Criterios de aceptación

- AC-S01: sidebar compartida, marca, iconos con texto y sesión/salida únicos;
  main desplazado a derecha en desktop y sin navegación superior duplicada.
- AC-S02: rutas y permisos actuales preservados; Mesas mantiene `/mozo`.
  Administrador tiene enlaces anidados reales; mozo no ve acceso admin.
  Área actual y sección administrativa activas con semántica accesible.
- AC-S03: móvil cerrado inicialmente; abrir/cerrar/Escape/navegar funcionan,
  sin links invisibles enfocables; modal con nombre y foco contenido/restaurado.
  Redimensionar a desktop no deja backdrop o body bloqueado.
- AC-S04: un solo main con skip link, controles >=44px, labels y foco visible,
  textos largos, reduced motion, sin solapamiento/overflow horizontal a
  360/390/768/1024/1440px y alturas reducidas.
- AC-S05: selección de mesa, detalle y toma de productos siguen conectados;
  búsqueda, editores, cantidades, quitar, totales y envío idempotente intactos.
  No cambios de API/backend/shared/datos ni dependencias.
- AC-S06: CSS Modules con propietarios claros; retirar estilos de chrome
  sustituidos sin afectar selector de áreas/login. No recorte global de overflow,
  screenshots de UI en producción ni modificación de las referencias.

## Verificación

Test-writer e implementer existentes Luna medium; rojo causal antes de
producción, revisión principal y checks. Sin auditor independiente. Suite
frontend, tipos, lint, build y Chromium con `/api/*` simulados: no escribir
datos reales ni arrancar DB/migraciones/seeds. Preservar cambios previos;
sin commit/merge/push. Esta tarea no afirma aprobación de la UI previa.
