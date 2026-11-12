
using Microsoft.Extensions.Time.Testing;
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Tokens;
using ZakazivanjeApi.Entities;
using ZakazivanjeApi.Services;

namespace ZakazivanjeApi.Tests.Services;

/// <summary>
/// What the issued token says and how long it says it for, read back the way the API itself
/// reads it. The token is the only thing a client holds, so its claims are a public contract.
/// </summary>
public class JwtTokenServiceTests
{
    /// <summary>Noon in the salon's own offset, so a token minted in local time stands out.</summary>
    private static readonly DateTimeOffset Noon =
        new(2026, 11, 12, 12, 0, 0, TimeSpan.FromHours(1));

    private static readonly JwtOptions Options = new()
    {
        Key = "a-signing-key-long-enough-for-hmac-sha256",
        Issuer = "ZakazivanjeApi",
        Audience = "ZakazivanjeApi.Clients",
        LifetimeMinutes = 60,
    };

    private static readonly User Nina = new()
    {
        Id = 7,
        Name = "Nina",
        Email = "nina@salon.rs",
        PasswordHash = "irrelevant",
        Role = UserRole.Admin,
    };

    private static AccessToken Issue(User user, DateTimeOffset now, JwtOptions? options = null) =>
        new JwtTokenService(
                Microsoft.Extensions.Options.Options.Create(options ?? Options),
                new FakeTimeProvider(now))
            .Create(user);

    /// <summary>
    /// Validates with the very parameters the API is configured with — the same method builds
    /// the bearer handler's — at a stated moment, so expiry is exercised against a clock the
    /// test owns rather than waved through.
    /// </summary>
    private static Task<TokenValidationResult> ValidateAtAsync(string token, DateTimeOffset now)
    {
        var parameters = Options.ValidationParameters();

        // The only departure from the shipped configuration, and it has to be one: lifetime is
        // otherwise judged against the real clock, which cannot be moved to an hour from now.
        parameters.LifetimeValidator = (notBefore, expires, _, _) =>
            notBefore <= now.UtcDateTime && now.UtcDateTime < expires;

        return new JsonWebTokenHandler().ValidateTokenAsync(token, parameters);
    }

    private static async Task<IDictionary<string, object>> ClaimsOfAsync(
        string token, DateTimeOffset now)
    {
        var result = await ValidateAtAsync(token, now);

        Assert.True(result.IsValid, result.Exception?.Message);
        return result.Claims;
    }

    [Fact]
    public async Task Carries_the_users_id_email_and_role()
    {
        var token = Issue(Nina, Noon);

        var claims = await ClaimsOfAsync(token.Token, Noon);

        Assert.Equal("7", claims["sub"].ToString());
        Assert.Equal("nina@salon.rs", claims["email"].ToString());
        Assert.Equal("Admin", claims["role"].ToString());
    }

    [Fact]
    public async Task Expires_sixty_minutes_after_it_was_issued()
    {
        var token = Issue(Nina, Noon);

        var claims = await ClaimsOfAsync(token.Token, Noon);

        // Noon in a +01:00 salon plus an hour is 12:00 UTC. The expected instant is written out
        // in UTC rather than derived from Noon, so a token minted from local time as if it were
        // UTC — off by the salon's offset, and invisible in the returned expiry on its own —
        // fails here.
        var oneHourOn = new DateTimeOffset(2026, 11, 12, 12, 0, 0, TimeSpan.Zero);

        Assert.Equal(oneHourOn, token.ExpiresAt);
        Assert.Equal(oneHourOn.ToUnixTimeSeconds().ToString(), claims["exp"].ToString());
    }

    [Fact]
    public async Task Is_rejected_once_its_lifetime_has_run_out()
    {
        var token = Issue(Nina, Noon);

        Assert.False((await ValidateAtAsync(token.Token, Noon.AddMinutes(61))).IsValid);
    }

    [Fact]
    public async Task Is_rejected_when_it_was_signed_with_a_different_key()
    {
        var forged = Issue(Nina, Noon, new JwtOptions
        {
            Key = "a-completely-different-signing-key-here",
            Issuer = Options.Issuer,
            Audience = Options.Audience,
        });

        Assert.False((await ValidateAtAsync(forged.Token, Noon)).IsValid);
    }

    [Fact]
    public async Task Says_nothing_about_the_password()
    {
        var token = Issue(
            new User { Id = 3, Name = "Ana", Email = "ana@salon.rs", PasswordHash = "AQAAAAsecret" },
            Noon);

        Assert.DoesNotContain("AQAAAAsecret", token.Token);
    }
}
