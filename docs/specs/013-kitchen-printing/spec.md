# Spec 013 — Generación automática de comandas con driver file

> El usuario aprobó la metodología reducida 2026-10-12. El alcance, los 14 AC y P-01…P-06 se conservan. Las referencias de roles/checks independientes se interpretan según docs/agents/modelos-codex.md: dos ejecutores y revisión principal, sin ronda adversarial independiente.

- Estado: **Aprobada por el usuario el 2026-10-12 con las seis recomendaciones P-01…P-06**. La decisión de empezar con `file` fue confirmada antes de esta aprobación.
- Fase: 3, primera entrega de cocina/impresión.
- Rama: `feat/013-kitchen-printing`.
- Fecha: 2026-10-12.
- Decisión confirmada del usuario: **«Aún no tengo los datos; empezar con archivos»**. Esta entrega usa `file`; marca/modelo y conexión física ESC/POS se posponen.
- Cubre RF-08 y RF-09 en generación de archivos equivalentes a las comandas; RF-10 en fallos del driver file, aviso y reimpresión. **No declara cumplida la impresión física, la detección de papel ni RNF-03 en hardware**. Aporta a RNF-02, RNF-05 y RNF-09. RF-11 queda para otra entrega.
- Fuentes: `CLAUDE.md`, `docs/planificacion.md`, specs 002/010/011/012, `docs/PROGRESS.md`, `docs/CONTINUAR.md` y OpenAPI 0.10.0 (formas previas 0.9.0 conservadas).
- Autorizado ahora: seguir el desarrollo SDD/TDD de esta spec aprobada, primero contrato y tests, después implementación y verificaciones independientes. La aprobación no autoriza integrar a main ni declara implementadas las operaciones de la 013.

## 1. Contexto

La 010 registra cada comanda inicial, adicional y anulación aprobada; la 011 permite consultarlas. Falta generar automáticamente su salida y mostrar qué pasó cuando falla. Se propone una entrega comprobable sin impresora: archivos de cocina, historia de intentos y reimpresión, conservando el pedido aunque falle la generación. Cocina sigue usando comandas; no se agrega pantalla de cocina.

## 2. Historias de usuario

| ID | Historia |
| --- | --- |
| HU-013-01 | Como mozo, quiero que cada envío genere su comanda automáticamente, para llevar a cocina el detalle correcto sin enviarlo dos veces. |
| HU-013-02 | Como cocinero, quiero distinguir INICIAL, ADICIONAL y ANULADO y leer mesa, mozo, hora, parte, cremas y observación, para preparar la tanda correcta. |
| HU-013-03 | Como mozo o cajero, quiero enterarme de una generación fallida y solicitar una copia, para resolverla sin volver a registrar el pedido. |
| HU-013-04 | Como administrador, quiero que los reintentos y reinicios conserven la comanda original y quién pidió cada copia, para revisar un problema sin cambiar la venta. |

## 3. Decisiones y funcionamiento propuestos

Las decisiones de negocio P-01 a P-06 fueron aprobadas con sus recomendaciones el 2026-10-12 (§13). La elección de `file` fue confirmada antes. Se conservan los términos «propuesto» en el diseño como registro de su origen; el comportamiento descrito es ahora la especificación aprobada.

### D-013-01. Resolver primero la deuda de la 002

1. **ADV-002-02**: el driver file debe validar también el contenido antes de tocar disco. Rechaza con `PRINTER_INVALID_DOCUMENT` un trabajo que no sea canónico: label/jobId inválidos, lista vacía/sin contenido, más de 500 líneas, líneas de más de 48 columnas, caracteres fuera de `PRINTABLE_CHARACTERS`, controles, saltos embebidos o espacios finales. El LF separador lo agrega exclusivamente el driver. No basta ocultar la fábrica pública: también se prueba la invocación directa. `PrinterService` sigue siendo el único camino de aplicación.
2. **ADV-002-01**: limitar el trabajo antes de NFC/NFKD, preservando las salidas de los casos ordinarios aprobados de la 002. Propuesta concreta: una pasada lineal conserva hasta **8 marcas Unicode de categoría M consecutivas** y descarta las siguientes hasta el siguiente carácter que no sea M, antes de normalizar. No cambia el texto guardado en ítems; cambia solo su representación de impresión en este caso patológico. Se señala como enmienda a D-002-04: evita el coste de reordenar miles de marcas, mantiene las tildes habituales y el documento adversarial termina como 500 líneas `x`.

El test-writer/adversarial-tester convierten **solo las regresiones resueltas** de `it.fails` a tests ordinarios tras demostrar rojo por la causa correcta y verde. El benchmark original de menos de 2 s, dos impresiones y misma salida, se conserva. Su dependencia de la máquina no demuestra por sí sola que la deuda esté resuelta: se añade cobertura determinista del límite de marcas antes de NFC y se registra la máquina/tiempos. ADV-002-03/04/05 conservan su estado y sus pruebas; no se borran, omiten ni presentan como corregidas por esta entrega.

### D-013-02. Una instantánea durable por comanda nueva

Dentro de **la misma transacción** que crea `kitchen_tickets` en `sendItems` o `voidItem`, después de resolver ítems y antes de guardar la respuesta idempotente:

- Copiar la comanda ya resuelta, sus ítems/componentes/cremas, actor y nombres de mesas actuales del pedido ordenadas por id. Copiar también el mozo original del ítem y, para `void`, el administrador y motivo final. Capturar nombres y fechas, no solo referencias que puedan cambiar.
- Guardar esa instantánea y un primer intento `queued`. Si falla guardar cualquiera, se revierte toda la operación, incluida la clave, como hoy; no llamar al driver dentro de esa transacción.
- Tras el commit, despertar el despachador. Su barrido de pendientes recupera el caso commit exitoso seguido de caída antes del despertar.

