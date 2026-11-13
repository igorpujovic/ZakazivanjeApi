using System.ComponentModel.DataAnnotations;

namespace ZakazivanjeApi.Dtos;

/// <summary>
/// How an admin narrows the list of every booking the salon has ever taken. Both filters are
/// optional and independent: a day, a stylist, both, or neither.
/// </summary>
public class BookingsQuery
{
    /// <summary>The page asked for, counting from one.</summary>
    public const int FirstPage = 1;

    /// <summary>How many bookings a page holds when the caller does not say.</summary>
    public const int DefaultPageSize = 20;

    /// <summary>
    /// The most a page will hold however much is asked for. A cap rather than a refusal: a page
    /// size is what the caller would like, and an unbounded one is how a listing endpoint
    /// becomes a way to pull the whole table in one request.
    /// </summary>
    public const int MaxPageSize = 100;

    /// <summary>
    /// The day to look at, <c>yyyy-MM-dd</c>. Bookings that start on it, by salon wall-clock
    /// (ADR-0001).
    /// </summary>
    public DateOnly? Date { get; init; }

    /// <summary>One stylist's schedule, rather than the whole salon's.</summary>
    public int? StylistId { get; init; }

    /// <summary>
    /// Counting from one, because that is how a person counts pages. Zero and below are
    /// refused rather than quietly read as the first page: they mean nothing, and silently
    /// answering a different question is worse than saying so.
    /// </summary>
    [Range(FirstPage, int.MaxValue)]
    public int Page { get; init; } = FirstPage;

    /// <summary>Capped at <see cref="MaxPageSize"/>, which the response echoes back.</summary>
    [Range(1, int.MaxValue)]
    public int PageSize { get; init; } = DefaultPageSize;

    /// <summary>The page size actually used, which is what the response reports.</summary>
    public int EffectivePageSize => Math.Min(PageSize, MaxPageSize);
}
