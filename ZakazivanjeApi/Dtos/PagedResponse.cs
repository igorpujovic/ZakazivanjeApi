namespace ZakazivanjeApi.Dtos;

/// <summary>
/// One page of a longer list, with enough around it for a caller to know where they are and
/// whether there is more.
/// </summary>
/// <param name="Page">Counting from one. A page past the end is empty rather than an error.</param>
/// <param name="PageSize">
/// The size actually used, which is not always the size asked for: it is capped, so a caller
/// who asks for more than the maximum is told here what they got.
/// </param>
/// <param name="TotalCount">Everything the filters match, not just this page.</param>
/// <param name="TotalPages">
/// Zero when nothing matches, because there is no first page of nothing.
/// </param>
public record PagedResponse<T>(
    IReadOnlyList<T> Items, int Page, int PageSize, int TotalCount, int TotalPages)
{
    /// <summary>One page, with the page count worked out from the two numbers that decide it.</summary>
    public static PagedResponse<T> Of(
        IReadOnlyList<T> items, int page, int pageSize, int totalCount) =>
        new(
            items,
            page,
            pageSize,
            totalCount,

            // Rounded up: a remainder of one booking is still a page someone has to turn to.
            (int)Math.Ceiling(totalCount / (double)pageSize));
}
