using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using ZakazivanjeApi.Data;
using ZakazivanjeApi.Domain;
using ZakazivanjeApi.Entities;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddControllers();
// Learn more about configuring OpenAPI at https://aka.ms/aspnet/openapi
builder.Services.AddOpenApi();

builder.Services.AddDbContext<SalonDbContext>(options =>
    options.UseSqlServer(builder.Configuration.GetConnectionString("SalonDb")));

// Working hours are validated on boot, so a malformed range never reaches a booking (ADR-0002).
builder.Services.AddSingleton<IValidateOptions<WorkingHoursOptions>, WorkingHoursOptionsValidator>();
builder.Services
    .AddOptions<WorkingHoursOptions>()
    .Bind(builder.Configuration.GetSection(WorkingHoursOptions.SectionName))
    .ValidateOnStart();

builder.Services.Configure<AdminOptions>(
    builder.Configuration.GetSection(AdminOptions.SectionName));

// Everything that needs "now" takes this, so the rules stay testable (ADR-0001).
builder.Services.AddSingleton(TimeProvider.System);
builder.Services.AddSingleton<IPasswordHasher<User>, PasswordHasher<User>>();
builder.Services.AddScoped<DatabaseInitializer>();

var app = builder.Build();

using (var scope = app.Services.CreateScope())
{
    // Read the working hours first so malformed ones fail the boot before the database is
    // touched. ValidateOnStart would otherwise only fire after this block has run.
    _ = scope.ServiceProvider.GetRequiredService<IOptions<WorkingHoursOptions>>().Value;

    var initializer = scope.ServiceProvider.GetRequiredService<DatabaseInitializer>();

    // Elsewhere the schema is applied deliberately, with dotnet ef database update.
    if (app.Environment.IsDevelopment())
    {
        await initializer.MigrateAsync();
    }

    await initializer.SeedAdminAsync();
}

// Configure the HTTP request pipeline.
if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}

app.UseHttpsRedirection();

app.UseAuthorization();

app.MapControllers();

app.Run();
