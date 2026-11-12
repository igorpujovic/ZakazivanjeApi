# Salon Booking API

REST API for a single hair salon. Clients browse services and stylists, see available times
and book or cancel appointments. Admins manage the catalogue and every booking.

The specification and the design decisions behind it live in
[`.scratch/salon-booking/spec.md`](.scratch/salon-booking/spec.md), `GLOSSARY.md` and
[`docs/adr/`](docs/adr).

Stack: C#, ASP.NET Core Web API, EF Core, SQL Server, xUnit. Targets `net11.0`.

## Projects

| Project                | What it is                                                      |
| ---------------------- | --------------------------------------------------------------- |
| `ZakazivanjeApi`       | The API. Folders: `Controllers/`, `Services/`, `Domain/`, `Data/`, `Entities/`, `Dtos/` |
| `ZakazivanjeApi.Tests` | xUnit tests                                                      |

Booking rules live in `Domain/` as classes that touch neither EF Core nor the database, so
they can be tested without one (ADR-0007).

## Setup

### 1. Secrets

**Nothing secret belongs in a tracked file — this repository is public** (ADR-0006). Locally,
the secrets go in user-secrets; everywhere else, in environment variables.

| Key              | What it is                                                     |
| ---------------- | -------------------------------------------------------------- |
| `Jwt:Key`        | The symmetric key tokens are signed with, 32 characters or more |
| `Admin:Email`    | Email of the first administrator, seeded at startup             |
| `Admin:Password` | That administrator's password, hashed before it is saved        |

```bash
dotnet user-secrets set "Jwt:Key" "<at least 32 characters>" --project ZakazivanjeApi
dotnet user-secrets set "Admin:Email" "you@example.com" --project ZakazivanjeApi
dotnet user-secrets set "Admin:Password" "<a password>" --project ZakazivanjeApi
```

As environment variables, the same keys are `Jwt__Key`, `Admin__Email` and `Admin__Password`.

`Jwt:Key` is required: without one — or with one shorter than 32 characters, which HMAC-SHA256
cannot use — the application refuses to start rather than issue tokens nobody can rely on. The
two `Admin` keys are optional; with neither set the application still starts, logs a warning and
seeds no administrator.

The non-secret half of the JWT configuration — issuer, audience and the 60-minute lifetime —
lives in `appsettings.json`.

### 2. Database

The connection string is `ConnectionStrings:SalonDb`, pointing at LocalDB in
`appsettings.Development.json`. In Development the application applies pending migrations at
startup. Elsewhere, apply them yourself:

```bash
dotnet ef database update --project ZakazivanjeApi
```

Then seed: starting the application creates the configured administrator if no user holds
that email. Running it again changes nothing — an existing account is never overwritten.

Order matters outside Development, where the application does not migrate for you: apply the
migrations before the first start, or seeding will run against a schema that has no `Users`
table and the start will fail.

### 3. Run

```bash
dotnet run --project ZakazivanjeApi
```

## Working hours

Per weekday, in configuration, validated at startup so a malformed range fails the boot
rather than the first booking (ADR-0002). A weekday that is `null` or absent is a closed day.

```json
"WorkingHours": {
  "SlotGridMinutes": 15,
  "Days": {
    "Monday": { "Open": "09:00", "Close": "17:00" },
    "Saturday": { "Open": "09:00", "Close": "14:00" },
    "Sunday": null
  }
}
```

There is no public-holiday list and no per-stylist schedule; both are known gaps (ADR-0002).

## Time

All times are local salon wall-clock, never UTC (ADR-0001). "Now" always comes from an
injected `TimeProvider`, never `DateTime.Now`.

## Authentication

Hand-written JWT; ASP.NET Core Identity is deliberately not adopted (ADR-0006).

| Method | Route                | Access | Returns                                     |
| ------ | -------------------- | ------ | ------------------------------------------- |
| POST   | `/api/auth/register` | Public | `201` and the new client                    |
| POST   | `/api/auth/login`    | Public | `200`, a bearer token and who it belongs to |

Registration always creates a **client**. There is no way to ask for a role, because a role
field in that payload would let anyone make themselves an admin; the first admin is seeded at
startup instead (ADR-0006).

Tokens last 60 minutes and carry `sub`, `email` and `role`. There are no refresh tokens — when
one expires, log in again. Send it as `Authorization: Bearer <token>`.

Login answers `401` with the same code and the same message whether the email is unknown or the
password is wrong, so the endpoint cannot be used to find out who has an account. Registering an
address that already exists answers `409` with code `email_taken`; addresses are compared
case-insensitively, so `nina@salon.rs` and `Nina@Salon.rs` are one account.

## Tests

```bash
dotnet test
```

Unit tests need nothing. The integration tests start the real application against LocalDB,
under a uniquely-named database that is migrated at the start of the run and dropped at the
end, so they need a working `(localdb)\mssqllocaldb`. They supply their own connection string,
JWT key and admin credentials last, so those win over anything your user-secrets hold and a
test run never touches your development database.