Una clave repetida devuelve **el mismo cuerpo guardado** de la 010 sin crear instantánea, intento ni archivo adicional. No se añade estado mutable de impresión a `KitchenTicket`, `Order` ni a esos cuerpos. La consulta separada de §9 informa el estado actual.

Las instantáneas no cambian al renombrar una mesa/usuario/producto, mover/unir el pedido o anular después un ítem. `kitchen_tickets.order_id` sigue moviéndose al destino de una unión, por lo que las lecturas consultan el pedido actual a través de esa FK; el archivo conserva el pedido y mesas del momento de emisión. Una comanda inicial pendiente se genera con su contenido original aunque después exista un ANULADO: son dos avisos separados, no una edición de la primera.

### D-013-03. Archivos completos, legibles y sin pérdida silenciosa

P-01: conservar el número global `kitchenTicket.id`, sin numeración diaria. Todos los ítems, incluidas bebidas y componentes de combo, salen a **un único destino cocina file**.

- Cabecera: `COMANDA #<id> - INICIAL`, `ADICIONAL` o `ANULADO`; `Pedido #<id al emitir>`; cada mesa con su nombre al emitir; mozo de la tanda/ítem; `Fecha: DD/MM/AAAA HH:mm:ss` en America/Lima.
- Detalle en orden de id: cantidad y nombre; presentación `1/8`, `1/4`, `1/2` o `Entero`; `Pecho`/`Pierna` cuando corresponde. Para medio, mostrar los octavos copiados de pecho/pierna como **total de la línea**, sin inventar otra distribución. Componentes de combo se identifican como `Componentes por combo` con sus cantidades copiadas; cremas con su cantidad y observación completa con `Obs:`.
- ANULADO incluye el único ítem aprobado, `Anulado por: <admin>` y `Motivo: <motivo final>`. La solicitud y rechazo de anulación no generan archivos.
- Sin precios ni total monetario: es una orden de cocina. Dinero y octavos almacenados conservan sus enteros.
- Normalizar y ajustar por palabras a 48 columnas, con corte duro para una palabra de más de 48. Conservar sangría, el texto imprimible completo y el reemplazo `?` de la 002. No truncar la observación de 200 ni el motivo.
- Si supera 500 líneas, dividir en documentos de **como máximo 500 líneas cada uno**, contando cabecera y pie; repetir número/tipo/mesa/mozo/hora y `Página X/Y`. Un salto de página puede continuar un ítem y lo indica con `Continúa`; ningún fragmento ni ítem se descarta. Esto permite los 20 ítems legales con 10 componentes y 6 cremas cada uno, sin reducir los límites de la 010.

P-02: una copia lleva `REIMPRESIÓN #N`, solicitante, hora de solicitud y motivo de la copia, conservando debajo el contenido original. Reimpresión de ANULADO conserva ANULADO. La primera generación no lleva la marca de copia.

### D-013-04. Despacho local y significado del éxito

Despliegue soportado: **un único proceso API en la PC/servidor local**, sin réplicas ni reinicios superpuestos. Un despachador, un destino, una salida en curso; sin broker ni Socket.IO. Un bloqueo consultivo de PostgreSQL en una conexión dedicada protege contra un segundo despachador accidental mientras la conexión siga viva; **perder ese bloqueo no cancela fs ni demuestra que el proceso propietario terminó**. No mantener una transacción de negocio abierta durante I/O. Obtener el bloqueo y comprobar la condición de fin del propietario antes de recuperar intentos interrumpidos; liberarlo al cerrar.

- Leer pendientes comprometidos por id de intento ascendente, reclamar uno en transacción corta y persistir sus documentos/identificadores **antes de cualquier salida**. Se ordenan los pendientes visibles; no se promete orden global de transacciones todavía sin commit. Para un mismo pedido, se conserva el orden de sus envíos serializados.
- Para cada página, un jobId estable del patrón de la 002: etiqueta `k-<attemptId>-p<pageNumber>`, fecha del intento y sufijo hexadecimal persistido. Cumple 32 caracteres de label/61 de jobId. Todas las páginas y sus líneas canónicas esperadas se guardan antes de llamar a `PrinterService`; un replay HTTP nunca las vuelve a despachar.
- `succeeded` significa **todos los archivos .txt completos generados**, nunca «papel impreso» ni «recibido por cocina». La ruta absoluta del archivo y el error original son privados del servidor.
- Barrido de pendientes cada 500 ms como máximo, con reloj inyectable. Error de salida definitivo → `failed`, sin cambiar pedido/ítems/total ni su respuesta 201/200. Sin reintentos automáticos del intento completo; se conservan los cuatro reintentos internos de rename de la 002.
- Plazo de 2 s por llamada de página. Vencimiento → `uncertain`, aviso y suspensión del despacho hasta que esa llamada termine o el proceso termine. **Una carrera de promesas no cancela fs ni autoriza una nueva salida concurrente**. Al terminar la llamada se reconcilia el archivo; la respuesta tardía no crea otro intento. Mientras una llamada pueda seguir activa, `canReprint` es false.
- Si la base se cae antes de reclamar, no se imprime. Si se pierde la conexión/bloqueo o el registro del resultado después de imprimir, suspender despacho y copias hasta resolver la llamada o confirmar el fin de su proceso; no repetir I/O para «asegurar» la entrega. Un segundo despachador que encuentre un propietario vivo/dudoso también se suspende, aunque pueda obtener el bloqueo. Si no se puede persistir un fallo, la web muestra error de consulta, no un estado inventado.

