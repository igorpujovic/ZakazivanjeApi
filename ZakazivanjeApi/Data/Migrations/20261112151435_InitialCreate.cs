using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ZakazivanjeApi.Data.Migrations;

/// <inheritdoc />
public partial class _20261112151435_InitialCreate : Migration
{
    /// <inheritdoc />
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.CreateTable(
            name: "Services",
            columns: table => new
            {
                Id = table.Column<int>(type: "int", nullable: false)
                    .Annotation("SqlServer:Identity", "1, 1"),
                Name = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                DurationMinutes = table.Column<int>(type: "int", nullable: false),
                Price = table.Column<decimal>(type: "decimal(10,2)", nullable: false),
                IsActive = table.Column<bool>(type: "bit", nullable: false)
            },
            constraints: table =>
            {
                table.PrimaryKey("PK_Services", x => x.Id);
            });

        migrationBuilder.CreateTable(
            name: "Stylists",
            columns: table => new
            {
                Id = table.Column<int>(type: "int", nullable: false)
                    .Annotation("SqlServer:Identity", "1, 1"),
                Name = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                IsActive = table.Column<bool>(type: "bit", nullable: false)
            },
            constraints: table =>
            {
                table.PrimaryKey("PK_Stylists", x => x.Id);
            });

        migrationBuilder.CreateTable(
            name: "Users",
            columns: table => new
            {
                Id = table.Column<int>(type: "int", nullable: false)
                    .Annotation("SqlServer:Identity", "1, 1"),
                Name = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                Email = table.Column<string>(type: "nvarchar(256)", maxLength: 256, nullable: false),
                PasswordHash = table.Column<string>(type: "nvarchar(512)", maxLength: 512, nullable: false),
                Role = table.Column<int>(type: "int", nullable: false)
            },
            constraints: table =>
            {
                table.PrimaryKey("PK_Users", x => x.Id);
            });

        migrationBuilder.CreateTable(
            name: "Bookings",
            columns: table => new
            {
                Id = table.Column<int>(type: "int", nullable: false)
                    .Annotation("SqlServer:Identity", "1, 1"),
                UserId = table.Column<int>(type: "int", nullable: false),
                StylistId = table.Column<int>(type: "int", nullable: false),
                ServiceId = table.Column<int>(type: "int", nullable: false),
                Start = table.Column<DateTime>(type: "datetime2", nullable: false),
                End = table.Column<DateTime>(type: "datetime2", nullable: false),
                PriceAtBooking = table.Column<decimal>(type: "decimal(10,2)", nullable: false),
                ServiceNameAtBooking = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                Status = table.Column<int>(type: "int", nullable: false)
            },
            constraints: table =>
            {
                table.PrimaryKey("PK_Bookings", x => x.Id);
                table.ForeignKey(
                    name: "FK_Bookings_Services_ServiceId",
                    column: x => x.ServiceId,
                    principalTable: "Services",
                    principalColumn: "Id",
                    onDelete: ReferentialAction.Restrict);
                table.ForeignKey(
                    name: "FK_Bookings_Stylists_StylistId",
                    column: x => x.StylistId,
                    principalTable: "Stylists",
                    principalColumn: "Id",
                    onDelete: ReferentialAction.Restrict);
                table.ForeignKey(
                    name: "FK_Bookings_Users_UserId",
                    column: x => x.UserId,
                    principalTable: "Users",
                    principalColumn: "Id",
                    onDelete: ReferentialAction.Restrict);
            });

        migrationBuilder.CreateIndex(
            name: "IX_Bookings_ServiceId",
            table: "Bookings",
            column: "ServiceId");

        migrationBuilder.CreateIndex(
            name: "IX_Bookings_StylistId_Start",
            table: "Bookings",
            columns: new[] { "StylistId", "Start" });

        migrationBuilder.CreateIndex(
            name: "IX_Bookings_StylistId_Start_Scheduled",
            table: "Bookings",
            columns: new[] { "StylistId", "Start" },
            unique: true,
            filter: "[Status] = 0");

        migrationBuilder.CreateIndex(
            name: "IX_Bookings_UserId",
            table: "Bookings",
            column: "UserId");

        migrationBuilder.CreateIndex(
            name: "IX_Users_Email",
            table: "Users",
            column: "Email",
            unique: true);
    }

    /// <inheritdoc />
    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropTable(
            name: "Bookings");

        migrationBuilder.DropTable(
            name: "Services");

        migrationBuilder.DropTable(
            name: "Stylists");

        migrationBuilder.DropTable(
            name: "Users");
    }
}
