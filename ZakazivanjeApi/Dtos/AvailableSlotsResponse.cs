namespace ZakazivanjeApi.Dtos;

/// <summary>
/// The starts on offer for one day, stylist and service. A slot is an offer, not a hold: two
/// clients can be shown the same start, and the first booking takes it (see GLOSSARY.md).
/// </summary>
/// <param name="Date">The day asked about, echoed so a cached answer identifies itself.</param>
/// <param name="DurationMinutes">
/// How long each start commits the chair for. Carried here so a caller can render
/// <c>09:30-11:00</c> without going back to the menu for the service.
/// </param>
/// <param name="Slots">
/// Local salon wall-clock starts, ascending. Empty is a real answer — a closed weekday, a
/// retired stylist or a fully booked day all say the same thing: not then.
/// </param>
public record AvailableSlotsResponse(
    DateOnly Date, int DurationMinutes, IReadOnlyList<DateTime> Slots);
