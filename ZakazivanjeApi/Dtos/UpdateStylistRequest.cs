using System.ComponentModel.DataAnnotations;

namespace ZakazivanjeApi.Dtos;

/// <summary>
/// What an admin sends to rename a stylist or to take them off the list. A full replacement,
/// not a patch.
/// </summary>
/// <remarks>
/// There is no <c>DELETE</c> for a stylist. Every booking ever made points at one, so a row
/// that could be removed would take that history with it or could never be removed at all;
/// <c>IsActive</c> is the same answer the services reached for the same reason (ADR-0004).
/// </remarks>
public class UpdateStylistRequest : CreateStylistRequest
{
    /// <summary>
    /// False takes the stylist off the list; their bookings stay. Required rather than
    /// defaulted, so that renaming a retired stylist cannot quietly put them back.
    /// </summary>
    [Required]
    public bool? IsActive { get; init; }
}
