# Stocky API (fase futura)

> **No necesaria para la v1.** La app funciona sin servidor. Este directorio contiene un esqueleto verificable (`/api/v1/health`) y el contrato previsto para la sincronización opcional entre dispositivos de un hogar.

## Estado

| Elemento | Estado |
|---|---|
| FastAPI con `/api/v1/health`, cabeceras de seguridad, hosts permitidos, límite de tamaño | Implementado y probado (`pytest`) |
| Dockerfile (usuario sin privilegios) y `infra/docker/docker-compose.yml` (PostgreSQL sin puertos publicados) | Escrito; `docker compose config` validado; **imagen no construida** en el entorno de desarrollo |
| Autenticación, hogares, sincronización | Solo especificado (este documento) |

## Desarrollo

```bash
cd services/api
python3 -m venv .venv && . .venv/bin/activate
pip install -r requirements-dev.txt
python -m pytest
STOKY_ENV=development uvicorn app.main:create_app --factory --reload
```

Con Docker:

```bash
cd infra/docker
cp .env.example .env   # y define POSTGRES_PASSWORD
docker compose up --build
```

## Principios de seguridad

- Solo HTTPS en producción (TLS en el proxy inverso; HSTS). PostgreSQL nunca expuesto a Internet.
- El **hogar se deriva del token**, nunca de un parámetro enviado por el cliente. Toda consulta filtra por `household_id`. Un dispositivo manipulado no puede pedir datos de otro hogar: el servidor responde `404` (no `403`) para no revelar su existencia.
- Contraseñas con Argon2id (biblioteca `argon2-cffi`), nunca en claro ni en registros.
- Tokens de acceso JWT/PASETO de 15 min; tokens de refresco opacos, rotatorios, guardados como hash y revocables por dispositivo.
- Limitación de peticiones por IP y por cuenta en `/auth/*` y `/sync/*`.
- Mensajes idénticos para usuario inexistente y contraseña incorrecta; el registro y la recuperación de cuenta responden siempre igual (anti-enumeración).
- Validación de todas las entradas con modelos Pydantic estrictos y tamaños máximos. Además del límite por `Content-Length` del esqueleto, el proxy inverso debe limitar el tamaño de las peticiones sin esa cabecera.
- Registros estructurados sin contenido del inventario ni de las listas.
- Secretos por variables de entorno o gestor de secretos.

## Contrato previsto (`/api/v1`)

### Autenticación y dispositivos

| Método y ruta | Descripción |
|---|---|
| `POST /auth/register` | Alta con correo y contraseña. Respuesta siempre `202` |
| `POST /auth/login` | Devuelve token de acceso + token de refresco ligado a un `device_id` |
| `POST /auth/refresh` | Rota el token de refresco (el anterior queda invalidado; reutilizarlo revoca la familia) |
| `POST /auth/logout` | Revoca el token del dispositivo actual |
| `GET /devices` / `DELETE /devices/{id}` | Ver y revocar dispositivos de la cuenta |
| `POST /auth/recover` / `POST /auth/recover/confirm` | Recuperación por enlace de un solo uso, caducidad 30 min, respuesta uniforme |

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

### Cambios previstos en la app

1. Migración SQLite que añade `household_id`, `rev`, `deleted_at` y la tabla `pending_ops` (escrita en la misma transacción que cada cambio).
2. Implementación de los servicios con un *decorador* de sincronización: las pantallas no cambian (ver `docs/arquitectura.md §3`).
3. Tokens en `expo-secure-store`, nunca en SQLite.
4. Dirección del servidor configurable y validada con `validateServerUrl` (`apps/android/src/domain/serverUrl.ts`): solo `https://` en producción; `http://` únicamente hacia `localhost` o redes privadas en desarrollo; sin credenciales en la URL.
