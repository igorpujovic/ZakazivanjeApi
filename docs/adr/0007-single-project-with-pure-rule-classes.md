# One API project, with the booking rules as dependency-free classes

The solution is one web project plus one test project. Layering is by folder and
interface, not by assembly. Within that, the booking rules — overlap, working hours, past
starts, the cancellation deadline and slot generation — live in plain classes that
reference no EF Core and no database. They take a proposed interval, the stylist's busy
intervals, the day's working hours and the current time, and return a decision.
`BookingService` does the orchestration: load, call the rules, save inside the transaction.

Splitting four tables and sixteen endpoints across Api/Application/Domain/Infrastructure
assemblies invites the question "why did this need clean architecture?" with no good
answer. The genuine benefit of separate assemblies is the compiler forbidding EF Core in
the domain; keeping the rules dependency-free by hand recovers most of that without the
ceremony.

The decisive reason is testability. The specification requires unit tests for four rules.
If those rules read from a `DbContext`, testing them means faking `DbContext` — which is
painful enough that this is usually where such projects abandon testing. Pure classes make
the hardest logic in the project the easiest part to test, with no database and no mocks.

## Consequences

Nothing but review discipline stops someone passing an entity or a `DbContext` into a rule
class. If that happens the tests get slow and brittle, which is the signal to split the
rules into their own assembly.

The rules return results rather than throwing. `BookingService` converts a failed result
into a domain exception carrying its status code, and a single exception handler renders
every one as `ProblemDetails`. This keeps the rules pure, keeps their tests free of
exception assertions, and leaves exactly one place where a domain failure becomes HTTP.
