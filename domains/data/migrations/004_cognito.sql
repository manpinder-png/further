-- Provider identity is the stable Cognito subject; emails never link accounts.
ALTER TABLE accounts DROP CONSTRAINT IF EXISTS accounts_provider_check;
ALTER TABLE accounts DROP CONSTRAINT IF EXISTS accounts_check;
ALTER TABLE accounts ADD CONSTRAINT accounts_provider_check CHECK(provider IN ('password','google','cognito'));
ALTER TABLE accounts ADD CONSTRAINT accounts_credential_check CHECK(
  (provider='password' AND password_hash IS NOT NULL)
  OR (provider IN ('google','cognito') AND password_hash IS NULL)
);
ALTER TABLE account_identities DROP CONSTRAINT IF EXISTS account_identities_provider_check;
ALTER TABLE account_identities ADD CONSTRAINT account_identities_provider_check CHECK(provider IN ('google','cognito'));
