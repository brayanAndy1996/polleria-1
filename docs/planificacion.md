# Sistema para Pollerías – Planificación

Oct 7, 2026 · @Tael

## 1. Síntesis del negocio

Una pollería pequeña de Huánuco funciona hoy sin sistema: el pedido viaja de boca en boca o en papel, la cuenta se calcula a mano y el cobro no deja registro. El prototipo busca demostrarle al dueño que puede atender más mesas con menos errores y saber cuánto vende y cuánto le queda.

### Qué se vende

El producto central es el pollo a la brasa, que en Perú se sirve normalmente con papas fritas, ensalada y cremas (mayonesa, ají, ketchup, mostaza y a veces huacatay u ocopa).

| Presentación | Detalle | Equivalencia en pollo |
| --- | --- | --- |
| 1/8 (octavo) | Porción individual pequeña, pecho o pierna | 1/8 de pollo |
| 1/4 (cuarto) | La más vendida; el cliente elige pecho o pierna | 1/4 de pollo |
| 1/2 (medio) | Un pecho y una pierna, o según pida el cliente | 1/2 pollo |
| Entero | Para familias o para llevar | 1 pollo |
| Combos | Pollo + chaufa, "mostrito" (pollo + chaufa + papas), etc. | Según la porción de pollo |
| Otros platos | Chaufa, salchipapa, parrillas, mollejitas, postres | No usan pollo a la brasa o usan poco |

Un pollo rinde 2 cuartos de pecho y 2 de pierna, u 8 octavos. Por eso el sistema debe controlar las partes por separado: el pecho suele agotarse antes que la pierna, o al revés.

### Bebidas

Hay dos tipos con control distinto. Las **compradas** (gaseosas como Inca Kola o Coca-Cola, agua) se controlan por unidad y botella. Las **preparadas en el local** (chicha morada, maracuyá, limonada) se venden por vaso o jarra y dependen de insumos comprados: maíz morado, fruta, azúcar.

### Flujo actual de atención

1. El cliente llega, se sienta y espera al mozo.
2. El mozo toma el pedido (de memoria o en papel).
3. El mozo lleva el pedido a la cocina y se lo dicta o entrega a los cocineros.
4. La cocina sirve el plato. Los pollos suelen estar ya asados en el horno de brasa, así que "preparar" es sobre todo trozar, servir papas, ensalada y cremas.
5. La cocina avisa al mozo y este lleva el plato a la mesa.
6. Al terminar, el mozo vuelve a su puesto, suma a mano y entrega una boleta (nota) a la mesa.
7. El cliente va a un punto de cobro (no es una caja formal), entrega la nota y paga en efectivo o Yape.

### Problemas detectados

- Con varias mesas a la vez, el mozo olvida o confunde pedidos (pecho en vez de pierna, una bebida que no llegó).
- La cuenta manual genera errores de suma y demora al cliente.
- No hay registro de ventas: el dueño no sabe con certeza cuánto vendió, qué se vende más ni en qué horario.
- No hay control de inventario de pollos, gaseosas ni insumos, lo que facilita pérdidas y faltantes.
- El cuadre del día (efectivo vs. Yape) es difícil de verificar.

### Información adicional del sector

- **Para llevar y delivery** son una parte importante de la venta, sobre todo de noche y los fines de semana; muchos pedidos llegan por WhatsApp o llamada.
- **Medios de pago**: además de efectivo y Yape, es común Plin y, en algunos locales, tarjeta por POS.
- **Comprobantes**: los negocios formales deben emitir boletas o facturas según su régimen ante SUNAT, y la emisión electrónica es cada vez más exigida. Conviene confirmar con el dueño su régimen (por ejemplo, Nuevo RUS o RER) antes de definir este módulo.
- **Producción por tandas**: los pollos se marinan y se asan en tandas en el horno a leña o carbón. Saber cuántos pollos se asaron y cuántos se vendieron permite medir la merma diaria.
- **Insumos clave a controlar**: pollos crudos, papa, aceite, carbón o leña, arroz (chaufa), cremas, descartables para llevar y bebidas.

## 2. Historias de usuario del proceso actual

Estas historias describen cómo funciona hoy la pollería y dónde duele; sirven para validar con el dueño que entendimos su operación. Formato: Como \[rol\], \[lo que hace hoy\], y \[el problema que eso genera\].

