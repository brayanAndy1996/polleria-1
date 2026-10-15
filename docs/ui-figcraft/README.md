# Referencia visual FigCraft — azul

Documento fuente: polleria, outputs/polleria.figcraft del espacio de trabajo; consulta por FigCraft MCP el 2026-10-15.

La versión vigente usa #EFF8FF, #3B82F6, #60A5FA y #1E3A8A. Algunas capas conservan nombres históricos coral/verde: sus fills y textos actuales prevalecen. Fuente Nunito. Base limpia con superficies blancas, esquinas 12–24px y botones de 52px.

Referencias guardadas:

- carta-desktop.png: frame1925, 1440×900; categorías 120px, catálogo flexible y resumen~324px.
- salon-desktop.png: frame5000, 1440×900.
- salon-mobile.png: frame729, 390×844; dos columnas, margen24px y navegación inferior.
- login-desktop.png: frame5047, 1440×900; acceso y panel de ayuda lateral.

La implementación usa los diseños como guía para el producto existente: preserva textos/acciones/estados reales y permisos; no copia datos ficticios ni habilita las funciones futuras del mockup. No duplica navegación de escritorio para imitar la navegación inferior mostrada dentro de algunas superficies documentales.

Fotografías originales del prototipo: outputs/assets/pollo-demo.png, chaufa-demo.png y chicha-demo.png, copiadas al public local de la web. Son material de demostración, no fotos verificadas del negocio ni stock. Sólo se muestran cuando el nombre/producto corresponde.

Motion 14.3.0 y Nunito Variable 5.3.0 fijados; la fuente se empaqueta para uso sin internet. Animación responde a acciones; se conserva movimiento reducido. Decisión: docs/decisions/0003-figcraft-motion.md.

La evidencia de verificación de esta entrega se registrará al cierre; no confundir las capturas de referencia con capturas de la aplicación.

Verificación final: design-qa.md passed. Capturas implementation-* son aplicación real con API de fixtures aislados (sin DB); compare-* combinan referencia e implementación a la misma escala. browser-verification.json registra dimensiones y controles. Pruebas web738/738 y dirigidas116 posteriores, tipos/lint/build aprobados. La revisión principal no constituye auditoría independiente.
