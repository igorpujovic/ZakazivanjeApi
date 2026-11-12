namespace ZakazivanjeApi.Dtos;

/// <summary>
/// The bounds the catalogue's request types validate against, in one place so the DTOs and the
/// columns behind them cannot drift apart. A value outside these would be refused by SQL Server
/// with a 500 rather than by the API with a 400.
/// </summary>
public static class CatalogueLimits
{
    /// <summary>Matches the <c>nvarchar(200)</c> both name columns are mapped to.</summary>
    public const int NameLength = 200;

    /// <summary>
    /// A day. Nothing longer could ever fit inside a weekday's working hours, and an unbounded
    /// duration would overflow the <c>Start + duration</c> arithmetic that sets a booking's end.
    /// </summary>
    public const int MaxDurationMinutes = 24 * 60;

    /// <summary>The largest value <c>decimal(10,2)</c> holds.</summary>
    public const string MaxPrice = "99999999.99";
}
