namespace ZakazivanjeApi.Entities;

/// <summary>What a user is allowed to do. There is no stylist role: stylists have no login.</summary>
public enum UserRole
{
    Client = 0,
    Admin = 1,
}
