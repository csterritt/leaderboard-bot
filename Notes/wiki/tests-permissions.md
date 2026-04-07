# Tests: permissions.test.ts

**File**: `tests/permissions.test.ts`

## `hasAdministratorPermission` tests (6)

- `'8'` (pure ADMINISTRATOR bit) → `true`
- Combined bits including ADMINISTRATOR → `true`
- `'4'` (no ADMINISTRATOR bit) → `false`
- `'0'` → `false`
- Large permission value (> 32-bit) with ADMINISTRATOR bit → `true` (BigInt handles safely)
- Large permission value without ADMINISTRATOR bit → `false`

## Cross-references

- [util-permissions.md](util-permissions.md)