RNF-03: test medible **<3 s desde commit hasta todos los archivos de una comanda típica**, sin cola y con filesystem local disponible; incluye barrido y registro. La cola, un disco lento, documentos multipágina y la salida física quedan fuera de esa garantía. La interfaz puede actualizar hasta 5 s después: no es el tiempo de generación. No se afirma cumplimiento general de RNF-03 con un benchmark del driver file.

### D-013-05. Reinicio y reconciliación específica de file

Trigger real: el .txt completo aparece y el proceso cae antes de guardar el resultado en PostgreSQL. Antes de I/O, guardar el propietario local en el intento: hostname, PID y un UUID nuevo por ejecución del proceso. Al arrancar con el bloqueo del destino, **primero** comprobar que el propietario previo terminó: en el mismo host, una comprobación local sin señales de terminación (`process.kill(pid, 0)`) que devuelve ESRCH acredita ausencia. PID vivo, reutilizado, host distinto, permisos insuficientes o error dudoso no acreditan fin. El UUID distingue ejecuciones, pero no convierte un PID vivo en prueba de ausencia. En esos casos `uncertain` conserva finished_at=NULL y canReprint=false; suspender todo el destino hasta resolver la ejecución o confirmar su terminación. No basta haber obtenido el advisory lock. No se envían señales ni se matan procesos como recuperación.

Con fin del propietario confirmado (o una llamada propia ya terminada), inspeccionar los jobId **ya persistidos** mediante `PrinterService`, sin imprimir:

| Evidencia en la carpeta file configurada | Resultado |
| --- | --- |
| Todos los .txt son archivos regulares y coinciden byte por byte con las líneas esperadas + LF en UTF-8 | `succeeded`, conciliado sin generar copias |
| Faltan uno o más .txt y los presentes coinciden | `failed`, generación incompleta; conservar páginas completas; copia explícita de toda la comanda |
| Archivo diferente, destino que no es archivo regular, lectura imposible o carpeta/configuración distinta que impide verificar | `uncertain`; «Revisar salida»; nunca sobrescribir ni asumir éxito |

Si el intento se reclamó pero cayó antes de persistir documents, no pudo llamar al driver según el protocolo: queda failed sin salida, disponible para copia explícita. Un intento de otro host requiere comprobación operativa del fin del proceso anterior; no se ofrece recuperación multinodo en esta entrega.

Guardar una huella privada de la carpeta absoluta resuelta al preparar el intento. Un cambio de carpeta impide conciliar ese intento como «faltante» en la carpeta nueva: queda `uncertain`; una nueva copia usa la configuración actual. No seguir enlaces simbólicos al conciliar, ni aceptar tamaño/contenido fuera del documento esperado. Los .tmp no demuestran éxito y no se limpian aquí.

Los intentos `queued` sin salida empezada sí se recuperan y se generan. Tras comprobar que no queda una llamada activa del proceso anterior, un caso terminal `failed`/`uncertain` puede aceptar una copia explícita. La comprobación del archivo es evidencia propia de `file`; **no se extrapola a ESC/POS ni al éxito de un socket**. No se promete exactamente una vez para impresoras físicas.

### D-013-06. Historial existente, permisos y copias

P-03: no generar automáticamente comandas anteriores a esta migración, ni crearles supuestas instantáneas históricas. La migración crea tablas vacías. Una comanda sin instantánea se muestra `not_tracked` / «Anterior a esta función», sin botón de copia: los nombres de mesa/actor originales no son recuperables de forma fiable. La API responde `409 PRINT_SNAPSHOT_UNAVAILABLE` si se intenta; no imprime con datos actuales disfrazados de históricos.

P-04: `waiter` puede copiar inicial/adicional; `cashier` y `admin` pueden copiar cualquier tipo; `kitchen` no puede solicitar copias. No exige pedido abierto: una copia usa el historial aunque el pedido esté fusionado/cerrado. `waiter` recibe 403 para una copia ANULADO. Se mantiene la visibilidad del detalle de ANULADO solo para admin en la pantalla del pedido de la 011.

La copia exige motivo de una línea de 1–200 unidades UTF-16, recortado y sin Cc/Cf/Zl/Zp, y `Idempotency-Key` de la 010. Si el destino está suspendido por I/O pendiente o propietario sin fin confirmado, todas las comandas tienen `canReprint=false` y toda copia nueva responde `409 PRINT_IN_PROGRESS`, incluso para una comanda distinta con salida exitosa. El replay de una solicitud ya aceptada se resuelve antes de esta guardia global. Bajo bloqueo de la fila de instantánea: una copia nueva solo si no hay intento `queued`, `printing` o llamada sin terminar; en caso contrario `409 PRINT_IN_PROGRESS`. Al reclamar la clave se aplica **antes** de esa guardia el replay: mismo ticketId + cuerpo validado → respuesta 202 original; distinto ticket/motivo → `409 IDEMPOTENCY_CONFLICT`. Un rollback no consume clave ni número de copia. Copiar no llama a sendItems/voidItem ni altera stock, venta o estado del ítem.

P-02 permite copiar también un intento exitoso porque se puede haber perdido el archivo; siempre confirma y marca la copia. En esta entrega, la **interfaz** ofrece esa acción desde el pedido a mozo/admin; caja ofrece copias desde su atención de failed/uncertain, sin búsqueda nueva de salidas exitosas. El permiso API de cashier para cualquier tipo se conserva. P-05: mozo y caja reciben resumen de todos los fallos, incluidos ANULADO, sin exponer el motivo de anulación ni sus ítems al mozo. Es una ampliación propuesta de aviso, no del detalle de comandas de la 011.

