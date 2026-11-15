# 02 - Authentication: register, login, JWT, roles

Status: resolved
Type: task
Blocked by: 01

Spec: `../spec.md`

Hand-written auth against the spec's `User` table. ASP.NET Core Identity is deliberately
not adopted (ADR-0006).

## Scope

- `POST /api/auth/register` - public, always creates a `Client`. There is no way to
  request a role; the first admin comes from the seeder in issue 01.
- `POST /api/auth/login` - public, returns a JWT.
- `PasswordHasher<User>` for hashing and verification. No plain passwords anywhere,
  including logs.
- JWT: 60-minute lifetime, symmetric key from configuration, `sub`, `email` and `role`
  claims. No refresh tokens.
- `AddAuthentication` / `AddAuthorization` wiring, `UseAuthentication` before
  `UseAuthorization` in the pipeline.
- Request/response DTOs. The `User` entity is never returned, and `PasswordHash` never
  leaves the server in any shape.

## Done when

- Registering, then logging in with the same credentials, returns a usable token.
- Registering an email that already exists returns `409`, not a `500` surfaced from the
  unique index.
- `nina@salon.rs` and `Nina@Salon.rs` are treated as the same account.
- Login with a wrong password returns `401` with the same message as an unknown email, so
  the response does not reveal which accounts exist.
- The seeded admin can log in and its token carries the `Admin` role.