| ID | Rol | Historia (situación actual) | Problema que genera |
| --- | --- | --- | --- |
| HU-01 | Cliente | Como cliente, llego al local y espero a que un mozo se acerque a atenderme. | En horas punta la espera es larga y no sé si ya me vieron. |
| HU-02 | Cliente | Como cliente, pido un 1/4 de pollo pierna con chicha y cremas. | El pedido puede llegar con la parte o bebida equivocada. |
| HU-03 | Cliente | Como cliente, pido algo adicional a mitad de la comida. | El mozo lo olvida o tarda porque atiende otras mesas. |
| HU-04 | Cliente | Como cliente, pido la cuenta y espero que el mozo la calcule. | La suma manual demora y puede tener errores. |
| HU-05 | Cliente | Como cliente, llevo la nota al punto de cobro y pago en efectivo o Yape. | Hay cola al salir y debo mostrar la captura de Yape. |
| HU-06 | Mozo | Como mozo, memorizo o anoto en papel los pedidos de varias mesas. | Confundo mesas y detalles (pecho/pierna, cremas, bebidas). |
| HU-07 | Mozo | Como mozo, camino a la cocina para dictar o entregar cada pedido. | Pierdo tiempo y dejo de atender el salón. |
| HU-08 | Mozo | Como mozo, pregunto en cocina si queda pecho, pierna o alguna bebida. | Prometo al cliente algo que ya se agotó. |
| HU-09 | Mozo | Como mozo, regreso a mi puesto y sumo la cuenta a mano. | Tardo, me equivoco y hay discusiones con el cliente. |
| HU-10 | Cocinero | Como cocinero, recibo pedidos de varios mozos de forma verbal o en papeles sueltos. | No hay un orden claro y se pierden o duplican pedidos. |
| HU-11 | Cocinero | Como cocinero, trozo el pollo y sirvo el plato, luego llamo al mozo. | Los platos se enfrían esperando a que el mozo los recoja. |
| HU-12 | Cocinero | Como cocinero, decido cuántos pollos poner al horno según mi experiencia. | Sobran pollos (merma) o faltan en horas punta. |
| HU-13 | Cobrador | Como cobrador, recibo la nota del mozo y cobro lo que dice. | No puedo verificar si la nota está completa o bien sumada. |
| HU-14 | Cobrador | Como cobrador, verifico pagos con Yape mirando la pantalla del cliente. | Riesgo de capturas falsas y pagos no registrados. |
| HU-15 | Cobrador | Como cobrador, al cierre cuento el efectivo y reviso los Yape del día. | El cuadre de caja es lento y las diferencias no se explican. |
| HU-16 | Dueño | Como dueño, compro pollos, gaseosas e insumos según lo que veo en el almacén. | No sé el consumo real; compro de más o de menos. |
| HU-17 | Dueño | Como dueño, preparo o encargo los refrescos del día (chicha, maracuyá). | No sé cuántos vasos rinde cada preparación ni cuánto se pierde. |
| HU-18 | Dueño | Como dueño, estimo las ventas del día por el dinero en caja. | No sé qué productos ni qué horarios me dejan más ganancia. |
| HU-19 | Dueño | Como dueño, recibo pedidos para llevar o delivery por teléfono o WhatsApp. | Se mezclan con los del salón y algunos se olvidan. |
| HU-20 | Dueño | Como dueño, confío en mis trabajadores para el manejo del dinero y la mercadería. | No tengo forma de detectar faltantes o "robo hormiga". |

## 3. Propuesta de sistema

Propongo una aplicación web que funcione en los celulares de los mozos, una pantalla en cocina y una PC o tablet en caja, conectadas por el wifi del local. El mozo registra el pedido en la mesa, la cocina lo ve al instante y la caja cobra con el total ya calculado.

### Roles

| Rol | Dispositivo | Qué hace en el sistema |
| --- | --- | --- |
| Mozo | Su celular Android | Ve mesas, toma pedidos, recibe aviso de "pedido listo", pide la cuenta |
| Cocina | Impresora térmica de comandas (sin pantalla) | Recibe cada comanda impresa en orden de llegada y avisa al mozo cuando el plato está listo, como hoy |
| Cajero | PC o tablet + impresora térmica | Cobra, registra el medio de pago, emite el comprobante y cierra caja |
| Administrador (dueño) | Celular o PC | Gestiona carta, precios, stock, usuarios y ve reportes |

