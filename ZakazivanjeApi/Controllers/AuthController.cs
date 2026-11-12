using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using ZakazivanjeApi.Dtos;
using ZakazivanjeApi.Services;

namespace ZakazivanjeApi.Controllers;

/// <summary>Opening an account and logging in. Both are public; nothing else here is.</summary>
[ApiController]
[AllowAnonymous]
[Route("api/auth")]
[Produces("application/json")]
public class AuthController(IAuthService auth) : ControllerBase
{
    /// <summary>Creates a client account.</summary>
    /// <remarks>
    /// Always a client. The first admin is seeded at database initialisation, because a role
    /// field in this payload would let anyone make themselves one (ADR-0006).
    /// </remarks>
    [HttpPost("register")]
    [ProducesResponseType<UserResponse>(StatusCodes.Status201Created)]
    [ProducesResponseType<ValidationProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status409Conflict)]
    public async Task<ActionResult<UserResponse>> Register(
        RegisterRequest request, CancellationToken cancellationToken)
    {
        var user = await auth.RegisterAsync(request, cancellationToken);

        // Created without a Location: the API exposes no endpoint that reads a user back, and a
        // header pointing nowhere is worse than no header at all.
        return StatusCode(StatusCodes.Status201Created, user);
    }

    /// <summary>Exchanges credentials for a bearer token valid for sixty minutes.</summary>
    [HttpPost("login")]
    [ProducesResponseType<AuthResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType<ValidationProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status401Unauthorized)]
    public async Task<ActionResult<AuthResponse>> Login(
        LoginRequest request, CancellationToken cancellationToken) =>
        await auth.LoginAsync(request, cancellationToken);
}
