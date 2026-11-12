# Authentication is hand-written; ASP.NET Core Identity is not adopted

The `User` table from the specification is kept as-is, with JWT issuing, role claims and
login written directly. Only `PasswordHasher<User>` is borrowed from
`Microsoft.AspNetCore.Identity`, which works standalone and gives salted, versioned PBKDF2
without hand-rolling a hash or taking a BCrypt dependency.

Adopting Identity would replace the `User` table with the `AspNetUsers` schema and hide
the issuing, hashing and role wiring behind `UserManager` and `SignInManager`. For a
project whose purpose is to demonstrate and explain how those pieces work, framework
machinery is the wrong trade: it removes exactly the code worth being able to talk through.

## Consequences

Password reset, email confirmation, lockout, two-factor and external login providers do
not exist and would have to be written by hand if ever needed. Adopting Identity later
means migrating the user schema.

Tokens last 60 minutes and there are no refresh tokens — those need a token store,
rotation and revocation, which is a feature in its own right. An expired token means
logging in again.

The first admin cannot be created through the API, since registration always produces a
client and a role field in the payload would let anyone make themselves an admin. Instead
the admin is seeded during database initialisation from configuration, with credentials
from user-secrets locally and environment variables elsewhere. The seeder is idempotent.
Nothing secret is committed, which matters because the repository is public — `HasData`
in a migration would have required a password hash as a literal in tracked source, and a
published hash is attackable offline forever.
