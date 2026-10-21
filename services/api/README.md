# Stocky API (servidor de sincronización)

> **Opcional.** La app funciona sin servidor. Este servicio permite compartir inventario y listas entre los dispositivos de un hogar. **Instalación con Docker: [docs/servidor-docker.md](../../docs/servidor-docker.md).**

## Estado

| Elemento | Estado |
|---|---|
| Cuentas (registro con código, inicio de sesión, renovación rotatoria con detección de reutilización, cierre de sesión, cambio de contraseña, borrado de cuenta) | Implementado y probado |
| Verificación en dos pasos (TOTP + códigos de recuperación) y política de contraseñas (comunes, repetitivas o con el correo) | Implementado y probado (también desde el cliente de la app contra el servidor real) |
| Dispositivos (listar, revocar al instante) | Implementado y probado |
| Hogares (crear, invitaciones de un solo uso, roles owner/member/viewer, expulsar, abandonar, borrar, exportar JSON) | Implementado y probado |
| Sincronización (push idempotente, pull incremental paginado, conflictos por revisión, deltas de cantidad, lápidas y purga) | Implementado y probado |
| Cifrado de datos en reposo (AES-256-GCM con AAD por fila, rotación de claves) | Implementado y probado |
| PostgreSQL con TLS 1.3 verificado + SCRAM; migraciones Alembic | Probado con PostgreSQL 16 real (`STOCKY_TEST_DATABASE_URL`) y en la pila Docker con PostgreSQL 17 |
| Pila Docker (Caddy HTTPS + API + PostgreSQL en red interna), copias cifradas y restauración | Probada de extremo a extremo |
| Conexión desde la app (cuenta, hogar, invitaciones, sincronización automática) | Implementado; probado con dos móviles simulados contra el servidor real y contra la pila Docker. **Falta probar en móviles reales** |
| Instalación con un comando (`infra/docker/stocky.sh`, modo IP o dominio) | Probada en la pila Docker (modo IP) |

## Desarrollo

```bash
cd services/api
python3 -m venv .venv && . .venv/bin/activate
pip install -r requirements-dev.txt
python -m pytest                      # SQLite en memoria
STOCKY_TEST_DATABASE_URL='postgresql+psycopg://…?sslmode=verify-full&sslrootcert=…' python -m pytest   # PostgreSQL real
STOCKY_ENV=development uvicorn app.main:create_app --factory --reload
```

Migraciones: `alembic upgrade head` (la URL sale de la configuración). Tras cambiar `app/models.py`: `alembic revision --autogenerate -m "…"` y revisar el fichero generado; `alembic check` debe decir que no hay cambios pendientes.

### Configuración (variables de entorno)

Cada secreto admite la variante `_FILE` (ruta a un fichero), que es la que usa Docker.

| Variable | Obligatoria en producción | Descripción |
|---|---|---|
| `STOCKY_ENV` | — | `development`, `test` o `production` |
| `STOCKY_ALLOWED_HOSTS` | Sí | Dominios aceptados en la cabecera Host |
| `STOCKY_JWT_SECRET` | Sí (≥ 32 caracteres) | Firma de los tokens de acceso |
| `STOCKY_EMAIL_PEPPER` | Sí (≥ 32 caracteres) | Clave del índice HMAC de correos |
| `STOCKY_DATA_KEYS` | Sí | `id:base64(32 bytes)[,id:…]`; la primera cifra, las demás solo descifran |
| `STOCKY_REGISTRATION` | — | `invite_code` (por defecto), `open` o `closed` |
| `STOCKY_REGISTRATION_CODE` | Sí con `invite_code` (≥ 12) | Código para crear cuentas |
| `POSTGRES_HOST`, `POSTGRES_PORT`, `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD` | Sí | Conexión a PostgreSQL |
| `POSTGRES_SSLMODE` / `POSTGRES_SSLROOTCERT` | `verify-full` por defecto | En producción solo se admite `verify-full`, `verify-ca` o `require` |

Herramientas: `python -m app.cli reset-password | purge | rotate-keys | generate-secrets`.

## Principios de seguridad

- Solo HTTPS en producción (TLS en el proxy inverso; HSTS). PostgreSQL nunca expuesto a Internet.
- El **hogar se deriva del token**, nunca de un parámetro enviado por el cliente. Toda consulta filtra por `household_id`. Un dispositivo manipulado no puede pedir datos de otro hogar: el servidor responde `404` (no `403`) para no revelar su existencia.
- Contraseñas con Argon2id (biblioteca `argon2-cffi`), nunca en claro ni en registros.
- Tokens de acceso JWT (HS256) de 15 min; tokens de refresco opacos, rotatorios, guardados como hash y revocables por dispositivo.
- Limitación de peticiones por IP y por cuenta en `/auth/*` y `/sync/*`.
- Mensajes idénticos para usuario inexistente y contraseña incorrecta; el registro y la recuperación de cuenta responden siempre igual (anti-enumeración).
- Validación de todas las entradas con modelos Pydantic estrictos y tamaños máximos. Además del límite por `Content-Length` del esqueleto, el proxy inverso debe limitar el tamaño de las peticiones sin esa cabecera.
- Registros estructurados sin contenido del inventario ni de las listas.
- Secretos por variables de entorno o gestor de secretos.

## Contrato previsto (`/api/v1`)

### Autenticación y dispositivos

