# Seguridad

## Avisar de un fallo de seguridad

**No abras un *issue* público** para fallos de seguridad. Usa el aviso privado de GitHub: pestaña **Security → Report a vulnerability** de este repositorio. Indica:

- qué parte afecta (app Android, servidor `services/api` o despliegue `infra/docker`) y la versión o el commit;
- cómo reproducirlo, con datos inventados;
- el impacto que crees que tiene.

Se responderá en cuanto sea posible. Mientras no haya una corrección publicada, no compartas los detalles.

## Qué hay (y qué no hay) en este repositorio

En el repositorio solo está el código. **Nunca** se suben:

- los secretos del servidor (`infra/docker/.env`, `infra/docker/secrets/`: contraseña de la base de datos, claves de cifrado de los datos, clave de los tokens, código de registro);
- copias de seguridad ni bases de datos;
- la clave de firma de la app (`*.keystore`) ni sus contraseñas: se guardan como *secrets* cifrados de GitHub Actions y en copias del propietario;
- datos de quienes usan la app.

`scripts/check-secrets.sh` lo comprueba en cada cambio (CI). Detalles del diseño de seguridad: `services/api/README.md` y `docs/arquitectura.md`.

## Si instalas tu propio servidor

- Mantenlo actualizado: `./stocky.sh actualizar` (`infra/docker`).
- En modo IP (HTTP) no abras el puerto en el router; desde Internet usa el modo dominio (HTTPS).
- Guarda una copia de `infra/docker/secrets/` fuera del servidor y no la compartas.
