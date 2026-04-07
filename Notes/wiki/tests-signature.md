# Tests: signature.test.ts

**File**: `tests/signature.test.ts`

## `verifyDiscordSignature` tests (3)

- Valid Ed25519 signature returns `true`
- Tampered body (different JSON) returns `false`
- Tampered/bad signature hex returns `false`

Test helper `makeKeyAndSign` generates a fresh Ed25519 key pair via `crypto.subtle.generateKey`, signs `timestamp + body`, and returns the hex public key and signature for use in each test.

## Cross-references

- [util-signature.md](util-signature.md)
