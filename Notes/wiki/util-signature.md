# Utility: signature.ts

**File**: `src/utils/signature.ts`

## Function

### `verifyDiscordSignature({ publicKey, timestamp, body, signature }): Promise<boolean>`

Verifies a Discord interaction signature using the Ed25519 algorithm via the Web Crypto API (`crypto.subtle`).

**Algorithm**:
1. Decode `publicKey` and `signature` from hex strings to `Uint8Array`
2. Build message bytes: `UTF-8(timestamp + body)`
3. Import the public key as an `Ed25519` key via `crypto.subtle.importKey`
4. Verify with `crypto.subtle.verify`
5. Returns `false` on any error (invalid hex, bad key, etc.)

**Usage**: Called by the HTTP interactions handler to authenticate every incoming slash command request before routing.

## Cross-references

- [tests-signature.md](tests-signature.md)
- [overview.md](overview.md) — interactions handler
