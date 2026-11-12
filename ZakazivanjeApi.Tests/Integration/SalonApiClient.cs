using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;

namespace ZakazivanjeApi.Tests.Integration;

/// <summary>
/// The handful of moves every integration test makes: open an account, log in, call something
/// with or without a token. Shared so the test classes cannot drift into describing two
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

    /// <summary>Logs the seeded administrator in and returns their token.</summary>
    public static Task<string> AdminTokenAsync(this HttpClient client) =>
        client.TokenForAsync(SalonApiFactory.AdminEmail, SalonApiFactory.AdminPassword);

    /// <summary>Logs in and returns the bearer token, failing loudly if the login itself fails.</summary>
    public static async Task<string> TokenForAsync(
        this HttpClient client, string email, string password)
    {
        var response = await client.LoginAsync(email, password);

        response.EnsureSuccessStatusCode();

        return (await response.BodyAsync()).GetProperty("accessToken").GetString()!;
    }

    /// <summary>
    /// A request carrying <paramref name="token"/> as a bearer, or nothing when it is null,
    /// which is how one admin route gets tried by all three kinds of caller.
    /// </summary>
    public static Task<HttpResponseMessage> SendWithTokenAsync(
        this HttpClient client,
        HttpMethod method,
        string path,
        string? token,
        object? body = null)
    {
        var request = new HttpRequestMessage(method, path);

        if (token is not null)
        {
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        }

        if (body is not null)
        {
            request.Content = JsonContent.Create(body);
        }

        return client.SendAsync(request);
    }
    /// <summary>A GET carrying the token, or nothing when it is null.</summary>
    public static Task<HttpResponseMessage> GetWithTokenAsync(
        this HttpClient client, string path, string? token) =>
        client.SendWithTokenAsync(HttpMethod.Get, path, token);

    /// <summary>A POST of <paramref name="body"/> as JSON, carrying the token.</summary>
    public static Task<HttpResponseMessage> PostWithTokenAsync(
        this HttpClient client, string path, string? token, object? body = null) =>
        client.SendWithTokenAsync(HttpMethod.Post, path, token, body);

    /// <summary>A PUT of <paramref name="body"/> as JSON, carrying the token.</summary>
    public static Task<HttpResponseMessage> PutWithTokenAsync(
        this HttpClient client, string path, string? token, object? body = null) =>
        client.SendWithTokenAsync(HttpMethod.Put, path, token, body);

    /// <summary>A DELETE carrying the token.</summary>
    public static Task<HttpResponseMessage> DeleteWithTokenAsync(
        this HttpClient client, string path, string? token) =>
        client.SendWithTokenAsync(HttpMethod.Delete, path, token);

    public static async Task<JsonElement> BodyAsync(this HttpResponseMessage response) =>
        await response.Content.ReadFromJsonAsync<JsonElement>();

    /// <summary>
    /// The field names a <c>ValidationProblemDetails</c> is complaining about. Callers compare
    /// them case insensitively: whether the keys arrive camel-cased is the serializer's
    /// business, and not what any test asking this question is about.
    /// </summary>
    public static async Task<IReadOnlyList<string>> RefusedFieldsAsync(
        this HttpResponseMessage response) =>
        [.. (await response.BodyAsync())
            .GetProperty("errors")
            .EnumerateObject()
            .Select(error => error.Name)];
}
