namespace ZakazivanjeApi.Domain;

/// <summary>One weekday's working hours, once configuration has been validated.</summary>
public readonly record struct DayWorkingHours(TimeOnly Open, TimeOnly Close);

/// <summary>
/// One weekday's entry as configuration hands it over. Both times are nullable because
/// <c>"Sunday": null</c> binds to an entry with nothing in it rather than to a null entry —
/// that is how a closed day arrives, not a mistake to reject.
/// </summary>
public class DayHours
{
    public TimeOnly? Open { get; set; }

    public TimeOnly? Close { get; set; }
}

/// <summary>
/// When the salon is open, per weekday, bound from the <c>WorkingHours</c> configuration
/// section (ADR-0002). A weekday with no entry — or an empty one — is a day the salon is closed.
/// Validated at startup by <see cref="WorkingHoursOptionsValidator"/>, so by the time anything
/// reads <see cref="ForDay"/> every entry present is either complete or closed.
/// </summary>
public class WorkingHoursOptions
{
    public const string SectionName = "WorkingHours";

    /// <summary>The step between candidate slot starts, in minutes.</summary>
    public int SlotGridMinutes { get; set; } = 15;

    /// <summary>
    /// Keyed by <see cref="DayOfWeek"/> name rather than by the enum itself, so that a
    /// misspelt weekday fails validation with a message naming it instead of failing inside
    /// the configuration binder. Case-insensitive, so config casing is free.
    /// </summary>
    public Dictionary<string, DayHours?> Days { get; set; } =
        new(StringComparer.OrdinalIgnoreCase);

    /// <summary>The day's working hours, or <c>null</c> when the salon is closed that weekday.</summary>
    public DayWorkingHours? ForDay(DayOfWeek day) =>
        Days.TryGetValue(day.ToString(), out var hours) ? ToWorkingHours(hours) : null;

    /// <summary><c>null</c> for every way configuration can spell "closed that day".</summary>
    internal static DayWorkingHours? ToWorkingHours(DayHours? hours) =>
        hours is { Open: { } open, Close: { } close } ? new DayWorkingHours(open, close) : null;
}
