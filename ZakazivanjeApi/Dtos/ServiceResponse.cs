namespace ZakazivanjeApi.Dtos;

/// <summary>
/// A service as the outside world sees it. The <c>Service</c> entity is never returned, so its
/// collection of bookings has no shape in which it can leave the server.
/// </summary>
/// <param name="IsActive">
/// False for a service withdrawn from the menu. Listing shows only active ones; fetching one by
/// id resolves either, so a historical booking still renders (ADR-0004).
/// </param>
public record ServiceResponse(
    int Id, string Name, int DurationMinutes, decimal Price, bool IsActive);
