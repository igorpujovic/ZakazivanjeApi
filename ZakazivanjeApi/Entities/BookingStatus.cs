namespace ZakazivanjeApi.Entities;

/// <summary>
/// Lifecycle of a booking. <see cref="Cancelled"/> and <see cref="Completed"/> are terminal.
/// Only <see cref="Scheduled"/> and <see cref="Completed"/> occupy a stylist's time.
/// </summary>
public enum BookingStatus
{
    Scheduled = 0,
    Cancelled = 1,
    Completed = 2,
}
