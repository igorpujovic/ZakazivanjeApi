using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using ZakazivanjeApi.Dtos;
using ZakazivanjeApi.Entities;
using ZakazivanjeApi.Services;

namespace ZakazivanjeApi.Controllers;

/// <summary>
/// Bookings: taking them, reading them back and resolving them one way or the other.
/// </summary>
/// <remarks>
/// Authenticated by default and never anonymous, with every action naming the role it is for,
/// because this is the one controller both kinds of caller use: a client books and calls off
/// their own, an admin sees everything and resolves anything (ADR-0004). The client is always
/// taken from the token — a client id in a request body would let anyone book in someone
/// else's name.
/// </remarks>
[ApiController]
[Authorize]
[Route("api/bookings")]
[Produces("application/json")]
public class BookingsController(IBookingService bookings) : ControllerBase
{
    /// <summary>Takes a booking for the signed-in client.</summary>
    /// <remarks>
    /// Every rule in the specification is applied before anything is written, and a refusal
    /// comes back as a <c>409</c> carrying the rule's code: <c>booking_overlap</c>,
    /// <c>outside_working_hours</c>, <c>start_in_past</c>, <c>stylist_inactive</c> or
    /// <c>service_inactive</c>. The request was well-formed in every one of those cases, so
    /// none of them is a <c>400</c>.
    /// </remarks>
    [HttpPost]
    [Authorize(Roles = nameof(UserRole.Client))]
    [ProducesResponseType<BookingResponse>(StatusCodes.Status201Created)]
    [ProducesResponseType<ValidationProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    public async Task<ActionResult<BookingResponse>> Create(
        CreateBookingRequest request, CancellationToken cancellationToken)
    {
        var booking = await bookings.CreateAsync(
            Caller.From(User).Id, request, cancellationToken);

        // Created without a Location: the API exposes no route that reads one booking back, and
        // a header pointing nowhere is worse than no header at all.
        return StatusCode(StatusCodes.Status201Created, booking);
    }

    /// <summary>Lists the signed-in client's own bookings, soonest first.</summary>
    /// <remarks>
    /// Every booking they have ever made, whatever became of it. The client is read from the
    /// token, so there is no id in this route to tamper with; an admin reads the whole list at
    /// <c>GET /api/bookings</c> instead.
    /// </remarks>
    [HttpGet("my")]
    [Authorize(Roles = nameof(UserRole.Client))]
    [ProducesResponseType<IReadOnlyList<BookingResponse>>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public async Task<ActionResult<IReadOnlyList<BookingResponse>>> Mine(
        CancellationToken cancellationToken) =>
        Ok(await bookings.ListForClientAsync(Caller.From(User).Id, cancellationToken));

    /// <summary>Lists every booking the salon has taken, a page at a time.</summary>
    /// <remarks>
    /// Narrowed by day, by stylist, by both or by neither, and ordered by start with the id
    /// breaking a tie — without that tiebreak two bookings sharing a start can swap places
    /// between requests, and one of them is then shown twice or not at all. Defaults to the
    /// first page of twenty; a page size above one hundred is capped rather than refused, and
    /// the response says which size was used.
    /// </remarks>
    [HttpGet]
    [Authorize(Roles = nameof(UserRole.Admin))]
    [ProducesResponseType<PagedResponse<BookingResponse>>(StatusCodes.Status200OK)]
    [ProducesResponseType<ValidationProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public async Task<ActionResult<PagedResponse<BookingResponse>>> List(
        [FromQuery] BookingsQuery query, CancellationToken cancellationToken) =>
        Ok(await bookings.ListAsync(query, cancellationToken));

    /// <summary>Calls a booking off.</summary>
    /// <remarks>
    /// Open to both kinds of caller, on different terms: a client may cancel their own booking
    /// until two hours before it starts, and an admin may cancel anything at any time — which
    /// is what makes a no-show, a sick stylist or an unreachable client something the salon can
    /// resolve (ADR-0004). A booking belonging to someone else is a <c>404</c> rather than a
    /// <c>403</c>: whether it exists is not the caller's business. A booking that has already
    /// been resolved is a <c>409</c>, because the request is fine and the state is not.
    /// </remarks>
    [HttpPut("{id:int}/cancel")]
    [Authorize]
    [ProducesResponseType<BookingResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    public async Task<ActionResult<BookingResponse>> Cancel(
        int id, CancellationToken cancellationToken) =>
        await bookings.CancelAsync(id, Caller.From(User), cancellationToken);

    /// <summary>Marks a booking as carried out.</summary>
    /// <remarks>
    /// The salon's word rather than the client's, and only once the booking has started. The
    /// gate is the start and not the end, so a stylist who finishes early can close the booking
    /// out there and then. A booking already cancelled or completed is a <c>409</c>: both are
    /// terminal.
    /// </remarks>
    [HttpPut("{id:int}/complete")]
    [Authorize(Roles = nameof(UserRole.Admin))]
    [ProducesResponseType<BookingResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    public async Task<ActionResult<BookingResponse>> Complete(
        int id, CancellationToken cancellationToken) =>
        await bookings.CompleteAsync(id, cancellationToken);
}