## 4. Criterios de aceptación

Todos son automatizables, con prefijo `AC-xx` en `describe('013: ...')`; las pruebas de DB usan solo polleria_test y carpeta temporal. Un fallo ambiental o test esperado se informa separado.

| ID | Dado / Cuando / Entonces |
| --- | --- |
| AC-01 — Driver defensivo (ADV-002-02) | Dado el driver obtenido por fábrica y directamente, cuando recibe controles ESC/GS/NUL, saltos embebidos, caracteres no canónicos o límites inválidos, entonces rechaza antes de mkdir/open y no deja bytes/archivos; un trabajo canónico conserva exactamente los bytes de la 002. |
| AC-02 — Normalización acotada (ADV-002-01) | Dadas secuencias de 8/9 y miles de marcas M, y los casos ordinarios de normalización de la 002, cuando se normalizan, entonces se aplica el pre-límite antes de NFC, se conservan las salidas ordinarias y la entrada no cambia; el documento adversarial de 500×2000 unidades produce 500 líneas x en ambas impresiones en <2 s por corrida aislada, sin expected-fail para la deuda resuelta. |
| AC-03 — Transacción y replay | Dado un envío inicial/adicional o void válido, cuando hace commit, entonces quedan una instantánea y un primer intento junto a la comanda; rollback forzado en cualquier inserción no deja nada ni llama al driver; replay secuencial/concurrente de la misma clave devuelve exactamente el cuerpo original sin segundo intento. Request-void/reject-void no encolan. |
| AC-04 — Instantánea inmutable | Dada una comanda en espera, cuando cambian carta, nombre de mesa/usuario, estado del ítem o el pedido se mueve/fusiona, entonces la salida y copias mantienen nombres, actor, detalle y mesa al emitir; el listado del pedido destino encuentra sus estados sin duplicación y el origen fusionado no lista comandas trasladadas. |
| AC-05 — Tipos y detalle | Dado un envío mixto y un void aprobado a una hora UTC fija, cuando se formatean, entonces el contenido tiene número global, INICIAL/ADICIONAL/ANULADO, mesa(s), mozo, hora Lima, cantidades, presentaciones/partes, distribución half copiada, componentes, cremas y nota; ANULADO añade admin y motivo final; no hay precios ni consulta de carta vigente. |
| AC-06 — Límites y páginas | Dada una tanda legal máxima y notas/motivos de 200 unidades, texto sin espacios y Unicode hostil, cuando se formatea, entonces todos los documentos tienen ≤500 líneas de ≤48 columnas canónicas, páginas X/Y y continuación identificada; se conserva todo el texto imprimible (salvo normalización documentada), el orden y los ítems. Ningún límite válido de la 010 se reduce. |
| AC-07 — Despacho y fallo independiente | Dados dos despachadores accidentales en el entorno local soportado y pendientes comprometidos, cuando compiten, entonces solo uno despacha y una página tiene una salida en vuelo; driver falso confirma o rechaza y se persiste succeeded/failed; no hay impresión antes del commit ni reimpresión por replay; el fallo deja intacta la venta. Una llamada que supera 2 s o pierde su lock/DB bloquea nuevas salidas/copia hasta terminar o fin confirmado del propietario; obtener otro lock no libera esa guardia. Una confirmación tardía se concilia sin duplicar. No se afirma tolerancia multinodo. |
| AC-08 — Recuperación verificable | Dado queued, caída antes del write y caída entre rename y ack, cuando reinicia con el bloqueo y fin confirmado del propietario local, entonces queued se procesa, archivo faltante deja failed y archivo exacto deja succeeded sin nuevo write. Páginas parciales, archivo distinto/symlink, error de lectura, cambio de carpeta y caída de DB durante ack dejan el resultado definido en D-013-05, sin sobrescribir ni repetir automáticamente. PID vivo/reutilizado, host distinto o comprobación dudosa dejan uncertain activo, sin salida ni copia. |
| AC-09 — Historia previa | Dadas comandas creadas antes de la función, cuando se migra/arranca/consulta o se pide copia, entonces no se generan archivos/intentos automáticos, se muestra not_tracked y la copia falla PRINT_SNAPSHOT_UNAVAILABLE sin inventar mesas/actor originales. |
| AC-10 — API, permisos y lectura consistente | Dadas sesiones de cada rol y consultas paginadas, cuando leen estado/atención o solicitan copia, entonces se cumplen §9, no-store, validación de ids/cursor y errores comunes; 401 sin sesión, 403 según rol/tipo; lecturas de snapshot/último intento pertenecen a una vista consistente y no exponen rutas, huellas ni causas privadas. |
| AC-11 — Copia idempotente y auditoría | Dado un estado que admite copia, cuando se solicita con motivo y clave, entonces hay un intento 202 con número consecutivo, actor/hora/motivo, encabezado REIMPRESIÓN y contenido original; replay concurrente/secuencial crea uno y devuelve el mismo 202 incluso tras terminar; clave reutilizada con otro ticket/motivo da 409, doble clave distinta durante queued/printing da PRINT_IN_PROGRESS y no altera pedido/ítems. Si A está uncertain activo y suspende el destino, una copia nueva de B succeeded también da PRINT_IN_PROGRESS, pero el replay ya aceptado conserva su 202. |
| AC-12 — Avisos y estados en interfaz | Dados fallos/uncertain de distintos pedidos, cuando mozo/caja consultan al entrar y cada 5 s visibles, entonces muestran número/mesa/tipo y mensaje accionable, incluida una anulación sin su detalle en mozo; pueden cargar más, ver vacío, conservar avisos ante refetch fallido con alerta y reintentar lectura. El pedido muestra sus estados sin usar el 201 almacenado como prueba de generación. 401 lleva a login y una respuesta malformada nunca se pinta como éxito. |
| AC-13 — Confirmación y reintento de copia | Dada una copia permitida en mozo/caja, cuando confirma motivo y pulsa dos veces, entonces se envía un solo POST con clave estable; 202 muestra En espera y relee; pérdida de respuesta conserva motivo/clave para reintentar el mismo intento; 400/403/404/409/red son visibles; datos originales no se editan, estado no copiable no ofrece acción, la suspensión por A uncertain activo deshabilita también la copia de B succeeded, y una fila ANULADO no ofrece copiar al mozo. |
| AC-14 — Recorrido file y tiempo | Dado el servidor de pruebas con file en carpeta temporal y sin acceso a internet, cuando un mozo envía cuarto pierna + bebida + crema + nota, agrega y admin anula, entonces aparecen archivos correctos y sus estados; una falla controlada se ve en mozo y caja, una copia genera un intento marcado y replay no duplica. Playwright verifica aviso/copia a 360 px y en caja desktop sin scroll horizontal. Integración aislada mide <3 s commit→archivo/ack para la comanda típica sin cola; no cuenta el polling ni afirma salida física. |

