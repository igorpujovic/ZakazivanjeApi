using ZakazivanjeApi.Dtos;

namespace ZakazivanjeApi.Services;

/// <summary>
/// Making and resolving bookings: the orchestration around the rules in <c>Domain/</c>, which
/// is where every piece of time arithmetic lives (ADR-0007).
/// </summary>
public interface IBookingService
{
    /// <summary>
    /// Takes a booking for <paramref name="clientId"/>, writing down the service's price, name
    /// and duration as they are at this moment (ADR-0003).
    /// </summary>
    /// <remarks>
    /// The overlap check and the insert share one serializable transaction, so two clients
    /// racing for the same chair cannot both be told yes (ADR-0005). Throws a
    /// <c>DomainException</c>: <c>404</c> for an id nothing answers to, and <c>409</c> carrying
    /// the refused rule's code — <c>booking_overlap</c>, <c>outside_working_hours</c>,
    /// <c>start_in_past</c>, <c>stylist_inactive</c> or <c>service_inactive</c> — or
    /// <c>booking_contended</c> when the stylist's schedule stayed contended through every
    /// attempt.
    /// </remarks>
    Task<BookingResponse> CreateAsync(
        int clientId, CreateBookingRequest request, CancellationToken cancellationToken = default);

    /// <summary>
    /// Everything <paramref name="clientId"/> has booked, past and present and whatever became
    /// of it, soonest first. Never anybody else's.
    /// </summary>
    Task<IReadOnlyList<BookingResponse>> ListForClientAsync(
        int clientId, CancellationToken cancellationToken = default);

    /// <summary>
    /// Calls a booking off, releasing the stylist's time. A client may do this to their own
    /// booking and only before the cancellation deadline; an admin may do it to any booking at
    /// any time (ADR-0004).
    /// </summary>
    /// <remarks>
    /// Throws a <c>DomainException</c>: <c>404 booking_not_found</c> for an id this caller
    /// cannot see — someone else's booking included, because whether it exists is not their
    /// business — <c>409 booking_already_cancelled</c> or <c>409 booking_already_completed</c>
    /// for one already resolved, and <c>409 cancellation_too_late</c> for a client who has left
    /// it too long.
    /// </remarks>
    Task<BookingResponse> CancelAsync(
        int bookingId, Caller caller, CancellationToken cancellationToken = default);

    /// <summary>
    /// Records that the service was carried out. The salon's word, and only once the booking
    /// has started — the gate is on the start rather than the end, so a stylist who finishes
    /// early can still close it out.
    /// </summary>
    /// <remarks>
    /// Admin-only, which the route enforces. Throws a <c>DomainException</c>:
    /// <c>404 booking_not_found</c> for an unknown id, <c>409 booking_already_cancelled</c> or
    /// <c>409 booking_already_completed</c> for one already resolved, and
    /// <c>409 booking_not_started</c> for one whose time has not come.
    /// </remarks>
    Task<BookingResponse> CompleteAsync(
        int bookingId, CancellationToken cancellationToken = default);

    /// <summary>
    /// The salon's whole book, narrowed by day and by stylist and handed over a page at a time,
    /// soonest first. Every status, because an admin wants to see what was called off as much
    /// as what is still coming.
    /// </summary>
    Task<PagedResponse<BookingResponse>> ListAsync(
        BookingsQuery query, CancellationToken cancellationToken = default);
}
