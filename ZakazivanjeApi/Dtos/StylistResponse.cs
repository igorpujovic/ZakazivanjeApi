namespace ZakazivanjeApi.Dtos;

/// <summary>A stylist as the outside world sees it. The entity itself is never returned.</summary>
/// <param name="IsActive">
/// False for a stylist no longer taking appointments. The public list shows only active ones;
/// the bookings already made against them are untouched.
/// </param>
public record StylistResponse(int Id, string Name, bool IsActive);
