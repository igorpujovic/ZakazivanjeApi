using Microsoft.EntityFrameworkCore;
using ZakazivanjeApi.Entities;

namespace ZakazivanjeApi.Data;

/// <summary>The salon's four tables, their relationships and the indexes the booking rules lean on.</summary>
public class SalonDbContext(DbContextOptions<SalonDbContext> options) : DbContext(options)
{
    public DbSet<User> Users => Set<User>();

    public DbSet<Service> Services => Set<Service>();

    public DbSet<Stylist> Stylists => Set<Stylist>();

    public DbSet<Booking> Bookings => Set<Booking>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        modelBuilder.Entity<User>(user =>
        {
            user.Property(u => u.Name).IsRequired().HasMaxLength(200);
            user.Property(u => u.Email).IsRequired().HasMaxLength(256);
            user.Property(u => u.PasswordHash).IsRequired().HasMaxLength(512);
            user.Property(u => u.Role).HasConversion<int>();

            // SQL Server's default collation is case-insensitive, so this unique index is
            // what makes Email unique case-insensitively as the spec requires.
            user.HasIndex(u => u.Email).IsUnique();
        });

        modelBuilder.Entity<Service>(service =>
        {
            service.Property(s => s.Name).IsRequired().HasMaxLength(200);
            service.Property(s => s.Price).HasColumnType("decimal(10,2)");
        });

        modelBuilder.Entity<Stylist>(stylist =>
        {
            stylist.Property(s => s.Name).IsRequired().HasMaxLength(200);
        });

        modelBuilder.Entity<Booking>(booking =>
        {
            booking.Property(b => b.PriceAtBooking).HasColumnType("decimal(10,2)");
            booking.Property(b => b.ServiceNameAtBooking).IsRequired().HasMaxLength(200);
            booking.Property(b => b.Status).HasConversion<int>();

            booking.HasOne(b => b.User)
                .WithMany(u => u.Bookings)
                .HasForeignKey(b => b.UserId)
                .OnDelete(DeleteBehavior.Restrict);

            booking.HasOne(b => b.Stylist)
                .WithMany(s => s.Bookings)
                .HasForeignKey(b => b.StylistId)
                .OnDelete(DeleteBehavior.Restrict);

            booking.HasOne(b => b.Service)
                .WithMany(s => s.Bookings)
                .HasForeignKey(b => b.ServiceId)
                .OnDelete(DeleteBehavior.Restrict);

            // The database's half of the overlap guarantee (ADR-0005): two scheduled bookings
            // for one stylist can never share a start, whatever two concurrent requests do.
            // It catches identical starts only; the serializable transaction catches the rest.
            // Both indexes cover the same two properties, so each needs its own name: the
            // unnamed overload is keyed by the property set and the second call would
            // reconfigure the first rather than add anything.
            booking.HasIndex(
                    b => new { b.StylistId, b.Start },
                    "IX_Bookings_StylistId_Start_Scheduled")
                .IsUnique()
                .HasFilter($"[Status] = {(int)BookingStatus.Scheduled}");

            // Unfiltered, for the overlap query, which also reads Completed bookings.
            booking.HasIndex(b => new { b.StylistId, b.Start }, "IX_Bookings_StylistId_Start");
        });
    }
}
