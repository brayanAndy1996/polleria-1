# Interfaz de Caja 014

Dirección: extender el POS azul aprobado, con Nunito local y tokens existentes. Base #EFF8FF, superficies #FFFFFF, texto #1E3A8A, acción #3B82F6 y selección #60A5FA. Importes alineados con cifras tabulares. Sin cambiar navegación global ni añadir dependencias.

La lista de Caja prioriza pedidos abiertos y sus mesas, total y solicitud de cuenta. Conserva Comandas por revisar de la 013. En escritorio, la pre-cuenta ocupa la columna principal y el formulario de cobro una columna lateral; a 360 px se apilan, sin ocultar detalle ni controles detrás de la navegación inferior.

```text
Escritorio: [Pre-cuenta y detalle             ][Medio / recibido]
           [Imprimir / No es comprobante     ][Total / vuelto  ]
                                             [Revisar cobro   ]
Móvil:     [Pre-cuenta y detalle]
           [Medio / recibido / vuelto]
           [Revisar y confirmar]
```

La confirmación identifica pedido/mesas, medio, total, recibido y vuelto. Efectivo usa texto con inputMode decimal; el parsing de soles ya existente acepta punto/coma y se acota al rango del pago. Para medios electrónicos se exige declarar que se recibió el pago. No se muestra integración bancaria.

Tras una respuesta perdida se conserva clave/cuerpo y se ofrece Reintentar solicitud con explicación del estado incierto. BILL_CHANGED obliga a releer y revisar nuevamente. El polling no remonta formularios ni borra páginas cargadas. Errores con aviso accesible y acción concreta; enlaces para navegación, botones para acciones y foco visible.

La hoja de impresión contiene PRE-CUENTA, pedido, mesas, fecha Lima, detalle, subtotales y total, y No es comprobante de pago; sin navegación ni controles. Imprimir es una acción separada de cobrar. Mozo dispone de lectura/impresión, sin formulario de cobro.

Se aplican frontend-design, web-design-guidelines y ui-ux-pro-max. Las recomendaciones genéricas de landing/experiencia inmersiva no se aplican al POS: prevalecen la dirección FigCraft aprobada y la spec 014. Motion existente se limita al feedback de acciones; se respeta movimiento reducido. QA visual real pendiente de implementación.
