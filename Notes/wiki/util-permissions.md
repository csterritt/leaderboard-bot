# Utility: permissions.ts

**File**: `src/utils/permissions.ts`

## Function

### `hasAdministratorPermission(permissions: string): boolean`

Checks whether the Discord `ADMINISTRATOR` permission bit (`0x8`) is set in a permissions string.

**Algorithm**: Parse the string to `BigInt`, then `(BigInt(permissions) & ADMINISTRATOR_PERMISSION) === ADMINISTRATOR_PERMISSION`.

Discord permission values can exceed the safe integer range for JavaScript `number`, hence the `BigInt` parse.

**Usage**: Used by all admin-only slash command handlers (`/setleaderboardchannel`, `/removeleaderboardchannel`, `/addmonitoredchannel`, `/removemonitoredchannel`) to gate admin-only operations.

## Cross-references

- [constants.md](constants.md) — `ADMINISTRATOR_PERMISSION = 0x8n`
- [tests-permissions.md](tests-permissions.md)
