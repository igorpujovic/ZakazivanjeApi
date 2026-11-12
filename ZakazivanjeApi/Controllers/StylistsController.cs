using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using ZakazivanjeApi.Dtos;
using ZakazivanjeApi.Entities;
using ZakazivanjeApi.Services;

namespace ZakazivanjeApi.Controllers;

/// <summary>
/// The salon's stylists. Anyone may see who can be booked; only an admin may change the list.
/// A stylist never calls this controller: they have no account (see GLOSSARY.md).
/// </summary>
/// <remarks>
/// Admin-only by default, with the public routes opting out one at a time, so a route added
/// later and forgotten is closed rather than open.
/// </remarks>
[ApiController]
[Authorize(Roles = nameof(UserRole.Admin))]
[Route("api/stylists")]
[Produces("application/json")]
public class StylistsController(IStylistCatalogue catalogue, ISlotFinder slotFinder)
    : ControllerBase
{
    /// <summary>Lists the stylists who can currently be booked.</summary>
    [HttpGet]
    [AllowAnonymous]
    [ProducesResponseType<IReadOnlyList<StylistResponse>>(StatusCodes.Status200OK)]
    public async Task<ActionResult<IReadOnlyList<StylistResponse>>> List(
        CancellationToken cancellationToken) =>
        Ok(await catalogue.ListActiveAsync(cancellationToken));

    /// <summary>When this stylist could perform this service on this day.</summary>
    /// <remarks>
    /// An empty list is an answer, not a failure: a closed weekday, a retired stylist, a
    /// withdrawn service and a fully booked day all come back the same way. Only an id nothing
    /// answers to is a <c>404</c>. Every start returned here is one <c>POST /api/bookings</c>
    /// accepts, because both run the same rules.
    /// </remarks>
    [HttpGet("{id:int}/available-slots")]
    [AllowAnonymous]
    [ProducesResponseType<AvailableSlotsResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType<ValidationProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    public async Task<ActionResult<AvailableSlotsResponse>> ListAvailableSlots(
        int id, [FromQuery] AvailableSlotsQuery query, CancellationToken cancellationToken) =>
        await slotFinder.FindAsync(id, query, cancellationToken);

    /// <summary>Adds a stylist to the list.</summary>
    [HttpPost]
    [ProducesResponseType<StylistResponse>(StatusCodes.Status201Created)]
    [ProducesResponseType<ValidationProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public async Task<ActionResult<StylistResponse>> Create(
        CreateStylistRequest request, CancellationToken cancellationToken)
    {
        var stylist = await catalogue.CreateAsync(request, cancellationToken);

        // Created without a Location: the API exposes no route that reads one stylist back, and
        // a header pointing nowhere is worse than no header at all.
        return StatusCode(StatusCodes.Status201Created, stylist);
    }

    /// <summary>Renames a stylist, or retires one by sending <c>isActive: false</c>.</summary>
    /// <remarks>
    /// A full replacement: send every field. There is no <c>DELETE</c> here, because every
    /// booking ever taken points at a stylist and that history has to keep resolving
    /// (ADR-0004). A retired stylist disappears from the list and can no longer be booked;
    /// the bookings already taken against them stay exactly as they are.
    /// </remarks>
    [HttpPut("{id:int}")]
    [ProducesResponseType<StylistResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType<ValidationProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    public async Task<ActionResult<StylistResponse>> Update(
        int id, UpdateStylistRequest request, CancellationToken cancellationToken) =>
        await catalogue.UpdateAsync(id, request, cancellationToken);
}
