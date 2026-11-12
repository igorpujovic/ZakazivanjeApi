using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using ZakazivanjeApi.Entities;
using ZakazivanjeApi.Services;

namespace ZakazivanjeApi.Tests.Integration;

/// <summary>
/// Endpoints that exist only in the test host, to prove the authentication and authorization
/// wiring before issue 03 brings the first real protected route. They are added to the running
/// application as an MVC application part, so nothing test-shaped ever ships in the API.
/// </summary>
/// <remarks>
/// Without these, the <c>AddAuthentication</c> / <c>AddAuthorization</c> wiring, the pipeline
/// order and the short <c>role</c> claim would all go unexercised: registration and login are
/// public, so a token could be issued correctly and still be unreadable by the API that minted it.
/// </remarks>
[ApiController]
[Route("test-probe")]
public class ProbeController : ControllerBase
{
    /// <summary>
    /// Open to anyone, as a control: a 401 here would mean the pipeline, not the token. It also
    /// reports whether the caller was identified, which a protected route cannot show — there,
    /// being identified and being let in are the same answer.
    /// </summary>
    [HttpGet("anyone")]
    [AllowAnonymous]
    public IActionResult Anyone() =>
        Ok(new { identified = User.Identity?.IsAuthenticated == true });

    /// <summary>Any caller the API could identify from a bearer token.</summary>
    [HttpGet("authenticated")]
    [Authorize]
    public IActionResult Authenticated() => Ok(new
    {
        subject = User.FindFirst(ClaimNames.Subject)?.Value,
        email = User.FindFirst(ClaimNames.Email)?.Value,
        isAdmin = User.IsInRole(nameof(UserRole.Admin)),
    });

    /// <summary>Admins only, which is the shape every admin route in issue 03 onwards will take.</summary>
    [HttpGet("admin-only")]
    [Authorize(Roles = nameof(UserRole.Admin))]
    public IActionResult AdminOnly() => Ok();
}