Trazabilidad: RF-08 → AC-03/04/05/06/07/14; RF-09 → AC-03/05/14; RF-10 (file) → AC-07/08/10/11/12/13/14; regla 7 → AC-01/02/07/08; regla 5 → AC-03/11. RF-11, papel y RNF-03 físico están aplazados expresamente.

## 5. Reglas de negocio y casos borde

Aplican reglas de `CLAUDE.md` 1/2 (enteros), 4 (datos copiados), 5 (idempotencia), 6 (void solo tras admin), 7 (PrinterService), 8 (Lima) y 9 (red local sin internet). La 013 no descuenta stock; la regla 3 se mantiene para su fase.

- Primer intento durable una sola vez por ticket; cada copia aceptada es otro intento auditado, nunca otra comanda de negocio.
- «Archivo generado» exige todas las páginas completas. Una generación parcial mantiene los archivos existentes y avisa; una copia explícita regenera **todas** sus páginas marcadas como copia, no un fragmento ambiguo.
- Que se genere tarde un INICIAL y luego un ANULADO conserva la secuencia del mismo pedido; el mozo debe avisar verbalmente si cocina necesita actuar antes. No se agrega una corrección impresa de mover/unir mesas: las copias conservan la mesa original y la UI muestra también el pedido actual.
- Dos usuarios solicitan copia: bloqueo de snapshot + intento activo decide un ganador. El control local de botón no sustituye esa guardia.
- Nombre desactivado o pedido cerrado no invalida una instantánea histórica. Archivo borrado después de succeeded no revierte la venta; una copia requiere acción explícita.
- Que file tenga éxito no detecta impresora apagada/sin papel: esos casos requieren driver y pruebas con hardware en otra spec.

## 6. Modelo de datos propuesto

Dos tablas nuevas, sin modificar ni borrar las comandas actuales. Todos los cambios de esquema van en una migración, nunca sync. FK sin ON DELETE; índices y CHECKs de estados, límites y pares de fechas. Las tablas arrancan vacías.

### `kitchen_ticket_prints`: una fila inmutable por comanda nueva

| Columna | Tipo y reglas |
| --- | --- |
| ticket_id | INTEGER PK y FK → kitchen_tickets.id; una instantánea por comanda |
| snapshot_version | SMALLINT NOT NULL; CHECK = 1 |
| snapshot | JSONB NOT NULL, objeto validado por esquema interno; ticket original con ítems resueltos, actor(es), mesas y hora |
| created_at | TIMESTAMPTZ NOT NULL |

No duplicar el order_id mutable; resolver el actual por kitchen_tickets. No UPDATE de snapshot por aplicación ni backfill histórico. El worker lee esa copia, no recompone nombres desde tablas actuales.

### `kitchen_ticket_print_attempts`: primer intento y copias

| Columna | Tipo y reglas |
| --- | --- |
| id | INTEGER PK autoincremental |
| ticket_id | INTEGER NOT NULL FK → kitchen_ticket_prints.ticket_id |
| copy_number | INTEGER NOT NULL; 0 primer intento, ≥1 copia; UNIQUE(ticket_id, copy_number) |
| status | VARCHAR(16) NOT NULL CHECK IN ('queued','printing','succeeded','failed','uncertain') |
| requested_by_user_id | INTEGER NOT NULL FK → users.id; actor del envío/void en primer intento, solicitante en copia |
| requested_by_name | VARCHAR(40) NOT NULL; nombre copiado del usuario, mismo límite de UserRef/displayName existente |
| reason | VARCHAR(200) NULL; NULL iff copy_number=0, motivo obligatorio en copias |
| idempotency_key / request_hash | VARCHAR(128) / VARCHAR(64) NULL; ambos NULL en primer intento, ambos NOT NULL en copia; índice UNIQUE(idempotency_key) parcial para copias |
| response_body | JSONB NULL; respuesta 202 original de copia, escrita en su misma transacción; sin reutilizar scopes de la 010 |
| documents | JSONB NULL hasta preparación; lista inmutable de páginas con label, jobId y líneas canónicas; validación interna ≤500 líneas/página y 48 columnas |
| output_directory_hash | VARCHAR(64) NULL hasta preparación; SHA-256 privado de carpeta absoluta resuelta |
| owner_host / owner_pid / owner_execution_id | VARCHAR(255) / INTEGER positivo / UUID; NULL antes de reclamar, todos persistidos junto a started_at antes de I/O; identidad privada del proceso local propietario, UUID nuevo por ejecución |
| completed_pages | INTEGER NOT NULL DEFAULT 0; CHECK ≥0 y ≤ número de documentos cuando existe |
| error_code | VARCHAR(32) NULL; código seguro, sin causa ni ruta |
| created_at / started_at / finished_at | TIMESTAMPTZ; created_at NOT NULL; queued sin started/finished; printing con started sin finished; succeeded/failed con finished; uncertain puede tener finished NULL mientras una llamada sigue activa |

