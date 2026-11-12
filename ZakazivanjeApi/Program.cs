using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using ZakazivanjeApi.Data;
using ZakazivanjeApi.Domain;
using ZakazivanjeApi.Entities;
using ZakazivanjeApi.Services;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddControllers();
// Learn more about configuring OpenAPI at https://aka.ms/aspnet/openapi
builder.Services.AddOpenApi();

builder.Services.AddProblemDetails();
builder.Services.AddExceptionHandler<DomainExceptionHandler>();

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

// A missing or too-short signing key fails the boot rather than producing tokens that cannot be
// trusted. Jwt:Key is a secret and lives in user-secrets or environment variables, never here.
builder.Services
    .AddOptions<JwtOptions>()
    .Bind(builder.Configuration.GetSection(JwtOptions.SectionName))
    .ValidateDataAnnotations()
    .ValidateOnStart();

builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme).AddJwtBearer();

// Configured from the validated options rather than straight from configuration, so the key is
// read after validation has had its say instead of before it.
builder.Services
    .AddOptions<JwtBearerOptions>(JwtBearerDefaults.AuthenticationScheme)
    .Configure<IOptions<JwtOptions>>((bearer, jwtOptions) =>
    {
        // Off, so the claims the token carries keep the names it was minted with. Left on, the
        // handler would rename sub and role to the long WS-* URIs on the way in.
        bearer.MapInboundClaims = false;

        bearer.TokenValidationParameters = jwtOptions.Value.ValidationParameters();
    });

builder.Services.AddAuthorization();

// Everything that needs "now" takes this, so the rules stay testable (ADR-0001).
builder.Services.AddSingleton(TimeProvider.System);
builder.Services.AddSingleton<IPasswordHasher<User>, PasswordHasher<User>>();
builder.Services.AddSingleton<ITokenService, JwtTokenService>();
builder.Services.AddScoped<IAuthService, AuthService>();
builder.Services.AddScoped<DatabaseInitializer>();

var app = builder.Build();

using (var scope = app.Services.CreateScope())
{
    // Read the working hours first so malformed ones fail the boot before the database is
    // touched. ValidateOnStart would otherwise only fire after this block has run.
    _ = scope.ServiceProvider.GetRequiredService<IOptions<WorkingHoursOptions>>().Value;

    // Same reason: a missing Jwt:Key should stop the boot here, before a database is created,
    // rather than at the first request that needs a token.
    _ = scope.ServiceProvider.GetRequiredService<IOptions<JwtOptions>>().Value;

    var initializer = scope.ServiceProvider.GetRequiredService<DatabaseInitializer>();

    // Elsewhere the schema is applied deliberately, with dotnet ef database update.
    if (app.Environment.IsDevelopment())
    {
        await initializer.MigrateAsync();
    }

    await initializer.SeedAdminAsync();
}

// Configure the HTTP request pipeline.
app.UseExceptionHandler();

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}

app.UseHttpsRedirection();

// Authentication first: it is what works out who the caller is, and authorization has nothing
// to decide about until it has.
app.UseAuthentication();
app.UseAuthorization();

app.MapControllers();

app.Run();

/// <summary>Named so the integration tests can start this very application (ADR-0007).</summary>
public partial class Program;