### Módulos

1. **Mesas**: plano simple del salón con estado de cada mesa (libre, ocupada, pidió cuenta).
2. **Pedidos (comandas)**: carta con presentaciones (1/8, 1/4, 1/2, entero), parte (pecho/pierna), cremas, observaciones ("sin ensalada") y bebidas. Permite agregar ítems a un pedido abierto.
3. **Comandas impresas en cocina**: al enviar un pedido, el sistema imprime la comanda en cocina con número, mesa, mozo, hora y detalle. Cada adición o anulación imprime una comanda nueva marcada como tal. Las bebidas pueden imprimirse en una segunda impresora de barra.
4. **Para llevar y delivery**: pedidos sin mesa, con nombre, teléfono y dirección; costo de descartables y envío.
5. **Caja**: pre-cuenta, división de cuenta, pagos mixtos (efectivo + Yape/Plin), vuelto, apertura y cierre de caja con cuadre.
6. **Carta y productos**: platos, combos y bebidas con precio; cada producto indica cuánto pollo y qué parte consume, y qué insumo descuenta.
7. **Inventario**: pollos asados del día separados en pecho y pierna, gaseosas por unidad, refrescos por jarra/vaso e insumos con stock mínimo y alertas.
8. **Reportes**: ventas por día y hora, productos más vendidos, ventas por mozo, por medio de pago, merma de pollos.
9. **Usuarios y seguridad**: acceso por PIN según rol; anular un ítem o pedido exige autorización del administrador y queda registrado.

### Cómo resuelve los problemas actuales

| Problema actual | Solución del sistema |
| --- | --- |
| Pedidos olvidados o confundidos | El pedido se registra en la mesa y sale impreso en cocina |
| El mozo camina a cocina por cada pedido | La comanda se imprime sola en cocina; el mozo solo va a recoger cuando le avisan |
| Promesas de productos agotados | La carta muestra stock de pecho, pierna y bebidas en tiempo real |
| Cuenta manual con errores | El total se calcula automáticamente |
| Cobro sin control | Cada pago queda registrado con su medio y se cuadra al cierre |
| Dueño sin información | Reportes diarios de ventas, productos y merma |

### Tecnología sugerida

- **Frontend**: aplicación web progresiva (PWA) con React o Vue, para que los mozos la usen desde el navegador sin instalar nada.
- **Backend**: Node.js (NestJS o Express) o Laravel, con base de datos PostgreSQL o MySQL.
- **Tiempo real**: WebSockets para que mozos y caja vean los cambios al instante; la impresión en cocina se envía por red con el estándar ESC/POS de las impresoras térmicas.
- **Despliegue**: servidor local en una PC del negocio (funciona aunque falle el internet) con respaldo en la nube cuando haya conexión.
- **Hardware mínimo**: router wifi, celulares de los mozos, una impresora térmica de 80 mm con conexión de red (wifi o ethernet) en cocina, una PC o tablet para caja y otra impresora térmica de 80 mm en caja.

### Alcance del prototipo para la demostración

- [ ] Mesas con estados
- [ ] Toma de pedido con presentación, parte (pecho/pierna), cremas y bebidas
- [ ] Impresión automática de comandas en cocina
- [ ] Cuenta automática y cobro con efectivo o Yape
- [ ] Stock básico de cuartos de pecho/pierna y gaseosas
- [ ] Reporte simple de ventas del día

Quedan para después de hablar con el dueño: comprobantes electrónicos SUNAT, delivery, recetas de refrescos e insumos detallados.

### Preguntas para el dueño

- ¿Cuántas mesas, mozos y cocineros tiene? ¿Cuántos pollos asa en un día normal y en uno fuerte?
- ¿Vende 1/8? ¿Cómo arma el 1/2 (pecho + pierna o a elección)? ¿Cobra distinto el pecho y la pierna?
- ¿Qué combos y platos adicionales tiene, y con qué precios?
- ¿Las cremas son ilimitadas o se cobran? ¿Y los descartables para llevar?
- ¿Cuántos vasos rinde una jarra o preparación de chicha o maracuyá?
- ¿Qué tipo de comprobante emite hoy y en qué régimen tributario está?
- ¿Hace delivery? ¿Con repartidor propio o por aplicación?
- ¿Quién cobra, quién compra y quién debe poder anular pedidos?
- ¿Qué información le gustaría ver al final del día?
- ¿Qué equipos tiene (wifi, PC, celulares de los mozos, impresora)?

