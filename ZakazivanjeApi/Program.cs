using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Scalar.AspNetCore;
using ZakazivanjeApi.Data;
using ZakazivanjeApi.Domain;
using ZakazivanjeApi.Entities;
using ZakazivanjeApi.Services;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddControllers();

// The browser origins allowed to call this API, from configuration. See FrontendCors.
builder.Services.AddFrontendCors();

// The document Scalar renders. The transformers put the bearer scheme in it and mark which
// operations need one, which is what lets a reader log in and exercise the protected endpoints
// from the browser rather than from curl.
builder.Services.AddOpenApi(options =>
{
    options.AddDocumentTransformer<DocumentInfoTransformer>();
    options.AddDocumentTransformer<BearerSecurityTransformer>();
    options.AddOperationTransformer<BearerRequirementTransformer>();
    options.AddOperationTransformer<ServerErrorResponseTransformer>();
    options.AddSchemaTransformer<ProblemCodeSchemaTransformer>();
});

// One envelope for every failure, whichever layer refused the request (ADR-0008).
builder.Services.AddProblemDetails(options =>
    options.CustomizeProblemDetails = ProblemEnvelope.Customize);
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

builder.Services.Configure<SampleCatalogueOptions>(
    builder.Configuration.GetSection(SampleCatalogueOptions.SectionName));

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
builder.Services.AddScoped<IServiceCatalogue, ServiceCatalogue>();
builder.Services.AddScoped<IStylistCatalogue, StylistCatalogue>();

// The rules hold nothing per-request: validated options and a clock, both singletons. One
// instance, so slot generation and booking cannot end up reading two different sets of hours.
builder.Services.AddSingleton<BookingRules>();
builder.Services.AddScoped<ISlotFinder, SlotFinder>();
builder.Services.AddScoped<IBookingService, BookingService>();
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
    await initializer.SeedSampleCatalogueAsync();
}

// Configure the HTTP request pipeline.
app.UseExceptionHandler();

// The statuses no handler ever sees — a 401 from authentication, a 403 from a role, a 404 from
// routing — arrive here with the status set and the body still empty. This is what gives them the
// same ProblemDetails envelope as everything else (ADR-0008).
app.UseStatusCodePages();

// Development only, both of them: the document describes every route the API has, and that is
// something to hand a reader running this locally rather than the public internet.
if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();

    // Microsoft.AspNetCore.OpenApi generates the document but ships no UI, Swashbuckle having
    // left the template in .NET 9. Scalar is the UI.
    app.MapScalarApiReference(options => options
        .WithTitle(DocumentInfoTransformer.Title)
        .AddPreferredSecuritySchemes(BearerSecurityTransformer.SchemeName));
}

// After routing, which minimal hosting has already run by the time any of this executes, and
// before authentication: a 401 needs the allow header too, or the browser hands the frontend a
// network error instead of the refusal. Before the HTTPS redirect as well, because a browser
// does not follow a redirect on a preflight — it reports it as a CORS failure.
app.UseCors(FrontendCors.PolicyName);

app.UseHttpsRedirection();

// Authentication first: it is what works out who the caller is, and authorization has nothing
// to decide about until it has.
app.UseAuthentication();
app.UseAuthorization();

app.MapControllers();

app.Run();

/// <summary>Named so the integration tests can start this very application (ADR-0007).</summary>
public partial class Program;
