using System.ComponentModel;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using ZakazivanjeApi.Dtos;
using ZakazivanjeApi.Entities;
using ZakazivanjeApi.Services;

namespace ZakazivanjeApi.Controllers;

/// <summary>The menu of services. Reading it is public; changing it is an admin's job.</summary>
/// <remarks>
/// Admin-only by default, with the public routes opting out one at a time. The other way round,
/// open by default with each admin route remembering to say so, means a route added later and
/// forgotten is a route anyone may call.
/// </remarks>
[ApiController]
[Authorize(Roles = nameof(UserRole.Admin))]
[Route("api/services")]
[Produces("application/json")]
public class ServicesController(IServiceCatalogue catalogue) : ControllerBase
{
    /// <summary>Lists the services currently on offer.</summary>
    /// <remarks>
    /// The menu: active services only, and a withdrawn one is still readable by its id. An
    /// admin passing <c>includeInactive=true</c> gets the whole catalogue instead, which is the
    /// only way to find something that has been withdrawn in order to put it back (ADR-0012).
    /// Anybody else passing it is refused rather than quietly served the menu.
    /// </remarks>
    [HttpGet]
    [AllowAnonymous]
    [ProducesResponseType<IReadOnlyList<ServiceResponse>>(StatusCodes.Status200OK)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status403Forbidden)]
    public async Task<ActionResult<IReadOnlyList<ServiceResponse>>> List(
        CancellationToken cancellationToken,

        // Attributed rather than left to the XML comment above, which this project does not
        // generate a documentation file for and which therefore reaches no reader of the
        // OpenAPI document or of the types generated from it.
        [FromQuery]
        [Description(
            "Admin only. True widens the list from the menu to the whole catalogue, "
            + "withdrawn services included. Any other caller passing true is refused — 401 "
            + "without a token, 403 with a client's — rather than quietly served the menu.")]
        bool includeInactive = false)
    {
        if (this.RefusalToWiden(includeInactive) is { } refusal)
        {
            return refusal;
        }

        return Ok(await catalogue.ListAsync(includeInactive, cancellationToken));
    }

    /// <summary>Reads one service, whether or not it is still on the menu.</summary>
    /// <remarks>
    /// Resolves a withdrawn service too, so a booking made against one still renders (ADR-0004).
    /// </remarks>
    [HttpGet("{id:int}")]
    [AllowAnonymous]
    [ProducesResponseType<ServiceResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    public async Task<ActionResult<ServiceResponse>> GetById(
        int id, CancellationToken cancellationToken) =>
        await catalogue.GetAsync(id, cancellationToken);

    /// <summary>Puts a new service on the menu.</summary>
    [HttpPost]
    [ProducesResponseType<ServiceResponse>(StatusCodes.Status201Created)]
    [ProducesResponseType<ValidationProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status403Forbidden)]
    public async Task<ActionResult<ServiceResponse>> Create(
        CreateServiceRequest request, CancellationToken cancellationToken)
    {
        var service = await catalogue.CreateAsync(request, cancellationToken);

        return CreatedAtAction(nameof(GetById), new { id = service.Id }, service);
    }

    /// <summary>Replaces a service's details.</summary>
    /// <remarks>
    /// A full replacement: send every field, <c>isActive</c> included. That flag is also how a
    /// withdrawn service returns to the menu. The bookings already taken against it are
    /// untouched, because each carries its own snapshot of the name and price (ADR-0003).
    /// </remarks>
    [HttpPut("{id:int}")]
    [ProducesResponseType<ServiceResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType<ValidationProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status403Forbidden)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    public async Task<ActionResult<ServiceResponse>> Update(
        int id, UpdateServiceRequest request, CancellationToken cancellationToken) =>
        await catalogue.UpdateAsync(id, request, cancellationToken);

    /// <summary>Withdraws a service from the menu. It is not deleted.</summary>
    /// <remarks>
    /// Sets <c>IsActive</c> false and nothing else: the row stays, and the bookings already
    /// taken against it stay <c>Scheduled</c> for the salon to resolve one by one (ADR-0004).
    /// The verb is <c>DELETE</c> because it matches what an admin means by it, not what the
    /// database does. Withdrawing an already-withdrawn service succeeds again.
    /// </remarks>
    [HttpDelete("{id:int}")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status403Forbidden)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> Deactivate(int id, CancellationToken cancellationToken)
    {
        await catalogue.DeactivateAsync(id, cancellationToken);

        return NoContent();
    }
}