## 4. Requerimientos

Los requerimientos de prioridad Alta forman el prototipo; los de prioridad Media y Baja se confirman con el dueño.

### Requerimientos funcionales

| ID | Módulo | Requerimiento | Prioridad |
| --- | --- | --- | --- |
| RF-01 | Usuarios | El sistema permite iniciar sesión con usuario y PIN, y muestra solo las funciones del rol (mozo, cocina, cajero, administrador). | Alta |
| RF-02 | Mesas | El sistema muestra todas las mesas con su estado: libre, ocupada, pedido listo o cuenta solicitada. | Alta |
| RF-03 | Mesas | El mozo puede abrir una mesa, cambiar un pedido de mesa y unir mesas. | Media |
| RF-04 | Pedidos | El mozo registra un pedido eligiendo producto, presentación (1/8, 1/4, 1/2, entero) y parte (pecho o pierna). | Alta |
| RF-05 | Pedidos | El mozo puede indicar cremas, bebidas y observaciones por ítem (por ejemplo "sin ensalada"). | Alta |
| RF-06 | Pedidos | El mozo puede agregar ítems a un pedido abierto; cada adición genera una comanda nueva. | Alta |
| RF-07 | Pedidos | Anular un ítem ya enviado a cocina requiere autorización del administrador y guarda el motivo. | Media |
| RF-08 | Cocina | Al enviar un pedido, el sistema imprime automáticamente la comanda en la impresora de cocina con número, mesa, mozo, hora y detalle. | Alta |
| RF-09 | Cocina | Las adiciones y anulaciones imprimen una comanda nueva identificada como ADICIONAL o ANULADO. | Alta |
| RF-10 | Cocina | Si la impresora de cocina falla o se queda sin papel, el sistema avisa al mozo y a caja, y permite reimprimir la comanda. | Alta |
| RF-11 | Cocina | El sistema puede enviar las bebidas a una impresora de barra separada de la de cocina. | Baja |
| RF-12 | Para llevar | El sistema registra pedidos para llevar y delivery con nombre, teléfono, dirección y costo de envío. | Media |
| RF-13 | Caja | El sistema calcula automáticamente el total de la mesa y permite imprimir una pre-cuenta. | Alta |
| RF-14 | Caja | El cajero registra el pago en efectivo (con cálculo de vuelto), Yape, Plin o tarjeta. | Alta |
| RF-15 | Caja | El sistema permite dividir la cuenta y pagos mixtos (parte efectivo, parte Yape). | Media |
| RF-16 | Caja | El cajero abre la caja con un monto inicial y la cierra con un cuadre por medio de pago. | Media |
| RF-17 | Caja | El sistema emite un ticket de venta; la boleta o factura electrónica SUNAT queda como fase posterior. | Media |
| RF-18 | Carta | El administrador crea y edita productos, combos, presentaciones y precios, y los activa o desactiva. | Alta |
| RF-19 | Carta | Cada producto define cuánto pollo consume, de qué parte, y qué bebida o insumo descuenta. | Alta |
| RF-20 | Inventario | El administrador registra los pollos asados del día; el sistema los convierte en cuartos u octavos de pecho y pierna. | Alta |
| RF-21 | Inventario | Cada venta descuenta automáticamente el stock de pollo, gaseosas y refrescos. | Alta |
| RF-22 | Inventario | La carta del mozo muestra el stock disponible y bloquea productos agotados. | Alta |
| RF-23 | Inventario | El administrador registra compras de gaseosas e insumos y la producción de refrescos (jarras a vasos). | Media |
| RF-24 | Inventario | El sistema alerta cuando un producto o insumo baja de su stock mínimo. | Media |
| RF-25 | Reportes | El sistema muestra ventas por día y por hora, productos más vendidos y ventas por mozo. | Alta |
| RF-26 | Reportes | El sistema muestra ventas por medio de pago y la merma de pollos (asados menos vendidos). | Media |
| RF-27 | Auditoría | El sistema registra quién anuló, modificó o cobró cada pedido y a qué hora. | Media |

