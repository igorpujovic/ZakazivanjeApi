# Salon Booking API

REST API for a single hair salon. Clients browse services and stylists, see available
times and book or cancel appointments. Admins manage the catalogue and every booking.

Source: `Salon Booking API - Project Specification.docx`. This file is that specification
plus the decisions taken in the design session on 2026-11-12. Where the two disagree, this
file wins and an ADR records why.

Stack: C#, ASP.NET Core Web API (controllers), EF Core, SQL Server, xUnit. Target
`net11.0`. Public repository.

## Vocabulary

See `GLOSSARY.md`. Note in particular: a **stylist** has no login; **overlap** excludes
bookings that merely touch; a **slot** is an offer, not a hold.

## Data model

Four tables. Every booking links one user, one stylist and one service.

### User

| Field        | Type   | Notes                              |
| ------------ | ------ | ---------------------------------- |
| Id           | int    | Primary key                        |
| Name         | string | Required                           |
| Email        | string | Required, unique, case-insensitive |
| PasswordHash | string | PBKDF2 via `PasswordHasher<User>`  |
| Role         | enum   | `Admin` or `Client`                |

### Service

| Field           | Type    | Notes                                        |
| --------------- | ------- | -------------------------------------------- |
| Id              | int     | Primary key                                  |
| Name            | string  | Required, e.g. Haircut, Coloring             |
| DurationMinutes | int     | Positive. Decides booking end time           |
| Price           | decimal | In RSD. `decimal(10,2)`                      |
| IsActive        | bool    | **Added.** Inactive services can't be booked |

### Stylist

| Field    | Type   | Notes                             |
| -------- | ------ | --------------------------------- |
| Id       | int    | Primary key                       |
| Name     | string | Required                          |
| IsActive | bool   | Inactive stylists can't be booked |

### Booking

| Field                | Type     | Notes                                           |
| -------------------- | -------- | ----------------------------------------------- |
| Id                   | int      | Primary key                                     |
| UserId               | int      | FK to User                                      |
| StylistId            | int      | FK to Stylist                                   |
| ServiceId            | int      | FK to Service. Reporting only                   |
| Start                | DateTime | Local wall-clock, `Kind.Unspecified`            |
| End                  | DateTime | Snapshot: `Start + DurationMinutes` at creation |
| PriceAtBooking       | decimal  | **Added.** Snapshot of price at creation        |
| ServiceNameAtBooking | string   | **Added.** Snapshot of name at creation         |
| Status               | enum     | `Scheduled`, `Cancelled`, `Completed`           |

Indexes: unique on `User.Email`; filtered unique on `(StylistId, Start)` where
`Status = Scheduled`; non-unique on `(StylistId, Start)` for the overlap query.

Deviations from the source specification: `Service.IsActive` (ADR-0004), the booking
snapshot fields (ADR-0003).

## Time

Local salon wall-clock throughout, no UTC conversion (ADR-0001). "Now" always comes from
an injected `TimeProvider`, never `DateTime.Now`.

## Working hours

Configuration, per weekday, bound to a `WorkingHoursOptions` validated at startup
(ADR-0002). A weekday with no entry is a closed day.

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

No public-holiday list and no per-stylist schedules. Both are known gaps, see ADR-0002.

## Business rules

Every booking passes these before it is saved; each failure returns a clear message and
its own error code.

1. A stylist cannot have two bookings that overlap. Intervals are half-open `[Start, End)`,
   so `a.Start < b.End && b.Start < a.End`. Touching bookings are legal. Enforced inside a
   serializable transaction with a filtered unique index behind it (ADR-0005).
2. A booking must fall **entirely** within that weekday's working hours. The check is on
   `End`, not just `Start`: a 30-minute service at 16:45 against a 17:00 close is refused.
3. A booking cannot start in the past.
4. `End` is `Start + DurationMinutes`, computed once at creation and stored.
5. Only active stylists can be booked.
6. Only active services can be booked.
7. A client may cancel their own booking no later than 2 hours before it starts. Admins
   may cancel any booking at any time (ADR-0004).
8. A client may view and cancel only their own bookings.

Only `Scheduled` and `Completed` bookings occupy a stylist's time. `Cancelled` bookings
release it.

## Status transitions

| From      | To        | Who and when                                                     |
| --------- | --------- | ---------------------------------------------------------------- |
| Scheduled | Cancelled | Client, own booking, `now <= Start - 2h`; or Admin, any, any time |
| Scheduled | Completed | Admin only, and only once `Start` has passed                      |

`Completed` and `Cancelled` are terminal. Any other transition returns `409` — the request
is well-formed, the state is wrong.

Completion is gated on `Start`, not `End`, so a stylist finishing early can still close a
booking out. Past `Scheduled` bookings are expected, not a bug: they mean nobody has
closed the booking out yet. There is no `NoShow` status; an admin cancels after the fact,
so a no-show is indistinguishable from a phoned-in cancellation.

## Available slots

`GET /api/stylists/{id}/available-slots?date=&serviceId=`

Fixed grid, `SlotGridMinutes` (default 15) from configuration. Candidate starts step
across the weekday's working hours from opening; a candidate is returned when the whole
service duration fits inside working hours and overlaps no `Scheduled` or `Completed`
booking for that stylist.

