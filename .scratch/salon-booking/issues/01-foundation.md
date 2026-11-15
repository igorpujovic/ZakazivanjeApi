# 01 - Foundation: solution, entities, database, admin seeding

Status: resolved
Type: task

Spec: `../spec.md`

Set the project up so everything after it has somewhere to live. No endpoints yet.

## Scope

- Create `ZakazivanjeApi.sln` at the repo root and add the existing `ZakazivanjeApi` web
  project to it. There is currently no solution file.
- Add `ZakazivanjeApi.Tests` (xUnit) and reference the API project from it.
- Add packages: `Microsoft.EntityFrameworkCore.SqlServer`, `Microsoft.EntityFrameworkCore.Design`.
- Create folders `Controllers/`, `Services/`, `Domain/`, `Data/`, `Entities/`, `Dtos/`
  (ADR-0007 — layering by folder, not by assembly).
- Entities per the spec's data model: `User`, `Service`, `Stylist`, `Booking`, plus the
  `UserRole` and `BookingStatus` enums.
- `SalonDbContext` with the configured relationships, `decimal(10,2)` for money, and the
  indexes listed in the spec: unique `User.Email`, filtered unique
  `(StylistId, Start) WHERE Status = Scheduled`, non-unique `(StylistId, Start)`.
- First migration, LocalDB connection string in `appsettings.Development.json`.
- `WorkingHoursOptions` bound from configuration with per-weekday entries and
  `SlotGridMinutes`, validated at startup via `ValidateOnStart` so a malformed range fails
  the boot.
- Register `TimeProvider.System` in DI (ADR-0001 — nothing reads `DateTime.Now` directly).
- Database initialisation: migrate on startup in Development only, then seed the admin
  from `Admin:Email` / `Admin:Password` configuration if no user with that email exists.
  Idempotent. Password hashed with `PasswordHasher<User>`.
- `dotnet user-secrets init` and document the required secrets.

## Not in scope

Any controller, DTO or business rule.

## Done when

- `dotnet build` and `dotnet test` both succeed (no tests yet is fine).
- `dotnet ef database update` creates the schema on LocalDB.
- Running the app twice creates the admin exactly once and does not overwrite it.
- Startup fails with a clear message when working hours are malformed.
- No password, key or connection secret appears in a tracked file. The repository is
  public (ADR-0006).

## Comments

**2026-11-12 — implemented.** Solution, entities, `SalonDbContext`, the `InitialCreate`
migration, `WorkingHoursOptions` with startup validation, `TimeProvider.System` and the
idempotent admin seeder are all in. Every "Done when" item was checked against a running
application and a real LocalDB database.

Two things worth carrying forward:

- `"Sunday": null` does not bind to a null entry — the configuration binder materialises an
  empty `DayHours`. A closed day is therefore an entry with no times, not a missing entry,
  and `DayHours.Open`/`Close` are nullable for that reason. `WorkingHoursBindingTests` pins
  this, including a test that the shipped `appsettings.json` validates.
- Two indexes over the same properties need the named `HasIndex` overload. With the unnamed
  one, EF Core keys the index by its property set and the second call reconfigures the first,
  so only one index reached the database.

Deliberately beyond the letter of the issue, and easy to drop: validation also rejects a
configuration in which no weekday is open, which is what makes an absent `WorkingHours`
section fail the boot rather than leave the salon silently unbookable.
