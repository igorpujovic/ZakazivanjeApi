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

| Key              | What it is                                              |
| ---------------- | ------------------------------------------------------- |
| `Admin:Email`    | Email of the first administrator, seeded at startup      |
| `Admin:Password` | That administrator's password, hashed before it is saved |

```bash
dotnet user-secrets set "Admin:Email" "you@example.com" --project ZakazivanjeApi
dotnet user-secrets set "Admin:Password" "<a password>" --project ZakazivanjeApi
```

As environment variables, the same two keys are `Admin__Email` and `Admin__Password`.

With neither set, the application still starts; it logs a warning and seeds no administrator.

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

## Tests

```bash
dotnet test
```
