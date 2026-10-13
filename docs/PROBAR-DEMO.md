# Probar el sistema en desarrollo

Esta preparación está en la rama `dev`. Usa Node 24 y pnpm 10.12.1, PostgreSQL 17 y una base local de desarrollo. Las migraciones crean las tablas; no necesitas crearlas a mano.

## 1. Descargar la rama

Desde tu copia del proyecto:

```sh
git fetch origin
git switch dev
git pull --ff-only origin dev
pnpm install --frozen-lockfile
```

Detén `pnpm dev` antes de preparar la base.

## 2. Preparar PostgreSQL y el archivo local

`polleria_test` es la base para pruebas automáticas. Para usar la aplicación, crea también **polleria_dev** en pgAdmin si aún no existe: Bases de datos → Crear → Base de datos. Elige como propietario el usuario de PostgreSQL con el que conectarás la aplicación. No borres ni renombres polleria_test.

Si no tienes `apps/api/.env`, copia `apps/api/.env.example` a ese nombre. Si ya existe, edítalo conservando tus conexiones. Configura:

```dotenv
NODE_ENV=development
DATABASE_URL=postgres://TU_USUARIO:TU_CLAVE@localhost:5432/polleria_dev
DATABASE_URL_TEST=postgres://TU_USUARIO:TU_CLAVE@localhost:5432/polleria_test
PRINTER_DRIVER=file
PRINTER_FILE_DIR=tmp/comandas
```

Sustituye usuario y clave por los de tu PostgreSQL. Si tienen caracteres especiales, codifícalos para una URL. Conserva HOST y PORT del ejemplo. El archivo `.env` es local y no se sube a GitHub.

## 3. Crear tablas y cargar la demo

Desde la raíz del repositorio:

```sh
pnpm db:demo
pnpm dev
```

`db:demo` aplica todas las migraciones pendientes y después los seeds. Si falla la migración, no ejecuta la carga. Repetir el comando no duplica datos. Los registros existentes se conservan, incluidos PIN, roles, precios y pedidos; si ya tienes uno de los usuarios demo, su PIN anterior sigue vigente. Si los productos de demo existentes son incompatibles o están inactivos, se conservan y puede omitirse el nuevo mostrito.

La carga crea cuatro usuarios, seis mesas Demo y una carta de ejemplo con pollo, presentaciones, chaufa, gaseosa, cremas y mostrito. No crea pedidos ficticios, cobros ni stock. Se permite únicamente en modo `development`; los PIN siguientes son públicos y exclusivos para esta demo.

| Usuario | Rol | PIN de demo |
| --- | --- | --- |
| demo.admin | Administrador | 135790 |
| demo.mozo | Mozo | 2468 |
| demo.caja | Cajero | 1357 |
| demo.cocina | Cocina | 8642 |

## 4. Recorrido sugerido

Abre `http://localhost:3000` y comprueba que indique **Conectado**.

1. Entra como administrador y revisa la carta, presentaciones, combo y mesas.
2. Entra como mozo, abre Demo 1 y agrega pollo cuarto pierna, gaseosa, crema y observación. Envía el pedido.
3. Revisa el estado **Archivo generado** y el archivo en `tmp/comandas`, desde la raíz del proyecto.
4. Agrega otra tanda: se genera un ADICIONAL. Solicita una anulación y apruébala como administrador: se genera ANULADO.
5. Desde el estado de la comanda, solicita una copia con motivo y confirma: se genera REIMPRESIÓN.
6. Prueba mover/unir/separar mesas y la administración de usuarios/carta.

Caja aún no cobra ni cierra cuentas; cocina aún no tiene una bandeja de preparación. Inventario y reportes se desarrollarán después. El archivo generado permite probar sin impresora física. El rediseño visual y la corrección del build están incluidos en `dev`. Puedes ver la [comparación de pantallas](ui-redesign/README.md). Si ya preparaste la demo, basta con detener el servidor, actualizar la rama y ejecutar `pnpm dev`; este cambio no requiere nuevas migraciones.

Si algo falla, revisa primero la salida de la API y que PostgreSQL esté iniciado. No ejecutes el setup de Playwright para llenar la demo: ese setup limpia la base de pruebas.
