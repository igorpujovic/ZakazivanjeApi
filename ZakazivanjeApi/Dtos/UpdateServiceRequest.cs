using System.ComponentModel.DataAnnotations;

namespace ZakazivanjeApi.Dtos;

/// <summary>
/// What an admin sends to change a service: everything creation takes, plus whether it is
/// still on the menu. A full replacement, not a patch.
/// </summary>
/// <remarks>
/// <c>IsActive</c> is what lets a withdrawn service be put back, without which <c>DELETE</c>
/// would be a one-way door: nothing else sets the flag (ADR-0004). Changing a service does not
/// touch the bookings already taken against it, because each carries its own snapshot of the
/// name and price (ADR-0003).
/// </remarks>
public class UpdateServiceRequest : CreateServiceRequest
{
    /// <summary>
    /// False withdraws the service from the menu, as <c>DELETE</c> does. Required rather than
    /// defaulted: an omitted flag would quietly undo a <c>DELETE</c> the next time someone
    /// corrected a typo in the name, which is too large a thing to happen by silence.
    /// </summary>
    [Required]
    public bool? IsActive { get; init; }
}