| Método y ruta | Descripción |
|---|---|
| `POST /auth/register` | Alta con correo, contraseña (12+) y código de registro. `201` con tokens; errores genéricos (`400 registration_failed`, `403`) |
| `POST /auth/login` | Devuelve token de acceso + token de refresco. Si la cuenta tiene verificación en dos pasos devuelve `{mfa_required, mfa_token}` (5 min, solo sirve para el paso siguiente) |
| `POST /auth/login/mfa` | `{mfa_token, code}`: código TOTP de 6 cifras (una sola vez, ±30 s) o código de recuperación. 5 intentos por cuenta cada 10 min |
| `POST /auth/mfa/setup` | Genera el secreto TOTP (pendiente) y el enlace `otpauth://` para la app autenticadora |
| `POST /auth/mfa/enable` | Confirma con un código; activa, cierra las demás sesiones y devuelve 10 códigos de recuperación (solo esa vez; se guarda su hash) |
| `POST /auth/mfa/disable` | Exige contraseña y código |
| `POST /auth/refresh` | Rota el token de refresco (el anterior queda invalidado; reutilizarlo revoca la familia) |
| `POST /auth/logout` | Revoca el token del dispositivo actual |
| `GET /devices` / `DELETE /devices/{id}` | Ver y revocar dispositivos de la cuenta |
| — | Recuperación de cuenta: la hace quien administra el servidor (`python -m app.cli reset-password` / `reset-mfa`), porque el servidor no envía correos |
| `POST /auth/change-password` | Cambia la contraseña y cierra las demás sesiones |
| `DELETE /account` | Borra la cuenta (y el hogar si era su único propietario). Exige contraseña, y código si hay verificación en dos pasos |
| `GET /me` | Usuario, hogar y rol |

### Hogares y miembros

| Método y ruta | Descripción | Permiso |
|---|---|---|
| `POST /households` | Crear hogar (el creador es `owner`) | Autenticado |
| `GET /households/current` | Datos del hogar del token | Miembro |
| `POST /households/current/invitations` | Código de invitación de un solo uso (caduca en 24 h) | `owner` |
| `POST /households/join` | Unirse con un código | Autenticado |
| `PATCH /households/current/members/{id}` | Cambiar rol (`owner`, `member`, `viewer`) | `owner` |
| `DELETE /households/current/members/{id}` | Expulsar: revoca sus sesiones para ese hogar | `owner` |
| `DELETE /households/current` | Eliminar el hogar y todos sus datos | `owner` |
| `GET /households/current/export` | Exportación JSON (portabilidad) | `owner` |

### Sincronización incremental

```
POST /sync/push
{
  "device_id": "uuid",
  "ops": [
    { "op_id": "uuid", "entity": "stock_lot", "entity_id": "uuid",
      "kind": "upsert" | "delete" | "adjust_quantity",
      "base_rev": 41, "payload": { ... }, "client_ts": "2026-10-13T10:00:00Z" }
  ]
}
→ 200 { "results": [ { "op_id": "uuid", "status": "applied" | "duplicate" | "conflict", "rev": 42 } ] }

GET /sync/pull?since=<rev>&limit=500
→ 200 { "changes": [ { "entity": ..., "entity_id": ..., "rev": 43, "deleted": false, "data": { ... } } ],
        "next": 543, "has_more": false }
```

- **Idempotencia**: el servidor guarda `op_id` procesados; reenviar una operación devuelve `duplicate` sin aplicarla dos veces.
- **Revisión monotónica** (`rev`) por hogar asignada por el servidor; el cliente guarda la última recibida.
- **Borrados**: lápidas con `deleted=true`, purgadas a los 90 días; un cliente desconectado más tiempo hace una resincronización completa.
- **Conflictos**:
  - Campos descriptivos (nombre, ubicación, fecha): último escritor gana según el orden del servidor; si `base_rev` es anterior a la revisión actual del campo, se devuelve `conflict` con el valor vigente para que el cliente lo muestre.
  - Cantidades: se sincronizan como **deltas** (`adjust_quantity: -500`), que conmutan entre sí y no pierden consumos simultáneos; el servidor impide valores negativos.
  - Paso de la compra al inventario: una sola operación compuesta con `op_id`, aplicada en una transacción.
- **Autorización**: cada operación se valida contra el hogar del token y el rol (`viewer` no puede escribir). Los `entity_id` de otro hogar se tratan como inexistentes.

### Implementación en la app (`apps/android/src/sync/`)

1. Migración 3: `sync_state`, `sync_outbox` (la rellenan triggers de SQLite en la misma transacción que cada cambio, así ningún servicio tiene que acordarse de registrarlo) y `sync_pending` (lote preparado con `op_id` fijo para reenvíos idempotentes).
2. Lotes: si solo cambia la cantidad se envía `adjust_quantity` con la diferencia.
3. Recepción: los cambios locales sin enviar ganan; productos con el mismo código de barras y listas con el mismo nombre se fusionan de forma determinista (sobrevive el identificador menor); limpieza de huérfanos; resincronización completa tras un `410`.
4. Tokens en `expo-secure-store`, nunca en SQLite.
5. Dirección validada con `normalizeServerAddress` (`apps/android/src/domain/serverUrl.ts`): `https://` obligatorio salvo hacia la red local (localhost, 10/8, 172.16/12, 192.168/16, `*.local`), donde se admite `http://` con aviso; sin credenciales en la URL.
6. Prueba contra el servidor real: `STOCKY_TEST_SERVER=http://localhost:8765 STOCKY_TEST_REGISTRATION_CODE=… npx jest server.integration`.