### Requerimientos no funcionales

| ID | Tipo | Requerimiento | Prioridad |
| --- | --- | --- | --- |
| RNF-01 | Usabilidad | Un mozo registra un pedido típico (1/4 pierna + bebida) en menos de 30 segundos. | Alta |
| RNF-02 | Usabilidad | La interfaz usa botones grandes, íconos y español sencillo; un trabajador aprende a usarla en menos de una hora. | Alta |
| RNF-03 | Rendimiento | Una comanda se imprime en cocina en menos de 3 segundos tras enviarse. | Alta |
| RNF-04 | Rendimiento | El sistema soporta al menos 20 mesas y 5 dispositivos conectados a la vez sin demoras. | Alta |
| RNF-05 | Disponibilidad | El sistema funciona en la red local aunque se caiga el internet. | Alta |
| RNF-06 | Disponibilidad | Se hace una copia de seguridad diaria de la base de datos. | Media |
| RNF-07 | Compatibilidad | Funciona en Chrome para Android 9 o superior y en una PC con Windows 10 o superior. | Alta |
| RNF-08 | Compatibilidad | Funciona con celulares y tablets de gama baja (2 GB de RAM). | Media |
| RNF-09 | Seguridad | Cada usuario accede con PIN propio; las acciones sensibles (anular, descuentos, cierre de caja) piden autorización. | Alta |
| RNF-10 | Seguridad | Las contraseñas y PIN se guardan cifrados. | Media |
| RNF-11 | Costo | El hardware total adicional no supera un presupuesto accesible para una pollería pequeña (a definir con el dueño). | Media |
| RNF-12 | Mantenibilidad | Precios, productos y mesas se configuran desde el sistema sin tocar código. | Alta |
| RNF-13 | Legal | Los comprobantes cumplirán la normativa SUNAT vigente cuando se active la facturación electrónica. | Baja |
| RNF-14 | Escalabilidad | El diseño permite usar el mismo sistema en varias pollerías (cada una con sus propios datos). | Baja |

## 5. Diagrama de flujo de la propuesta (draw.io)

El código de abajo es el diagrama completo del flujo propuesto, desde que el cliente llega hasta que se libera la mesa. Los colores indican quién hace cada paso: azul el cliente, verde el mozo, amarillo el sistema, rojo la cocina y morado la caja.

**Cómo importarlo en draw.io (dos opciones):**