Índices: `(ticket_id, id DESC)` para último intento/historial; parcial `(id)` WHERE status='queued' para despacho. Unicidad parcial sobre ticket_id para intentos con finished_at IS NULL impide dos intentos activos, incluyendo uncertain todavía en vuelo. La asignación de copy_number y la clave se serializan con `FOR NO KEY UPDATE` de la fila de snapshot; inserción duplicada de clave se resuelve como replay/conflicto. No se amplía la tabla idempotency_keys de la 010: esos cuerpos/scope/order_id conservan sus reglas.

`not_tracked` es estado derivado de ausencia de snapshot, **no** otro estado persistido. El estado público normal se deriva del último intento. `canReprint` depende de permisos, snapshot, ausencia de intento activo y destino no suspendido, no solo del enum; una suspensión del destino deshabilita copias para todas las comandas.

## 7. Contratos internos propuestos

- Formateador puro de snapshot → documentos paginados; pruebas con reloj fijo. La ruta exacta de componentes internos queda al implementador; la semántica queda fijada aquí.
- Servicio de impresión de comandas: enqueue(snapshot, transaction), listForOrder, listAttention, requestReprint, dispatch/reconcile; dependencias models, PrinterService y reloj/temporizador inyectables. `createApp` recibe las dependencias; no arranca timers en cada test ni imprime a carpetas del checkout.
- Extensión compatible de `PrinterService`: admitir un jobId preasignado y validado para la salida de una página, conservando el comportamiento de `print(document)` de la 002. Inspección de output file mediante el propio servicio (archivo regular/bytes esperados), sin invocar driver.print desde el despachador ni exposición de bytes crudos. La fábrica/driver validan trabajos canónicos también por defensa.
- server.ts inicia/cierra el despachador y su conexión de bloqueo; detiene nuevas reclamaciones al cerrar, conserva un intento interrumpido para reconciliar y respeta los 10 s de cierre actuales. BD apagada no impide que la API arranque según la 001; el worker reintenta adquirir acceso sin salidas y la salud sigue informando la caída.
- Shared suma esquemas de respuestas/reimpresión y códigos de error. Sin paquetes, Socket.IO ni variables nuevas; se reutilizan PRINTER_DRIVER=file y PRINTER_FILE_DIR. El rechazo de escpos al arrancar **sigue vigente**.

## 8. Estados visibles

| Estado API | Texto de interfaz | Acción |
| --- | --- | --- |
| queued / printing | En espera / Generando archivo… | esperar; sin copia |
| succeeded | Archivo generado | copia explícita si tiene permiso |
| failed | No se pudo generar la comanda | revisar carpeta/configuración y solicitar copia |
| uncertain | Revisar salida | comprobar archivos; advertir que puede existir salida; copiar solo con canReprint |
| not_tracked | Anterior a esta función | sin copia |

No mostrar «Impreso» con file. `PRINTER_OUTPUT_FAILED`, `PRINTER_INVALID_DOCUMENT`, `PRINTER_EMPTY_DOCUMENT`, `PRINT_TIMEOUT`, `PRINT_OUTPUT_UNCERTAIN` se traducen a mensajes fijos. No hay salida de stack, host, ruta o contenido de cause.

## 9. API aprobada; implementación actual separada

**OpenAPI 0.10.0 contiene el contrato aprobado**, actualizado por **spec-writer** en S-01 antes de los tests de contrato. Las tres operaciones de la 013 se marcan `x-implementation-status: pending` y se describen como aprobadas aún no implementadas; las operaciones/formas previas 0.9.0 se conservan. Backend-dev implementará y comprobará concordancia, sin editar el contrato por su cuenta. Los 201/200 y esquemas estrictos de la 010/011 no cambian. El estado de implementación se actualizará por el dueño del contrato cuando exista evidencia de las tres rutas en producción.

Todas las rutas siguientes son **nuevas y no implementadas**. Base /api, cookie polleria_session, no-store incluso en errores; ids enteros 1–2147483647. GET de pedido usa lectura coherente (REPEATABLE READ) como la 009. Atención pagina por ticketId ascendente de los últimos estados failed/uncertain, sin duplicar por página/intento. Los estados se releen desde la primera página en cada refresco.

| Método/ruta aprobada | Roles | Entrada / salida |
| --- | --- | --- |
| GET /orders/{orderId}/ticket-prints | cualquier rol con sesión | 200 `{ prints: [KitchenTicketPrintView] }`, una por comanda del pedido actual, id ascendente; incluye not_tracked; 400/401/404 ORDER_NOT_FOUND/500 |
| GET /kitchen-ticket-prints/attention | waiter, cashier, admin | Query `afterTicketId?` entero positivo; página fija 50, 200 `{ prints: [KitchenTicketPrintView], nextAfterTicketId: integer|null }`; solo failed/uncertain; 400/401/403/500 |
| POST /kitchen-ticket-prints/{ticketId}/reprint | waiter para initial/additional; cashier/admin todos | JSON estricto `{ reason }` + Idempotency-Key; 202 `{ attempt: KitchenTicketPrintAttemptView }` guardado para replay; 400/401/403/404 KITCHEN_TICKET_NOT_FOUND/409 PRINT_IN_PROGRESS, PRINT_SNAPSHOT_UNAVAILABLE, IDEMPOTENCY_CONFLICT/413/415/500 |

