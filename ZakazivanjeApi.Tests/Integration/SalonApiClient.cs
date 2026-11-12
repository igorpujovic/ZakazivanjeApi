using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;

namespace ZakazivanjeApi.Tests.Integration;

/// <summary>
/// The handful of moves every integration test makes: open an account, log in, call something
/// with or without a token. Shared so the two test classes cannot drift into describing two
/// different APIs.
/// </summary>
public static class SalonApiClient
{
    /// <summary>Long enough and mixed enough to satisfy the registration rules.</summary>
    public const string GoodPassword = "Correct-Horse-1";

    /// <summary>
    /// A fresh address, because every test shares one database and one is never enough to tell
    /// which test left a row behind.
    /// </summary>
    public static string NewEmail(string prefix) => $"{prefix}-{Guid.NewGuid():N}@salon.test";

    public static Task<HttpResponseMessage> RegisterAsync(
        this HttpClient client,
        string email,
        string password = GoodPassword,
        string name = "Nina") =>
        client.PostAsJsonAsync("/api/auth/register", new { name, email, password });

    public static Task<HttpResponseMessage> LoginAsync(
        this HttpClient client, string email, string password) =>
        client.PostAsJsonAsync("/api/auth/login", new { email, password });

    /// <summary>Registers a client and returns the token they are issued.</summary>
    public static async Task<string> NewClientTokenAsync(this HttpClient client)
    {
        var email = NewEmail("client");

        (await client.RegisterAsync(email)).EnsureSuccessStatusCode();

        return await client.TokenForAsync(email, GoodPassword);
    }

    /// <summary>Logs in and returns the bearer token, failing loudly if the login itself fails.</summary>
    public static async Task<string> TokenForAsync(
        this HttpClient client, string email, string password)
    {
        var response = await client.LoginAsync(email, password);

        response.EnsureSuccessStatusCode();

        return (await response.BodyAsync()).GetProperty("accessToken").GetString()!;
    }

    /// <summary>A GET carrying <paramref name="token"/> as a bearer, or nothing when it is null.</summary>
    public static Task<HttpResponseMessage> GetWithTokenAsync(
        this HttpClient client, string path, string? token)
    {
        var request = new HttpRequestMessage(HttpMethod.Get, path);

        if (token is not null)
        {
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        }

        return client.SendAsync(request);
    }

    public static async Task<JsonElement> BodyAsync(this HttpResponseMessage response) =>
        await response.Content.ReadFromJsonAsync<JsonElement>();
}
