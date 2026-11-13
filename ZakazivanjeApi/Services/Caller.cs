using System.Security.Claims;
using ZakazivanjeApi.Domain;
using ZakazivanjeApi.Entities;

namespace ZakazivanjeApi.Services;

/// <summary>
/// Who is making the request, read from the validated token: the two facts every booking
/// endpoint needs about its caller, travelling together rather than as a loose id and flag.
/// </summary>
/// <remarks>
/// Booking endpoints take the client from here and never from the request body: the body is
/// the caller's to write, and a client id in it would let anyone book in somebody else's name.
/// </remarks>
/// <param name="Id">The caller's own user id.</param>
/// <param name="IsAdmin">
/// Whether the caller is salon staff, which is what lifts the client-only limits (ADR-0004).
/// </param>
public readonly record struct Caller(int Id, bool IsAdmin)
{
    /// <summary>
    /// The caller behind a request. Only reached on routes that already require
    /// authentication, so a token without a usable subject is one this API should never have
    /// minted.
    /// </summary>
    public static Caller From(ClaimsPrincipal principal) =>
        int.TryParse(principal.FindFirstValue(ClaimNames.Subject), out var id)
            ? new Caller(id, principal.IsInRole(nameof(UserRole.Admin)))
            : throw DomainException.Unauthorized(
                "invalid_token", "The token does not identify a user.");

    /// <summary>
    /// Whose bookings this caller may see: their own, or — for the salon — everybody's, which
    /// is what <c>null</c> says here. It is the one place that difference is decided, so no
    /// endpoint has to remember it.
    /// </summary>
    public int? ClientScope => IsAdmin ? null : Id;
}