1. Copia el código en un archivo de texto y guárdalo como `polleria-flujo.drawio`. Luego ábrelo en [app.diagrams.net](https://app.diagrams.net) con Archivo > Abrir desde > Dispositivo.
2. O abre draw.io, ve a Extras > Editar diagrama, borra lo que aparece, pega el código y pulsa Aceptar.

```xml
<mxfile host="app.diagrams.net">
  <diagram id="flujo-polleria" name="Flujo propuesto">
    <mxGraphModel dx="1200" dy="900" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="1100" pageHeight="1600" math="0" shadow="0">
      <root>
        <mxCell id="0"/>
        <mxCell id="1" parent="0"/>
        <mxCell id="titulo" value="Flujo propuesto - Sistema para Pollerías" style="text;html=1;fontSize=18;fontStyle=1;align=center;verticalAlign=middle;" vertex="1" parent="1">
          <mxGeometry x="250" y="0" width="400" height="30" as="geometry"/>
        </mxCell>
        <mxCell id="n1" value="Cliente llega al local" style="ellipse;whiteSpace=wrap;html=1;fillColor=#dae8fc;strokeColor=#6c8ebf;" vertex="1" parent="1">
          <mxGeometry x="360" y="50" width="180" height="60" as="geometry"/>
        </mxCell>
        <mxCell id="n2" value="Mozo ve las mesas libres en su celular y asigna una mesa" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#d5e8d4;strokeColor=#82b366;" vertex="1" parent="1">
          <mxGeometry x="340" y="150" width="220" height="60" as="geometry"/>
        </mxCell>
        <mxCell id="n3" value="Mozo registra el pedido en la app: producto, presentación (1/8, 1/4, 1/2, entero), parte (pecho o pierna), cremas y bebidas" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#d5e8d4;strokeColor=#82b366;" vertex="1" parent="1">
          <mxGeometry x="310" y="250" width="280" height="80" as="geometry"/>
        </mxCell>
        <mxCell id="d1" value="¿Hay stock?" style="rhombus;whiteSpace=wrap;html=1;fillColor=#fff2cc;strokeColor=#d6b656;" vertex="1" parent="1">
          <mxGeometry x="370" y="370" width="160" height="80" as="geometry"/>
        </mxCell>
        <mxCell id="n4" value="Mozo ofrece una alternativa al cliente" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#d5e8d4;strokeColor=#82b366;" vertex="1" parent="1">
          <mxGeometry x="60" y="380" width="200" height="60" as="geometry"/>
        </mxCell>
        <mxCell id="n5" value="Sistema imprime la comanda en cocina y descuenta el inventario" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#fff2cc;strokeColor=#d6b656;" vertex="1" parent="1">
          <mxGeometry x="340" y="490" width="220" height="70" as="geometry"/>
        </mxCell>
        <mxCell id="n6" value="Cocina toma la comanda impresa y prepara el plato" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#f8cecc;strokeColor=#b85450;" vertex="1" parent="1">
          <mxGeometry x="340" y="600" width="220" height="60" as="geometry"/>
        </mxCell>
        <mxCell id="n7" value="Cocina avisa al mozo que el pedido está listo (campana o llamado)" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#f8cecc;strokeColor=#b85450;" vertex="1" parent="1">
          <mxGeometry x="340" y="700" width="220" height="60" as="geometry"/>
        </mxCell>
        <mxCell id="n8" value="Mozo recoge y sirve el pedido en la mesa" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#d5e8d4;strokeColor=#82b366;" vertex="1" parent="1">
          <mxGeometry x="340" y="800" width="220" height="60" as="geometry"/>
        </mxCell>
        <mxCell id="d2" value="¿Piden algo más?" style="rhombus;whiteSpace=wrap;html=1;fillColor=#dae8fc;strokeColor=#6c8ebf;" vertex="1" parent="1">
          <mxGeometry x="370" y="900" width="160" height="80" as="geometry"/>
        </mxCell>
        <mxCell id="n9" value="Cliente pide la cuenta y el sistema calcula el total" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#fff2cc;strokeColor=#d6b656;" vertex="1" parent="1">
          <mxGeometry x="340" y="1020" width="220" height="60" as="geometry"/>
        </mxCell>
        <mxCell id="n10" value="Cliente paga en caja: efectivo, Yape o Plin" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#e1d5e7;strokeColor=#9673a6;" vertex="1" parent="1">
          <mxGeometry x="340" y="1120" width="220" height="60" as="geometry"/>
        </mxCell>
        <mxCell id="n11" value="Caja registra el pago y emite ticket o boleta" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#e1d5e7;strokeColor=#9673a6;" vertex="1" parent="1">
          <mxGeometry x="340" y="1220" width="220" height="60" as="geometry"/>
        </mxCell>
        <mxCell id="n12" value="Sistema libera la mesa y actualiza ventas e inventario" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#fff2cc;strokeColor=#d6b656;" vertex="1" parent="1">
          <mxGeometry x="340" y="1320" width="220" height="60" as="geometry"/>
        </mxCell>
        <mxCell id="n13" value="Fin" style="ellipse;whiteSpace=wrap;html=1;fillColor=#dae8fc;strokeColor=#6c8ebf;" vertex="1" parent="1">
          <mxGeometry x="390" y="1420" width="120" height="50" as="geometry"/>
        </mxCell>
        <mxCell id="e1" style="edgeStyle=orthogonalEdgeStyle;rounded=0;html=1;endArrow=block;" edge="1" parent="1" source="n1" target="n2">
          <mxGeometry relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="e2" style="edgeStyle=orthogonalEdgeStyle;rounded=0;html=1;endArrow=block;" edge="1" parent="1" source="n2" target="n3">
          <mxGeometry relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="e3" style="edgeStyle=orthogonalEdgeStyle;rounded=0;html=1;endArrow=block;" edge="1" parent="1" source="n3" target="d1">
          <mxGeometry relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="e4" value="No" style="edgeStyle=orthogonalEdgeStyle;rounded=0;html=1;endArrow=block;" edge="1" parent="1" source="d1" target="n4">
          <mxGeometry relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="e5" style="edgeStyle=orthogonalEdgeStyle;rounded=0;html=1;endArrow=block;exitX=0.5;exitY=0;exitDx=0;exitDy=0;entryX=0;entryY=0.5;entryDx=0;entryDy=0;" edge="1" parent="1" source="n4" target="n3">
          <mxGeometry relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="e6" value="Sí" style="edgeStyle=orthogonalEdgeStyle;rounded=0;html=1;endArrow=block;" edge="1" parent="1" source="d1" target="n5">
          <mxGeometry relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="e7" style="edgeStyle=orthogonalEdgeStyle;rounded=0;html=1;endArrow=block;" edge="1" parent="1" source="n5" target="n6">
          <mxGeometry relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="e8" style="edgeStyle=orthogonalEdgeStyle;rounded=0;html=1;endArrow=block;" edge="1" parent="1" source="n6" target="n7">
          <mxGeometry relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="e9" style="edgeStyle=orthogonalEdgeStyle;rounded=0;html=1;endArrow=block;" edge="1" parent="1" source="n7" target="n8">
          <mxGeometry relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="e10" style="edgeStyle=orthogonalEdgeStyle;rounded=0;html=1;endArrow=block;" edge="1" parent="1" source="n8" target="d2">
          <mxGeometry relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="e11" value="Sí" style="edgeStyle=orthogonalEdgeStyle;rounded=0;html=1;endArrow=block;exitX=1;exitY=0.5;exitDx=0;exitDy=0;entryX=1;entryY=0.5;entryDx=0;entryDy=0;" edge="1" parent="1" source="d2" target="n3">
          <mxGeometry relative="1" as="geometry">
            <Array as="points">
              <mxPoint x="680" y="940"/>
              <mxPoint x="680" y="290"/>
            </Array>
          </mxGeometry>
        </mxCell>
        <mxCell id="e12" value="No" style="edgeStyle=orthogonalEdgeStyle;rounded=0;html=1;endArrow=block;" edge="1" parent="1" source="d2" target="n9">
          <mxGeometry relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="e13" style="edgeStyle=orthogonalEdgeStyle;rounded=0;html=1;endArrow=block;" edge="1" parent="1" source="n9" target="n10">
          <mxGeometry relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="e14" style="edgeStyle=orthogonalEdgeStyle;rounded=0;html=1;endArrow=block;" edge="1" parent="1" source="n10" target="n11">
          <mxGeometry relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="e15" style="edgeStyle=orthogonalEdgeStyle;rounded=0;html=1;endArrow=block;" edge="1" parent="1" source="n11" target="n12">
          <mxGeometry relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="e16" style="edgeStyle=orthogonalEdgeStyle;rounded=0;html=1;endArrow=block;" edge="1" parent="1" source="n12" target="n13">
          <mxGeometry relative="1" as="geometry"/>
        </mxCell>
        <mxCell id="leyenda" value="Leyenda" style="text;html=1;fontStyle=1;align=left;verticalAlign=middle;" vertex="1" parent="1">
          <mxGeometry x="780" y="50" width="140" height="30" as="geometry"/>
        </mxCell>
        <mxCell id="l1" value="Cliente" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#dae8fc;strokeColor=#6c8ebf;" vertex="1" parent="1">
          <mxGeometry x="780" y="90" width="140" height="30" as="geometry"/>
        </mxCell>
        <mxCell id="l2" value="Mozo" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#d5e8d4;strokeColor=#82b366;" vertex="1" parent="1">
          <mxGeometry x="780" y="130" width="140" height="30" as="geometry"/>
        </mxCell>
        <mxCell id="l3" value="Sistema" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#fff2cc;strokeColor=#d6b656;" vertex="1" parent="1">
          <mxGeometry x="780" y="170" width="140" height="30" as="geometry"/>
        </mxCell>
        <mxCell id="l4" value="Cocina" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#f8cecc;strokeColor=#b85450;" vertex="1" parent="1">
          <mxGeometry x="780" y="210" width="140" height="30" as="geometry"/>
        </mxCell>
        <mxCell id="l5" value="Caja" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#e1d5e7;strokeColor=#9673a6;" vertex="1" parent="1">
          <mxGeometry x="780" y="250" width="140" height="30" as="geometry"/>
        </mxCell>
      </root>
    </mxGraphModel>
  </diagram>
</mxfile>
```
