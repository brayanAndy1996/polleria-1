# Preparación de demo local — solicitud del usuario

Autorizada por la solicitud de preparar tablas y datos para probar el sistema en una rama dev. No cambia el dominio ni incluye Caja/inventario futuros.

1. Reutilizar migraciones existentes y seeds Umzug, sin sync, DROP, TRUNCATE ni recrear bases/roles. Comando raíz `pnpm db:demo`: comprobar modo development antes de conectar/escribir, migrar y después sembrar; abortar si falla migración. Reusar CLI con una orden demo y scripts raíz/API.
2. Seed explícito solo con NODE_ENV=development; rechazar producción y otras configuraciones antes de escrituras. Los tests se conectan exclusivamente a una base terminada en _test, con sus guardias existentes y modo development limitado al seed.
3. Usuarios demo con PIN hasheado y roles admin, waiter, cashier y kitchen; nombres de usuario demo.admin/demo.mozo/demo.caja/demo.cocina y PIN de prueba 135790/2468/1357/8642. Sin imprimir hashes o conexiones.
4. Seis mesas Demo 1…6, carta identificada como Demo: pollo con presentaciones y precios enteros, chaufa, bebida, cremas y combo mostrito coherente en octavos. Sin pedidos artificiales, stock ni cobros.
5. Si ya existe un usuario, mesa o producto con ese identificador/nombre, conservarlo íntegro: no cambiar PIN, roles, precios, componentes, porciones, actividad ni pedidos. Insertar solo faltantes; repetir el comando no duplica. Toda la carga se realiza en una transacción: un fallo revierte las inserciones de esta ejecución y permite reintentar sin dejar carta incompleta. Usar modelos, esquemas compartidos y el hasher existente; no modificar servicios de negocio.
6. Documentar PostgreSQL existente, .env propio, Node/pnpm fijados, checkout de dev, comandos y recorrido manual: login/admin/carta/mesas, pedido mixto/adicional/anulación y archivos tmp/comandas. Advertir que PIN publicados son solo de demo; no se dispone aún de cobro/inventario/hardware. No importar el global-setup E2E destructivo.

Flujo reducido: test-writer Luna medium escribe pruebas dirigidas rojas; implementer Luna medium implementa reutilizando modelos/esquemas/hasher actuales; principal revisa, documenta, verifica y publica dev. No integrar estos datos a main sin una nueva autorización.
