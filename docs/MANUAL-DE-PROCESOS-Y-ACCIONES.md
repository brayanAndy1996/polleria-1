# Manual de procesos, pantallas y acciones

Sistema Pollería · Versión funcional hasta la entrega 016 · Actualizado el 18 de octubre de 2026.

Este documento explica qué hace cada acción disponible en la interfaz, quién puede usarla y cuándo cambia información del negocio. Está basado en las pantallas y la lógica implementadas en `main`, después de integrar la 016. El diseño visual puede cambiar posteriormente.

Los nombres entre comillas corresponden al texto visible de los controles. Un mismo botón puede cambiar temporalmente a «Guardando…», «Enviando…», «Cargando…» o un texto equivalente mientras trabaja: es la misma acción, no otra función.

## Índice

1. [Roles y navegación](#1-roles-y-navegación)
2. [Acceso y sesión](#2-acceso-y-sesión)
3. [Salón, mesas y pedidos](#3-salón-mesas-y-pedidos)
4. [Elegir productos y enviar a cocina](#4-elegir-productos-y-enviar-a-cocina)
5. [Anular ítems](#5-anular-ítems)
6. [Comandas y copias](#6-comandas-y-copias)
7. [Caja y cobros](#7-caja-y-cobros)
8. [Administración de usuarios](#8-administración-de-usuarios)
9. [Administración de carta y productos](#9-administración-de-carta-y-productos)
10. [Administración de mesas](#10-administración-de-mesas)
11. [Inventario](#11-inventario)
12. [Reporte diario de ventas](#12-reporte-diario-de-ventas)
13. [Cocina](#13-cocina)
14. [Procesos completos de ejemplo](#14-procesos-completos-de-ejemplo)
15. [Errores, reintentos y operaciones pendientes](#15-errores-reintentos-y-operaciones-pendientes)
16. [Funciones todavía pendientes](#16-funciones-todavía-pendientes)
17. [Referencias del código](#17-referencias-del-código)

## 1. Roles y navegación

Un trabajador puede tener varios roles. La interfaz muestra las áreas permitidas para la cuenta que inició sesión; el servidor también comprueba los permisos.

| Área                      | Quién entra            | Función principal                                                                |
| ------------------------- | ---------------------- | -------------------------------------------------------------------------------- |
| Mozo (`/mozo`)            | Mozo y administrador   | Atender mesas, registrar pedidos, solicitar anulaciones y consultar comandas.    |
| Caja (`/caja`)            | Cajero y administrador | Revisar cuentas y registrar cobros completos.                                    |
| Cocina (`/cocina`)        | Cocina y administrador | Pantalla informativa; la coordinación implementada se realiza mediante comandas. |
| Administración (`/admin`) | Administrador          | Gestionar usuarios, carta, mesas, inventario y reportes.                         |

### Controles compartidos

| Acción o control                           | Qué hace                                                                         | Qué cambia                                                                                               |
| ------------------------------------------ | -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| «Sistema Pollería», en la cabecera         | Lleva a la página de inicio.                                                     | Solo la navegación; no cierra sesión.                                                                    |
| «Mozo», «Caja», «Cocina», «Administración» | Abre el área correspondiente, si está permitida para el usuario.                 | Solo la pantalla.                                                                                        |
| «Cambiar de área»                          | Abre el selector de áreas. Aparece cuando hay más de un área permitida.          | Solo la navegación.                                                                                      |
| Tarjeta de un área en el selector          | Entra al área elegida.                                                           | Solo la pantalla; se conserva la misma cuenta de usuario.                                                |
| «Cerrar sesión»                            | Solicita cerrar la sesión actual y vuelve al acceso cuando el servidor confirma. | La sesión deja de servir; no cancela pedidos ni cobros. Si falla, muestra un error y permite reintentar. |
| «Saltar al contenido»                      | Lleva el foco al contenido principal, útil al trabajar con teclado.              | No modifica datos.                                                                                       |
| «Reintentar», en una pantalla que no cargó | Vuelve a consultar los datos de esa pantalla.                                    | No crea una operación comercial. Los reintentos de escrituras se explican en cada módulo.                |

En Administración, «Usuarios», «Carta», «Mesas», «Inventario» y «Reportes» abren las secciones correspondientes. Entrar a una sección no guarda cambios por sí mismo.

## 2. Acceso y sesión

Rutas: `/` y `/login`.

| Acción o control                   | Qué hace                                                                                                                                                                                        |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| «Iniciar sesión»                   | Abre la pantalla de acceso.                                                                                                                                                                     |
| Tarjeta con nombre y usuario       | Selecciona a esa persona y muestra el teclado de PIN. Todavía no inicia sesión.                                                                                                                 |
| Dígitos «0» a «9»                  | Agregan un dígito al PIN, hasta seis. También puede usarse el teclado físico.                                                                                                                   |
| «Borrar»                           | Quita el último dígito escrito; no borra al usuario. En teclado físico equivale a Retroceso.                                                                                                    |
| «Entrar»                           | Envía usuario y PIN. Si son válidos y la cuenta está activa, inicia sesión y dirige al área correspondiente o al selector. Requiere al menos cuatro dígitos. Enter también puede enviar el PIN. |
| «Cambiar usuario»                  | Regresa a la lista y limpia el PIN escrito.                                                                                                                                                     |
| «Reintentar», si no cargó la lista | Vuelve a pedir los usuarios disponibles.                                                                                                                                                        |

El PIN pertenece a cada usuario, no a un tipo de rol. Si es incorrecto, no se abre la sesión. El administrador puede restablecerlo, pero la aplicación no muestra el PIN anterior. Los intentos de acceso tienen protección contra repetición excesiva.

### Indicador de conexión

La página inicial comprueba periódicamente la conexión. El indicador no es un botón:

| Mensaje                             | Significado                                                     |
| ----------------------------------- | --------------------------------------------------------------- |
| «Verificando conexión…»             | Aún no terminó la primera consulta.                             |
| «Conectado»                         | La web llega al servidor y este llega a la base de datos.       |
| «Sin conexión con la base de datos» | El servidor responde, pero no puede consultar la base de datos. |
| «Sin conexión con el servidor»      | La web no obtiene una respuesta válida del servidor.            |

## 3. Salón, mesas y pedidos

Rutas: `/mozo` y `/mozo/mesas/[tableId]`. Roles: mozo o administrador.

Una **mesa** es el lugar físico. Un **pedido** es la cuenta que puede cubrir una o varias mesas. Abrir otra mesa no significa agregarla automáticamente al pedido de una mesa vecina.

### Tablero de mesas

| Control o estado                  | Qué significa o qué hace                                                                            |
| --------------------------------- | --------------------------------------------------------------------------------------------------- |
| Tarjeta con el nombre de una mesa | Abre su detalle. No abre una cuenta hasta pulsar «Abrir mesa».                                      |
| «Libre»                           | No tiene un pedido abierto asociado.                                                                |
| «Ocupada»                         | Tiene un pedido abierto.                                                                            |
| «Pedido listo»                    | El pedido tiene la marca de listo. Esta señal tiene prioridad visual sobre la de cuenta solicitada. |
| «Pidió la cuenta»                 | Se registró la solicitud de cuenta y no prevalece la marca de listo.                                |
| «Reintentar»                      | Vuelve a cargar el salón si falló la consulta.                                                      |

El tablero actualiza sus datos periódicamente, aproximadamente cada cinco segundos. Solo presenta las mesas activas.

### Detalle y acciones del pedido

| Botón o enlace                                | Qué hace                                                                 | Resultado y condiciones                                                                                                                                                                                          |
| --------------------------------------------- | ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| «Abrir mesa»                                  | Crea un pedido abierto para una mesa libre.                              | La mesa pasa a ocupada. Todavía no hay productos enviados ni consumo de stock.                                                                                                                                   |
| «Volver a las mesas»                          | Regresa al tablero.                                                      | No cierra ni cancela la cuenta.                                                                                                                                                                                  |
| «Agregar ítems»                               | Abre la carta para preparar una nueva tanda.                             | No modifica el pedido hasta enviar esa tanda.                                                                                                                                                                    |
| «Ver pre-cuenta»                              | Abre el detalle valorizado de lo que se cobraría.                        | No registra un pago ni libera la mesa.                                                                                                                                                                           |
| «Marcar pedido listo»                         | Activa la señal de pedido listo.                                         | No cobra, no imprime una nueva venta y no descuenta inventario.                                                                                                                                                  |
| «Marcar servido»                              | Quita la señal de listo.                                                 | No cierra el pedido. Puede volver a verse la señal de cuenta solicitada si ya existía.                                                                                                                           |
| «Pedir la cuenta»                             | Registra que el cliente solicitó la cuenta.                              | No cobra ni bloquea por sí solo futuras adiciones. No es requisito previo para que Caja cobre.                                                                                                                   |
| «Mover a otra mesa»                           | Abre un selector de mesas activas y libres.                              | Solo prepara la elección del destino.                                                                                                                                                                            |
| «Mover»                                       | Traslada el pedido completo a la mesa elegida.                           | Libera las mesas anteriores asociadas al pedido y conserva sus ítems, total e historial. No divide la cuenta.                                                                                                    |
| «Unir mesa»                                   | Abre el selector para unir con otra mesa ocupada por un pedido distinto. | En la pantalla actual se ofrecen pedidos ocupados; no es un selector de mesas libres.                                                                                                                            |
| «Unir»                                        | Fusiona los pedidos de las mesas seleccionadas.                          | Quedan en una sola cuenta, conservando los ítems y su atribución. No cobra ni vuelve a descontar stock.                                                                                                          |
| «Separar [nombre de mesa]»                    | Pide confirmar la separación de una mesa adicional del pedido.           | Solo abre la confirmación.                                                                                                                                                                                       |
| «Sí, separar»                                 | Libera esa mesa adicional.                                               | La cuenta y sus ítems permanecen en las mesas que siguen asociadas. No reparte productos ni importes.                                                                                                            |
| «Cancelar pedido»                             | Abre la entrada del motivo de cancelación.                               | Un mozo puede cancelar un pedido sin ítems. Si tuvo ítems, se requiere administrador y todos deben estar anulados: ningún rol puede cancelar mientras haya ítems enviados o solicitudes de anulación pendientes. |
| «Aceptar», en la cancelación                  | Envía la cancelación con su motivo.                                      | Si cumple las condiciones anteriores, el pedido queda cancelado, se liberan sus mesas y se conserva el historial. No equivale a un cobro ni repone stock automáticamente.                                        |
| «Cancelar», dentro de un panel o confirmación | Cierra ese panel sin aplicar la acción preparada.                        | No cancela el pedido completo; para eso existe «Cancelar pedido».                                                                                                                                                |

Las opciones dependen de los datos actuales. Una mesa puede haberse ocupado desde que se abrió el selector; en ese caso, el servidor rechaza la acción y la pantalla muestra el motivo.

## 4. Elegir productos y enviar a cocina

Ruta: `/mozo/mesas/[tableId]/agregar`. Roles: mozo o administrador.

La pantalla combina la carta con una **tanda sin enviar**. La tanda contiene solo lo que se está preparando en esa pantalla, no todos los ítems de la cuenta.

### Buscar y configurar

| Acción o campo                                                                         | Qué hace                                                                                                                                               |
| -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| «Todo» y botones de categoría: Pollo, Combos, Platos, Bebidas, Postres, Cremas, Extras | Filtran los productos visibles. No alteran el pedido. Solo aparecen las categorías que correspondan a la carta.                                        |
| «Buscar producto»                                                                      | Filtra la carta por el texto escrito. No crea productos ni cambia precios.                                                                             |
| Tarjeta de producto / «Elegir»                                                         | Abre sus opciones de preparación. Todavía no lo agrega a la tanda.                                                                                     |
| «Cantidad» del producto                                                                | Define cuántas unidades de esa configuración se quieren agregar.                                                                                       |
| «Presentación»                                                                         | En pollo, elige entre las presentaciones que el administrador configuró para vender.                                                                   |
| «Parte»                                                                                | En octavo o cuarto, permite elegir pecho o pierna entre las opciones disponibles.                                                                      |
| «Distribución»                                                                         | En medio pollo, permite elegir cómo se distribuyen sus cuatro octavos entre pecho y pierna.                                                            |
| Opciones de los componentes de un combo                                                | Permiten elegir parte o distribución de los componentes de pollo que lo admitan. No cambian la composición administrativa ni el precio fijo del combo. |
| Casillas de «Cremas» y su «Cantidad»                                                   | Seleccionan las cremas adicionales y sus cantidades en los productos que ofrecen esa opción. Sus precios configurados se consideran en el total.       |
| «Observación»                                                                          | Agrega una indicación al ítem, por ejemplo «sin ensalada», dentro del límite indicado.                                                                 |
| «Reintentar disponibilidad»                                                            | Vuelve a consultar existencias cuando la disponibilidad no pudo confirmarse. No registra entradas ni reserva productos.                                |
| «Volver al pedido»                                                                     | Sale de la carta hacia el detalle de la mesa. No envía la tanda. No debe asumirse que un borrador sin enviar se conservará al salir o recargar.        |

### Agregar, quitar y enviar

| Botón o control                     | Qué hace                                                       | Cuándo modifica el negocio                                                                                                                                                                |
| ----------------------------------- | -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| «Agregar al pedido»                 | Añade la configuración a la tanda sin enviar.                  | Todavía no crea ítems persistidos, comandas ni movimientos de stock.                                                                                                                      |
| «Cantidad» de una línea de la tanda | Cambia la cantidad de esa línea y recalcula el total.          | Solo cambia el borrador; se comprueba la disponibilidad conocida.                                                                                                                         |
| «Quitar»                            | Retira una línea de la tanda.                                  | No anula un ítem ya enviado a cocina.                                                                                                                                                     |
| «Enviar a cocina (N)»               | Envía las N líneas de la tanda al pedido abierto.              | Registra los ítems con sus precios y configuración, crea la comanda y descuenta los recursos con control activo. La primera tanda genera la comanda inicial; las siguientes, adicionales. |
| «Reintentar envío»                  | Repite el envío pendiente con su misma identidad de operación. | Recupera un envío ya aceptado o vuelve a intentarlo sin duplicar ítems, comandas ni consumo.                                                                                              |

Al enviar, el servidor vuelve a comprobar productos, precios aplicables y stock. Que un producto aparezca disponible no lo reserva: otro mozo puede consumirlo antes. Si falta un recurso controlado, se rechaza la tanda completa, sin registrar una parte de ella.

Si la respuesta de un envío queda incierta, la aplicación conserva el intento para recuperarlo. La generación del archivo de comanda se gestiona por separado: un fallo de salida no significa necesariamente que el pedido no se registró. Primero revisar el pedido y el estado de su comanda.

## 5. Anular ítems

Ubicación: líneas de un pedido enviado, en el detalle de la mesa.

| Botón                          | Quién lo usa                              | Qué hace                                                                                                                                               |
| ------------------------------ | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| «Solicitar anulación»          | Mozo o administrador con acceso al pedido | Abre el motivo de una solicitud para un ítem enviado.                                                                                                  |
| «Aceptar», al solicitar        | Quien está solicitando                    | Registra la solicitud con motivo. El ítem queda «Anulación pedida», sigue contando en la cuenta y bloquea el cobro hasta resolverlo.                   |
| «Anular»                       | Administrador                             | Prepara la anulación directa de un ítem enviado, con motivo.                                                                                           |
| «Aprobar anulación»            | Administrador                             | Prepara la aprobación de una solicitud pendiente, con motivo.                                                                                          |
| «Aceptar», al anular o aprobar | Administrador                             | Confirma la anulación. El ítem queda anulado, deja de cobrarse y se genera el registro/comanda de anulación correspondiente. Se conserva su historial. |
| «Rechazar solicitud»           | Administrador                             | Abre la confirmación de rechazo.                                                                                                                       |
| «Sí, rechazar»                 | Administrador                             | Rechaza la solicitud; el ítem vuelve a su situación enviada y sigue contando en la cuenta.                                                             |
| «Cancelar», en estos paneles   | Quien abrió el panel                      | Cierra la preparación sin confirmar la acción.                                                                                                         |

**Anular no devuelve existencias automáticamente.** El pollo puede estar preparado o la bebida entregada. Si hay una devolución física real, el administrador registra un ajuste positivo de inventario con motivo. Solicitar o rechazar tampoco modifica el saldo.

El detalle distingue «Enviado», «Anulación pedida» y «Anulado». Las comandas de anulación y sus detalles administrativos tienen restricciones de visibilidad; un mozo no recibe todas las opciones que ve el administrador.

## 6. Comandas y copias

Ubicación: «Comandas enviadas» y «Estado de generación de comandas» dentro del pedido; «Comandas por revisar» en Mozo y Caja.

La implementación actual genera archivos mediante el controlador `file`. **«Archivo generado» confirma un archivo, no papel impreso ni recepción por cocina.**

| Estado                          | Significado                                                             |
| ------------------------------- | ----------------------------------------------------------------------- |
| «En espera»                     | La generación está encolada.                                            |
| «Generando archivo…»            | Hay un intento en curso.                                                |
| «Archivo generado»              | El intento produjo su archivo.                                          |
| «No se pudo generar la comanda» | El intento falló y requiere revisión.                                   |
| «Revisar salida»                | El resultado de salida es incierto: podría existir una salida anterior. |
| «Anterior a esta función»       | Comanda histórica sin seguimiento de generación de esta función.        |

| Acción                 | Qué hace                                                                                                                                         |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| «Solicitar copia»      | Abre el diálogo para una comanda que admite copia. Su disponibilidad depende del estado, del contexto y de los permisos.                         |
| «Motivo de la copia»   | Explica por qué se necesita otra salida. Es obligatorio para confirmar una nueva copia.                                                          |
| «Sí, generar copia»    | Solicita una copia identificada como «REIMPRESIÓN». No crea otra venta ni vuelve a descontar stock. La salida anterior puede existir.            |
| «Reintentar solicitud» | Recupera o repite la misma solicitud cuando no llegó una respuesta válida. No debe interpretarse como pedir deliberadamente otra copia distinta. |
| «Cancelar»             | Cierra el diálogo. Si ya se envió una solicitud, cerrar el diálogo no revoca lo que el servidor pudo haber aceptado.                             |
| «Cargar más»           | Consulta otra página de comandas por revisar.                                                                                                    |
| «Reintentar»           | Actualiza el estado de generación o la lista si la consulta falló. No genera una copia por sí solo.                                              |

Mozo y administrador pueden gestionar las copias permitidas en el pedido; las de anulación tienen restricciones adicionales de administrador. Caja dispone de las acciones de atención que el servidor permita. Si una copia no es admisible, su botón no aparece.

## 7. Caja y cobros

Rutas: `/caja`, `/caja/pedidos/[orderId]`, `/caja/pagos/[paymentId]`. Roles: cajero o administrador. El mozo puede consultar la pre-cuenta desde su pedido, pero eso no le concede permiso para cobrar.

### Lista y pre-cuenta

| Acción o control             | Qué hace                                                                                                                                       |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Tarjeta de pedido abierto    | Abre «Revisar y cobrar», con mesas, ítems, total y situación actual del pedido.                                                                |
| «Cargar más pedidos»         | Consulta otra página de pedidos abiertos.                                                                                                      |
| «Reintentar»                 | Repite la consulta que falló: lista, pre-cuenta o detalle del pago, según la pantalla.                                                         |
| «Volver a Caja»              | Regresa a los pedidos abiertos. No crea, revierte ni cancela un cobro.                                                                         |
| «Ver pre-cuenta», desde Mozo | Abre `/mozo/pedidos/[orderId]/cuenta`. Permite revisar e imprimir, sin cobrar.                                                                 |
| «Imprimir pre-cuenta»        | Abre el diálogo de impresión del navegador. El usuario elige impresora o PDF. No registra pago, no libera mesas ni envía una comanda a cocina. |

La pre-cuenta muestra cantidades, presentaciones, componentes, cremas, observaciones, subtotales y total. Lleva «No es comprobante de pago». Una anulación pendiente sigue visible y debe resolverse antes de cobrar. Un pedido sin ítems cobrables o sin total positivo no se puede cobrar.

### Registrar un cobro completo

| Acción o campo                     | Qué hace                                                             | Resultado                                                                                                                    |
| ---------------------------------- | -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| «Medio de pago»                    | Selecciona Efectivo, Yape, Plin o Tarjeta.                           | En esta versión se usa un único medio para todo el pedido.                                                                   |
| «Monto recibido (S/)»              | En efectivo, registra cuánto entregó el cliente.                     | Acepta soles con hasta dos decimales; debe cubrir el total. Por ejemplo, `30.00` para una cuenta de S/ 21,00.                |
| «Vuelto (S/)»                      | Muestra recibido menos total cuando el monto es válido y suficiente. | Es informativo; no es un botón ni una salida de caja separada.                                                               |
| «Revisar cobro»                    | Valida el monto y abre el resumen de confirmación.                   | Todavía no registra el pago.                                                                                                 |
| «Confirmo que recibí el pago»      | Casilla requerida para Yape, Plin y Tarjeta.                         | Es una confirmación manual del cajero; no consulta un banco ni verifica una transferencia automáticamente.                   |
| «Confirmar cobro»                  | Envía el cobro revisado.                                             | Si se acepta, guarda el pago y su detalle histórico, cierra el pedido y libera todas sus mesas. No vuelve a descontar stock. |
| «Cancelar», en el diálogo de cobro | Cierra la revisión antes de enviar el cobro.                         | No cancela el pedido. Deja de ofrecerse cuando existe un intento enviado cuyo resultado debe recuperarse.                    |
| «Reintentar solicitud»             | Reenvía la misma operación después de una respuesta incierta.        | Recupera el resultado sin cobrar dos veces; conserva medio, monto y cuenta del intento original.                             |

Si la cuenta cambió entre revisión y confirmación, se actualiza la pre-cuenta y se exige revisarla otra vez. Si hay una solicitud de anulación pendiente, debe resolverse antes de cobrar.

Después del éxito se abre «Cobro confirmado»: muestra número de pago, pedido, mesas, medio, total, recibido, vuelto, cajero y fecha/hora de Lima. El detalle contiene la pre-cuenta histórica. Su botón «Imprimir pre-cuenta» sigue imprimiendo una pre-cuenta, no una boleta, factura o ticket fiscal.

## 8. Administración de usuarios

Rutas: `/admin/usuarios`, `/admin/usuarios/nuevo`, `/admin/usuarios/[id]`. Solo administrador.

| Acción o campo                    | Qué hace                                                                                                                                    |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| «Agregar usuario»                 | Abre el formulario de alta.                                                                                                                 |
| «Nombre de usuario»               | Define el identificador de acceso. Se escribe con los caracteres admitidos y debe ser único; no puede cambiarse después de crear la cuenta. |
| «Nombre para mostrar»             | Define el nombre visible en la operación. Es distinto del identificador de acceso.                                                          |
| «PIN» y «Repetir PIN»             | Definen y confirman un PIN de cuatro a seis dígitos. Se rechazan PIN fáciles según las reglas de seguridad.                                 |
| Casillas «Roles»                  | Asignan uno o varios roles: Mozo, Cocina, Cajero y Administrador. Determinan qué áreas y operaciones puede usar la persona.                 |
| «Crear usuario»                   | Valida y guarda la cuenta. Escribir los campos o marcar roles sin pulsarlo no crea un usuario.                                              |
| «Editar»                          | Abre el perfil del usuario seleccionado. No guarda cambios por sí solo.                                                                     |
| «Guardar cambios»                 | Guarda el nombre visible y los roles editados. No cambia el PIN de la sección siguiente.                                                    |
| «PIN nuevo» y «Repetir PIN nuevo» | Preparan una nueva clave; no muestran la anterior.                                                                                          |
| «Restablecer PIN»                 | Valida los campos y abre la confirmación.                                                                                                   |
| «Sí, restablecer»                 | Guarda el PIN nuevo y cierra las sesiones anteriores de ese usuario. Debe volver a entrar con el nuevo PIN.                                 |
| «Desactivar»                      | Abre una confirmación para impedir el acceso del usuario.                                                                                   |
| «Sí, desactivar»                  | Desactiva la cuenta y revoca su acceso, conservando su historial. No borra pedidos ni pagos.                                                |
| «Activar»                         | Reactiva una cuenta desactivada. No muestra ni restablece su PIN.                                                                           |
| «Cancelar»                        | Descarta la confirmación de desactivación o restablecimiento, según dónde se pulse.                                                         |
| «Reintentar»                      | Vuelve a cargar la lista si la consulta falló.                                                                                              |

No existe botón para borrar usuarios. El sistema protege contra cambios que dejarían al negocio sin administradores activos. La marca «(tú)» identifica la cuenta de la sesión actual.

## 9. Administración de carta y productos

Rutas: `/admin/carta`, `/admin/carta/nuevo`, `/admin/carta/[id]`. Solo administrador.

### Datos, precio y estado

| Acción o campo        | Qué hace                                                                                                                                              |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| «Agregar producto»    | Abre el formulario de un producto nuevo.                                                                                                              |
| «Nombre del producto» | Define el nombre con el que se ofrece.                                                                                                                |
| «Categoría»           | Elige Pollo, Combos, Platos, Bebidas, Postres, Cremas o Extras. Controla las opciones de configuración que corresponden al producto.                  |
| «Precio»              | Define el precio en soles. En combos es el precio fijo del combo; en pollo con presentaciones se usan los precios de las presentaciones configuradas. |
| «Crear producto»      | Guarda el producto nuevo. Las presentaciones o componentes se configuran en la edición que corresponda.                                               |
| «Editar»              | Abre los datos, estado y secciones aplicables del producto.                                                                                           |
| «Guardar cambios»     | Guarda los datos generales editados. No sustituye los botones separados de presentaciones o componentes.                                              |
| «Desactivar»          | Pide confirmar que el producto dejará de ofrecerse como producto activo en la carta del mozo.                                                         |
| «Sí, desactivar»      | Aplica la desactivación. No borra el producto ni cambia ítems ya registrados.                                                                         |
| «Activar»             | Vuelve a marcar el producto como activo. No registra stock; su disponibilidad puede seguir limitada por existencias o configuración.                  |
| «Cancelar»            | Descarta la confirmación de desactivación.                                                                                                            |
| «Volver a la carta»   | Regresa al listado. No guarda campos pendientes.                                                                                                      |
| «Reintentar»          | Vuelve a consultar la lista o la sección que no cargó.                                                                                                |

Los cambios de precio de carta no recalculan los ítems ya enviados: esos ítems conservan los valores registrados en su momento.

### Presentaciones del pollo

| Acción o campo                  | Qué hace                                                                                                                                                          |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Casilla de presentación y parte | Marca qué se vende: octavo o cuarto de pecho/pierna, medio pollo o entero.                                                                                        |
| «Precio de [presentación]»      | Establece el precio específico de la opción marcada.                                                                                                              |
| «Guardar presentaciones»        | Reemplaza el conjunto guardado por las opciones marcadas y sus precios. Desmarcar una opción y guardar deja de ofrecerla. Guardar sin opciones vacía el conjunto. |
| «Reintentar», en esta sección   | Vuelve a cargar las presentaciones guardadas.                                                                                                                     |

Mientras un pollo tenga presentaciones guardadas, no puede cambiarse libremente a otra categoría. Un cuarto representa dos octavos; medio pollo, cuatro; un entero, ocho. La parte elegida determina qué saldo de pollo se consume.

### Componentes de un combo

| Acción o campo                | Qué hace                                                                                                    |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------- |
| «Agregar componente»          | Añade una fila al borrador de componentes, hasta el máximo permitido. No guarda todavía.                    |
| «Producto» del componente     | Elige el producto que forma parte del combo.                                                                |
| «Cantidad»                    | Define cuántas unidades del componente contiene un combo.                                                   |
| «Presentación» y «Parte»      | Configuran el componente de pollo cuando corresponda.                                                       |
| «Quitar»                      | Retira la fila del borrador. No cambia la composición guardada hasta confirmar con su botón de guardado.    |
| «Guardar componentes»         | Reemplaza la composición guardada por el conjunto editado. Guardar sin filas deja el combo sin componentes. |
| «Reintentar», en esta sección | Vuelve a cargar los componentes.                                                                            |

La comparación de precios de componentes es informativa: **no fija automáticamente el precio del combo**. Un combo sin componentes se vende como producto simple. Los combos con componentes consumen el pollo y las bebidas controladas de esos componentes; no suman una segunda venta por cada componente. Existen restricciones para cambiar la categoría de un producto que tiene componentes o está referenciado por otro combo.

## 10. Administración de mesas

Ruta: `/admin/mesas`. Solo administrador. Esta pantalla configura el salón; la atención se realiza en el área Mozo.

| Acción o campo            | Qué hace                                                                                                                    |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| «Nombre de la mesa»       | Prepara el nombre de una mesa nueva. Debe cumplir las validaciones y no duplicar otro nombre, incluidas mesas desactivadas. |
| «Agregar mesa»            | Crea una mesa activa, inicialmente libre. No crea un pedido.                                                                |
| «Renombrar»               | Abre el panel para editar el nombre de la mesa elegida.                                                                     |
| «Guardar»                 | Guarda el nuevo nombre. No mueve su pedido ni cambia su estado operativo.                                                   |
| «Cancelar», al renombrar  | Cierra el panel sin guardar el nombre preparado.                                                                            |
| «Desactivar»              | Abre la confirmación para retirar la mesa del tablero del mozo.                                                             |
| «Sí, desactivar»          | Desactiva una mesa que puede desactivarse. Una mesa con pedido abierto no se puede retirar de esta forma.                   |
| «Cancelar», al desactivar | Cierra la confirmación sin cambiar el estado.                                                                               |
| «Activar»                 | Vuelve a habilitar la mesa para el salón.                                                                                   |
| «Reintentar»              | Vuelve a consultar las mesas cuando falla la actualización.                                                                 |

No se borran mesas. Desactivar es distinto de liberar: una mesa ocupada se libera al cobrar, mover, separar o cancelar el pedido, según el caso.

## 11. Inventario

Ruta: `/admin/inventario`. Solo administrador. Gestiona un saldo común de pecho y pierna para los productos de pollo, y saldos por producto de bebida.

**Los saldos se conservan entre días. No se reinician a medianoche.** El consumo ocurre al enviar a cocina, no al cobrar. No se puede dejar negativo un recurso controlado.

### Pollo y bebidas

| Acción o campo                   | Qué hace                                                                       | Momento en que guarda                                                                                                                     |
| -------------------------------- | ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| «Activar control», en Pollo      | Abre la revisión para empezar a comprobar y descontar el saldo común de pollo. | Al indicar motivo y confirmar el movimiento. La primera activación requiere registrar existencias reales; no reconstruye ventas antiguas. |
| «Desactivar control», en Pollo   | Prepara detener la comprobación y el consumo de saldo del pollo.               | Al confirmar con motivo. Conserva saldo e historial; reactivarlo no reconstruye consumos del tiempo desactivado.                          |
| «Registrar tanda»                | Abre los campos «Pollos enteros» y «Motivo».                                   | Abrir el formulario no agrega saldo. El control debe estar activo para registrar existencias.                                             |
| «Pollos enteros»                 | Define cuántos pollos asados ingresan.                                         | Cada pollo confirmado agrega cuatro octavos de pecho y cuatro de pierna.                                                                  |
| «Revisar tanda»                  | Valida cantidad y motivo y abre el resumen.                                    | Todavía no agrega saldo.                                                                                                                  |
| «Confirmar tanda»                | Registra la entrada preparada.                                                 | Aumenta ambos saldos y deja un movimiento con responsable y motivo.                                                                       |
| «Activar», junto a una bebida    | Prepara habilitar su control por unidades.                                     | Al confirmar con motivo. No equivale a activar el producto en la carta.                                                                   |
| «Desactivar», junto a una bebida | Prepara detener el control de esa bebida.                                      | Al confirmar con motivo; conserva saldo e historial. No desactiva el producto de la carta.                                                |
| «Registrar entrada»              | Abre el formulario con bebida, unidades y motivo.                              | Aún no modifica existencias. La entrada requiere que la bebida tenga el control habilitado.                                               |
| «Revisar entrada»                | Valida lo preparado y abre su revisión.                                        | No guarda hasta la confirmación.                                                                                                          |
| «Confirmar movimiento»           | Aplica la entrada, el ajuste o el cambio de control que figure en el diálogo.  | Guarda únicamente la operación revisada, con su motivo.                                                                                   |

«Sin control de stock» significa que no se está comprobando ese recurso; no demuestra que haya existencias físicas ilimitadas. Los controles de inventario no sustituyen las acciones de activar/desactivar un producto en Carta.

### Ajustes, historial y recuperación

| Acción o campo                                         | Qué hace                                                                                                                        |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| «Ajustar inventario»                                   | Abre una corrección manual. No guarda todavía.                                                                                  |
| «Recurso»                                              | Elige pecho en octavos, pierna en octavos o una bebida en unidades.                                                             |
| «Bebida»                                               | Identifica el producto controlado cuando se ajustan bebidas.                                                                    |
| «Cambio (+ agrega, − retira)»                          | Define el incremento o disminución; debe ser un entero distinto de cero. Es una diferencia, no el nuevo saldo absoluto.         |
| «Motivo»                                               | Explica la entrada, ajuste o cambio de control. Por ejemplo, «devolución física de una botella». No debe omitirse.              |
| «Revisar ajuste»                                       | Valida la corrección y abre su resumen.                                                                                         |
| «Confirmar movimiento»                                 | Aplica el ajuste revisado si respeta los límites y el saldo disponible.                                                         |
| «Cancelar», en la revisión                             | Cierra la revisión antes de enviar. No altera el saldo. No se ofrece como salida de un resultado incierto que debe recuperarse. |
| «Reintentar», tras un resultado incierto de movimiento | Recupera o repite exactamente el mismo intento, sin registrar una segunda entrada o ajuste.                                     |
| «Reintentar», si no cargaron los saldos                | Solo vuelve a consultar el inventario.                                                                                          |
| «Reintentar historial»                                 | Vuelve a consultar movimientos si falló esa lectura.                                                                            |
| «Cargar siguientes»                                    | Consulta otra página del historial de movimientos.                                                                              |

Ejemplo: si el sistema muestra diez botellas y físicamente hay ocho, el ajuste es **−2**, no ocho. Si devuelve físicamente una botella, el ajuste es **+1**. Una retirada que dejaría saldo negativo se rechaza.

El historial conserva tandas, entradas, ajustes, consumos y cambios de control con sus referencias, responsable y fecha/hora. No hay botón para editar o borrar movimientos pasados.

## 12. Reporte diario de ventas

Ruta: `/admin/reportes`. Solo administrador. Título de pantalla: «Ventas cobradas».

| Acción o control             | Qué hace                                                                                                                             |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Entrada inicial a «Reportes» | Consulta el día actual según el servidor en la zona de Lima. No depende de que el dispositivo tenga bien configurada su fecha local. |
| «Fecha»                      | Selecciona el día que se quiere consultar. Cambiarla prepara la selección; debe pulsarse «Actualizar» para consultarla.              |
| «Actualizar»                 | Consulta la fecha válida seleccionada o refresca la misma fecha. Si hubo un error, permite volver a consultar.                       |

El reporte contiene:

| Sección                                   | Cómo interpretarla                                                                                                                                                  |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Total cobrado y número de cobros          | Suma de los importes de los pagos de esa fecha. El dinero recibido para dar vuelto no aumenta la venta.                                                             |
| Medios de pago                            | Total y cantidad de cobros por Efectivo, Yape, Plin y Tarjeta.                                                                                                      |
| Ventas por hora                           | Distribución entre las 24 horas de Lima, según la hora del cobro.                                                                                                   |
| Productos vendidos                        | Cantidad e importe por producto y presentación, usando los datos históricos del cobro. La cantidad es de presentaciones vendidas, no necesariamente pollos enteros. |
| Ventas por usuario que registró los ítems | Atribuye cada ítem a quien lo registró, no necesariamente al cajero que cobró. La etiqueta del usuario usa su nombre visible actual.                                |

Un pedido creado ayer y cobrado hoy aparece en las ventas cobradas de hoy. Las cuentas abiertas todavía no cobradas no se incluyen. Un día sin ventas muestra cero y el mensaje correspondiente; un error de consulta no debe interpretarse como cero ventas. Durante carga, error o cambio de selección no se presenta un total anterior como si fuera el de la nueva consulta.

Consultar este reporte no modifica pedidos, pagos, comandas ni inventario. Todavía no dispone de exportación, impresión de reporte, cierre de caja o cálculo de merma.

## 13. Cocina

Ruta: `/cocina`. Roles: cocina o administrador.

La pantalla muestra el mensaje: «Las comandas salen en la impresora de cocina. Esta pantalla todavía no tiene funciones».

No tiene botones propios para aceptar pedidos, iniciar preparación, terminar platos o despachar. Solo están disponibles los controles compartidos de navegación y sesión. «Marcar pedido listo» está implementado en el detalle del pedido del área Mozo, no como un tablero operativo de Cocina.

## 14. Procesos completos de ejemplo

### Atender una mesa y cobrar

1. El mozo entra, selecciona una mesa libre y pulsa «Abrir mesa».
2. Abre «Agregar ítems», elige producto, cantidad, presentación, parte y demás opciones.
3. Pulsa «Agregar al pedido» por cada configuración. Revisa la tanda y su total.
4. Pulsa «Enviar a cocina». Se registran ítems y comanda y se descuentan las existencias controladas. Revisa la salida de la comanda por separado.
5. Si hay más consumo, prepara y envía otra tanda; se genera una comanda adicional.
6. Puede usar «Marcar pedido listo», «Marcar servido» y «Pedir la cuenta» para señalizar la atención. Ninguna de esas acciones cobra.
7. Caja abre el pedido y revisa su pre-cuenta. Resuelve con el administrador cualquier anulación pendiente antes de cobrar.
8. Selecciona medio de pago; en efectivo registra lo recibido. Pulsa «Revisar cobro» y luego «Confirmar cobro».
9. El pago confirmado cierra el pedido y libera sus mesas. El administrador puede consultar esa venta en Reportes según la fecha del cobro.

### Corregir un producto pedido por error

1. Si todavía está en la tanda sin enviar, usar «Quitar»; no hay anulación comercial ni devolución de stock.
2. Si ya se envió, usar «Solicitar anulación» con motivo, o el administrador usa «Anular» directamente.
3. El administrador aprueba o rechaza la solicitud. Solo la anulación confirmada retira el ítem del importe cobrable.
4. Si realmente se recupera un producto físico, registrar un ajuste positivo de inventario con motivo. No se repone automáticamente por anular.

### Preparar existencias y continuar otro día

1. El administrador activa el control de pollo o de las bebidas que quiera controlar, con motivo.
2. Registra la tanda de pollo y las entradas reales de bebidas mediante sus revisiones y confirmaciones.
3. Los envíos a cocina consumen los saldos controlados. Cobrar no consume otra vez.
4. Al cambiar el día, se conservan las existencias. Se agregan nuevas entradas o ajustes justificados, sin reiniciar los saldos.

## 15. Errores, reintentos y operaciones pendientes

| Situación                                       | Comportamiento y acción correcta                                                                                                                                                           |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Campo inválido                                  | La pantalla muestra el error y no confirma la operación. Corregir el dato y volver a revisar o guardar.                                                                                    |
| Control deshabilitado mientras guarda           | Esperar el resultado. El texto temporal indica que hay un envío en curso.                                                                                                                  |
| Sesión vencida o usuario desactivado            | Volver a autenticarse o pedir al administrador que revise la cuenta. No supone que el pedido se borró.                                                                                     |
| Falta de permiso                                | Usar una cuenta autorizada. Cambiar la URL no concede permisos.                                                                                                                            |
| Stock insuficiente                              | Revisar cantidades o registrar existencias reales. No se acepta parcialmente una tanda por falta de stock.                                                                                 |
| Anulación pendiente                             | Resolverla mediante aprobación o rechazo antes de cobrar.                                                                                                                                  |
| La cuenta cambió                                | Revisar la pre-cuenta actualizada y confirmar nuevamente con sus datos actuales.                                                                                                           |
| Falló una lectura                               | «Reintentar» vuelve a consultar; no convierte datos antiguos en información actualizada.                                                                                                   |
| Resultado incierto de envío, cobro o movimiento | La operación pudo haberse guardado aunque no llegara la respuesta. Usar el reintento del mismo intento que conserva la pantalla; no preparar otra operación idéntica por asumir que falló. |
| Falló la generación de una comanda              | Revisar primero el pedido y el estado de salida. Si procede, solicitar copia con motivo. Reenviar los productos como nuevos podría duplicar el pedido.                                     |

«Cancelar» antes de confirmar descarta una preparación. Cerrar un diálogo, pestaña o navegador después de enviar **no revierte automáticamente** una operación que ya aceptó el servidor. La aplicación tampoco ofrece un «deshacer» general para pagos, saldos o pedidos.

## 16. Funciones todavía pendientes

Estas funciones no deben buscarse como botones disponibles en la versión descrita:

- División de cuenta, pagos mixtos o parciales, apertura/cierre de caja y cuadre.
- Ticket de venta y comprobantes electrónicos SUNAT. Imprimir una pre-cuenta no los sustituye.
- Para llevar y delivery con datos de cliente, dirección y costo de envío.
- Recetas, insumos detallados, producción de refrescos, stock mínimo y alertas.
- Registro específico y reporte de merma; no se deduce automáticamente del saldo permanente.
- Exportar reportes y otras consultas avanzadas fuera del reporte diario aprobado.
- Tablero operativo de preparación en Cocina e integración verificada con impresora física. El controlador actual acredita archivos.

El pulido del diseño quedó diferido por decisión del usuario. Los cambios visuales futuros deberán mantener claros los efectos de estas acciones.

## 17. Referencias del código

La descripción se contrastó con los controles y manejadores de las pantallas, no solo con los requerimientos originales. Puntos principales para mantener el documento:

| Tema                                  | Fuentes                                                                                                                                 |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Acceso, sesión y áreas                | `apps/web/src/components/auth/`, `apps/web/src/lib/auth/roles.ts` y `apps/web/src/components/server-status.tsx`.                        |
| Salón y detalle del pedido            | `apps/web/src/app/mozo/page.tsx` y `apps/web/src/app/mozo/mesas/[tableId]/page.tsx`.                                                    |
| Carta del mozo y tanda                | `apps/web/src/app/mozo/mesas/[tableId]/agregar/page.tsx`.                                                                               |
| Anulaciones y ciclo de mesas          | Pantallas del mozo, `apps/api/src/services/orders/` y specs 009–011.                                                                    |
| Comandas y copias                     | `apps/web/src/components/kitchen-ticket-prints/kitchen-ticket-print-sections.tsx` y spec 013.                                           |
| Pre-cuenta y cobro                    | `apps/web/src/components/payments/` y spec 014.                                                                                         |
| Usuarios, carta y mesas configurables | `apps/web/src/app/admin/usuarios/`, `apps/web/src/app/admin/carta/`, `apps/web/src/app/admin/mesas/` y `apps/web/src/components/menu/`. |
| Inventario                            | `apps/web/src/components/inventory/inventory-admin.tsx` y spec 015.                                                                     |
| Reportes                              | `apps/web/src/components/reports/daily-sales-report.tsx`, `apps/api/src/services/reports/reports.service.ts` y spec 016.                |
| Límites y ampliaciones                | `docs/planificacion.md`, `docs/PROGRESS.md` y las exclusiones de cada spec.                                                             |

Para cambios posteriores, actualizar la fila del botón afectado, sus condiciones, su efecto y el proceso de ejemplo que corresponda. Este manual documenta la interfaz actual: no agrega funciones, permisos ni automatizaciones al software.