Formas aprobadas, todas con claves requeridas y additionalProperties=false:

```text
KitchenTicketPrintView = {
  ticketId: integer, orderId: integer, kind: KitchenTicketKind,
  tablesAtIssue: TableRef[], status: KitchenTicketPrintStatus,
  lastAttempt: KitchenTicketPrintAttemptView | null, canReprint: boolean
}
KitchenTicketPrintAttemptView = {
  id: integer, ticketId: integer, copyNumber: integer,
  status: 'queued'|'printing'|'succeeded'|'failed'|'uncertain',
  requestedBy: UserRef, createdAt: UTC ISO string,
  startedAt: UTC ISO string|null, finishedAt: UTC ISO string|null,
  pageCount: integer|null, completedPages: integer,
  errorCode: KitchenTicketPrintErrorCode|null
}
KitchenTicketPrintStatus = attempt.status | 'not_tracked'
KitchenTicketPrintErrorCode = 'PRINTER_OUTPUT_FAILED'|'PRINTER_INVALID_DOCUMENT'|
  'PRINTER_EMPTY_DOCUMENT'|'PRINT_TIMEOUT'|'PRINT_OUTPUT_UNCERTAIN'
```

Para not_tracked: tablesAtIssue=[], lastAttempt=null, canReprint=false; no fingir nombres antiguos. `tablesAtIssue` se obtiene de snapshot; el ticket/orderId actuales de kitchen_tickets. El resumen no contiene ítems, motivo de void ni motivo de copia (quedan en auditoría del servidor). La respuesta 202 contiene el intento queued original con pageCount=null, fechas no iniciadas y completedPages=0 aunque ya haya avanzado cuando se haga replay; consultar GET para estado fresco.

Errores nuevos del formato común `{ error: { code, message, details } }`, details=null salvo VALIDATION_ERROR:

| Código HTTP/code | Mensaje |
| --- | --- |
| 404 KITCHEN_TICKET_NOT_FOUND | Esa comanda no existe. |
| 409 PRINT_IN_PROGRESS | Esta comanda ya tiene una generación en curso. Espera antes de solicitar otra copia. |
| 409 PRINT_SNAPSHOT_UNAVAILABLE | Esta comanda es anterior a la generación de archivos y no tiene una copia original guardada. |

Se reutilizan VALIDATION_ERROR, UNAUTHENTICATED, FORBIDDEN, IDEMPOTENCY_CONFLICT y los errores del lector. Un fallo de generación **después** del 202 se consulta como failed/uncertain, no convierte retrospectivamente el 202 en 503. Eventos Socket.IO: ninguno.

OpenAPI aprobado: tag `kitchen-ticket-prints`, tres paths/operationIds `listOrderTicketPrints`, `listKitchenTicketPrintAttention`, `reprintKitchenTicket`; esquemas de las formas anteriores y sus sobres, petición, parámetros TicketId/AfterTicketId/ReprintIdempotencyKey y respuestas nuevas; ErrorCode documenta únicamente los tres errores HTTP nuevos. Los cinco códigos internos de generación van en su enum propio, sin hacerlos errores HTTP de POST /items.

## 10. Interfaz propuesta

P-06: aprovechar el polling de 5 s y crear una sección pequeña de fallos, sin nueva infraestructura de avisos.

- `/mozo` y `/caja`: sección `Comandas por revisar`, primera página con número, tipo, mesas al emitir y mensaje; `Cargar más` para restantes. El área de caja conserva su placeholder de cobro: esta sección no implementa caja/pagos.
- `/mozo/mesas/[tableId]`: en `Comandas enviadas`, consultar estados aparte y mostrar etiqueta. Mozo/admin pueden solicitar copia también de succeeded desde esta sección, con los permisos por tipo. Mantener filtros de la 011; el resumen de fallos puede avisar de ANULADO sin revelar su detalle al mozo. Caja ofrece la acción solo desde sus failed/uncertain, sin buscador de historia exitosa en esta entrega.
- Carga: `Cargando estado de comandas…`; vacío atención: `No hay comandas por revisar.`; error: `No se pudo consultar la generación de comandas.` + `Reintentar`. Refetch fallido conserva datos previos y muestra la advertencia. Consultar al entrar, al recuperar foco y cada 5 s solo visible; sin duplicar consultas paralelas del mismo recurso.
- Tras enviar: `Pedido registrado. Consulta la generación de la comanda.`; no confirmar archivo desde el 201. Tras anular: la anulación queda registrada aunque falle el archivo.
- `Solicitar copia` abre confirmación con número/mesas/tipo, aviso `La salida anterior puede existir. La copia llevará REIMPRESIÓN.`, campo `Motivo de la copia`, `Sí, generar copia` y `Cancelar`. Durante envío `Solicitando…`, botón bloqueado y guard síncrono. Con pérdida de respuesta ofrecer `Reintentar solicitud` con mismo cuerpo/clave; una petición nueva tiene clave nueva.
- 360 px en celular del mozo y PC/tablet de caja, controles ≥48 px, textos en español, sin recursos externos. `Revisar salida` no afirma que sea papel atascado o impresora sin papel.

## 11. Cambios señalados, validación y riesgos

