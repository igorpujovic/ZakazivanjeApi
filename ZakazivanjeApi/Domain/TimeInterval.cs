namespace ZakazivanjeApi.Domain;

/// <summary>
/// A span of salon wall-clock time, half-open <c>[Start, End)</c>: the start belongs to the
/// interval and the end does not. That is what makes back-to-back bookings legal, and it is the
/// only definition of "overlap" in the system (see the glossary).
/// </summary>
/// <param name="Start">Local wall-clock, <see cref="DateTimeKind.Unspecified"/> (ADR-0001).</param>
/// <param name="End">The first moment no longer occupied.</param>
public readonly record struct TimeInterval(DateTime Start, DateTime End)
{
    /// <summary>
    /// The interval a service of this length occupies, starting at <paramref name="start"/>.
    /// </summary>
    /// <exception cref="ArgumentOutOfRangeException">
    /// The duration is not positive. A service that takes no time is a catalogue bug, not a
    /// booking a rule should decide on.
    /// </exception>
    public static TimeInterval Starting(DateTime start, int durationMinutes)
    {
        ArgumentOutOfRangeException.ThrowIfNegativeOrZero(durationMinutes);

        return new TimeInterval(start, start.AddMinutes(durationMinutes));
    }

    /// <summary>
    /// Whether the two share any time at all. Touching intervals — one ending exactly as the
    /// other begins — do not, so neither comparison may be made inclusive.
    /// </summary>
    public bool Overlaps(TimeInterval other) => Start < other.End && other.Start < End;
}