Worked example. Stylist open 09:00-17:00, service Coloring 90 min, one existing booking
11:00-11:30. Returned: `09:00, 09:15, 09:30, 11:30, 11:45, ... 15:30`. Note `09:30` is
offered because `09:30 + 90min = 11:00` touches but does not overlap; `09:45` through
`11:15` are excluded; `15:30` is the last start that still ends by 17:00.

Also: no buffer between appointments, back-to-back is allowed; slots earlier than "now"
are filtered out when the date is today, so this endpoint never offers a start that
`POST /api/bookings` would refuse.

Returns an empty list for a closed weekday or an inactive stylist, not an error.

## Endpoints

Sixteen. `Client + Admin` and `Public + Admin` mean both, on different terms.

| Method | Route                                                 | Access         | Purpose                        |
| ------ | ----------------------------------------------------- | -------------- | ------------------------------ |
| POST   | `/api/auth/register`                                  | Public         | Create a client account        |
| POST   | `/api/auth/login`                                     | Public         | Return a JWT                   |
| GET    | `/api/services?includeInactive=`                      | Public + Admin | List the menu or the catalogue |
| GET    | `/api/services/{id}`                                  | Public         | Get one service, active or not |
| POST   | `/api/services`                                       | Admin          | Create a service               |
| PUT    | `/api/services/{id}`                                  | Admin          | Update or restore a service    |
| DELETE | `/api/services/{id}`                                  | Admin          | Deactivate a service           |
| GET    | `/api/stylists?includeInactive=`                      | Public + Admin | List the bookable or everyone  |
| POST   | `/api/stylists`                                       | Admin          | Create a stylist               |
| PUT    | `/api/stylists/{id}`                                  | Admin          | Update or deactivate           |
| GET    | `/api/stylists/{id}/available-slots?date=&serviceId=` | Public         | Free starts for a day          |
| POST   | `/api/bookings`                                       | Client         | Book an appointment            |
| GET    | `/api/bookings/my`                                    | Client         | List own bookings              |
| PUT    | `/api/bookings/{id}/cancel`                           | Client + Admin | Cancel a booking               |
| GET    | `/api/bookings?date=&stylistId=&page=&pageSize=`      | Admin          | List all bookings              |
| PUT    | `/api/bookings/{id}/complete`                         | Admin          | Mark completed                 |

Pagination returns `{ items, page, pageSize, totalCount, totalPages }`, defaulting to
`page=1, pageSize=20`, `pageSize` capped at 100. Ordering is `Start` then `Id` — without
the tiebreak, equal-start bookings can swap pages and a row gets duplicated or skipped.

Deviation from the source specification: `includeInactive` on the two list routes, admin only,
which widens them from the active rows to the whole catalogue (ADR-0012). Without it an admin
can withdraw a service and never see or recover it again. Any other caller passing it as `true`
is refused — `401` without a token, `403` with a client's — rather than served the narrower list
they did not ask for; `false` asks for the default and is refused to nobody. The default for
both routes is unchanged, so the public contract does not move. Added for the frontend's admin
catalogue screens; `.scratch/salon-frontend/issues/02-*.md` is the ticket.

## Technical decisions

- **Architecture.** One API project plus one test project under a new `.sln`. Folders:
  `Controllers/`, `Services/`, `Domain/`, `Data/`, `Entities/`, `Dtos/`. Booking rules are
  dependency-free classes in `Domain/` (ADR-0007).
- **Database.** EF Core, SQL Server, LocalDB locally, schema by migrations. Auto-migrate
  on startup in Development only; documented `dotnet ef database update` elsewhere.
- **DTOs.** Separate request and response types. Entities are never returned.
- **Validation.** DataAnnotations for input shape, yielding `ValidationProblemDetails`
  automatically. Business rules return results from the domain classes.
- **Errors.** `ProblemDetails` (RFC 9457) for every status, via one `IExceptionHandler`.
  Machine-readable `code` in the extensions, e.g. `booking_overlap`,
  `cancellation_too_late`, so clients and tests never match on prose. Unknown exceptions
  log their detail and return a bare `500`.
- **Auth.** JWT, 60-minute lifetime, symmetric key from configuration, no refresh tokens.
  Admin and Client roles. First admin seeded at database initialisation from
  user-secrets/environment variables (ADR-0006).
- **API docs.** `Microsoft.AspNetCore.OpenApi` generates the document; Scalar provides the
  UI, with JWT auth wired in. Swashbuckle left the template in .NET 9.
- **Testing.** xUnit. Unit tests on the pure rule classes, no database. A small
  integration suite via `WebApplicationFactory` against LocalDB for the concurrency race,
  role enforcement and one end-to-end flow. A uniquely-named database per test run,
  migrated at start and dropped at the end — not transaction-rollback-per-test, which
  would deadlock the concurrency test.
- **Secrets.** Nothing secret in tracked files. Admin password and JWT key via
  user-secrets locally, environment variables elsewhere.
- **Version control.** Small commits, one per issue, pushed regularly.
- **README.** Description, setup, endpoint table, Scalar screenshots.

## Out of scope, deliberately

Public holidays; per-stylist schedules; cleanup buffers between appointments; a `NoShow`
status; refresh tokens; password reset and email confirmation; notifications of any kind;
multiple salon locations; stylist logins.