- 002: enmienda de normalización patológica y validación del contenido del driver; extensión compatible de servicio para jobId estable/inspección file. No activar escpos. Mantener sus límites/normalización ordinaria y la hoja de prueba.
- 010: inserción de snapshot/intento en las dos transacciones que crean comanda. Respuestas idempotentes/esquemas públicos permanecen iguales; merge conserva la FK de ticket como vínculo actual, no actualiza snapshot.
- 011: etiqueta de estado, resumen de errores y texto de envío que no afirma generación. **Los 29 fallos web iniciales no son AC nuevos de la 013**: el test-writer los clasificó y corrigió como sincronización/readiness de tests, espera negativa de logout y nodo obsoleto; no se confirmó un defecto de producción. Mantenimiento separado en commit `d42ea8b`, revisión independiente APROBADO con 81/81 casos dirigidos.
- Baseline cloud final informado por el orquestador: **122 archivos de tests pasan, 2418 pruebas pasan + 6 fallas esperadas + 2 skip; tipos y lint pasan**. Las fallas esperadas/skip siguen separadas y no se cuentan como defectos resueltos. La evidencia inicial (546 integración + 3 esperadas + 2 skip y 29 fallos web reproducidos en serie) queda sustituida por esta verificación de mantenimiento, no por una omisión de pruebas.
- Helpers/migraciones de tests deberán incluir ambas tablas respetando FK, con guardia `_test`. Tests que creen comandas sin deps de impresora inyectan file temporal/falso y no arrancan despachadores implícitos. Vitest/cobertura/Playwright serializados desde raíz.
- Riesgos: espacio/permisos de disco, cola por I/O detenido, duplicación **solicitada** de archivos parciales, snapshots antiguos inexistentes, mesas de copias distintas de la ubicación actual. Un PID reutilizado o una comprobación de proceso dudosa bloquea conservadoramente la recuperación; el operador debe confirmar el cierre anterior antes de reiniciar. No soportar reinicios superpuestos/réplicas; el advisory lock no es fencing de I/O. Estados y confirmación los hacen visibles; no añadir recuperación destructiva ni promesas físicas.

Verificación de cierre tras implementación: AC→tests, rojo/verde, lint/typecheck, suite/cobertura/E2E requeridos en serie, contrato válido/coincidente, adversarial independiente sin críticos/altos y reviewer APROBADO. No convertir expected-fail, skip o prueba no ejecutada en «verde». La integración a main requiere autorización separada.

## 12. Fuera de alcance y entrega posterior

- ESC/POS, red de impresora, code page, corte de papel, falta de papel, comprobación física y RNF-03 sobre impresora. No instalar node-thermal-printer aquí. Siguiente propuesta condicionada a marca/modelo, interfaz de red y prueba real con el equipo; un socket aceptado no acredita papel generado.
- RF-11 barra/enrutamiento de bebidas y partición de combos entre impresoras. Mantener todas las bebidas en cocina file ahora; otra spec puede agruparlo con hardware si el dueño confirma impresora de barra.
- Pantalla cocina, Socket.IO, pedido listo automático, avisos sonoros/push, editor de configuración, limpiezas/retención de archivos y .tmp, exportación por HTTP y auditoría visible completa.
- Reimprimir automáticamente historia previa, avisos de cambio de mesa impresos, pre-cuenta/cobro/stock/reportes y pedidos para llevar.

## 13. Decisiones aprobadas — 2026-10-12

La falta de marca/modelo **no bloquea esta entrega**; el usuario ya había confirmado file. El 2026-10-12 respondió **«está perfecto ... una vez respondido puedes seguir con el desarrollo»** a la solicitud de aprobación de la spec y P-01…P-06: se aceptan las seis recomendaciones. No quedan preguntas abiertas para esta entrega.

| ID | Decisión | Recomendación aceptada |
| --- | --- | --- |
| P-01 | Número y destino de comanda | id global; un destino file cocina para toda la tanda, bebidas incluidas |
| P-02 | Reimpresiones de salida exitosa/parcial y auditoría | copia explícita completa, marcada REIMPRESIÓN, confirmación y motivo; salida exitosa desde pedido mozo/admin y fallida/por revisar desde atención de caja |
| P-03 | Comandas anteriores a la función | no generarlas automáticamente ni reconstruir una mesa/actor históricos; mostrarlas anteriores, sin copia |
| P-04 | Quién solicita copias | mozo inicial/adicional; caja/admin cualquier tipo en API; en UI caja atiende failed/uncertain y mozo/admin tienen historial por pedido; cocina sin acción |
| P-05 | Aviso de fallo de ANULADO al mozo | sí, solo resumen número/mesa/tipo/estado; sin detalle/motivo ni acción de copia |
| P-06 | Aviso y espera | polling visible cada 5 s en mozo/caja y estado por pedido; sin Socket.IO; aceptar que generación y refresco tienen tiempos distintos |

Supuestos técnicos aprobados con la spec: filesystem local regular del servidor, **un proceso API sin réplicas ni reinicios superpuestos**, un destino y un despachador exclusivo; paginación en documentos de 500 líneas; pre-límite de 8 marcas solo para impresión patológica. Si se usa carpeta de red o se requiere fidelidad de ese Unicode excepcional, revisar la reconciliación y el límite antes de implementar.

## 14. Acción posterior a la aprobación

P-01…P-06 quedan registradas arriba; el orquestador asigna tests primero según tasks.md después del contrato S-01. La validación file se hace en carpeta temporal; no se migran datos reales ni se cambia .env del usuario durante el desarrollo. Tras implementar, el usuario revisará un archivo de tanda mixta, ADICIONAL, ANULADO y REIMPRESIÓN; la salida física seguirá pendiente de su propia spec.
