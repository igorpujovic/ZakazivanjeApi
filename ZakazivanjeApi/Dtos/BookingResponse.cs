namespace ZakazivanjeApi.Dtos;

/// <summary>
/// A booking as the outside world sees it: what was agreed, for whom, and where it now stands.
/// </summary>
/// <param name="Start">Local salon wall-clock (ADR-0001).</param>
/// <param name="End">
/// Written once at creation from the duration in force then, never recalculated. Editing the
/// service afterwards cannot stretch a booking already taken (ADR-0003).
/// </param>
/// <param name="ServiceName">
/// The name the service had when the booking was made, which is what the client agreed to.
/// <paramref name="ServiceId"/> points at the row as it is now.
/// </param>
/// <param name="Price">In RSD, as quoted at the time, for the same reason.</param>
/// <param name="StylistName">
/// Current, not snapshotted: a stylist is a person on the schedule rather than terms of an
/// agreement, so a correction to their name should show on every booking (see GLOSSARY.md).
/// </param>
/// <param name="Status">
/// <c>Scheduled</c>, <c>Cancelled</c> or <c>Completed</c>, as a name rather than a number so
/// the API does not depend on the order of an enum.
/// </param>
public record BookingResponse(
    int Id,
    DateTime Start,
    DateTime End,
    string Status,
    int StylistId,
    string StylistName,
    int ServiceId,
    string ServiceName,
    decimal Price,
    int ClientId,
    string ClientName);
