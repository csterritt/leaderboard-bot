# Plan: Migrate from better-sqlite3 to bun:sqlite (pure — no better-sqlite3 at all)

## Assumptions
- No database schema changes needed
- `bun:sqlite`'s `db.prepare()` API is compatible with `better-sqlite3`'s
- `@types/bun` (already in devDependencies) provides types for `bun:sqlite`
- Tests run under Bun runtime via `bun vitest run` (required for `bun:sqlite`)
- **No `better-sqlite3` anywhere** — not in deps, not in devDeps, not as a shim

## API Differences (better-sqlite3 → bun:sqlite)
- Import: `import Database from 'better-sqlite3'` → `import { Database } from 'bun:sqlite'`
- Type: `BetterSqlite3.Database` → `Database` from `bun:sqlite`
- `db.pragma('foreign_keys = ON')` → `db.exec('PRAGMA foreign_keys = ON')`
- `new Database(':memory:')` works the same
- `db.prepare()`, `.get()`, `.all()`, `.run()`, `.exec()`, `.close()` all compatible
- `.run()` returns `{ changes, lastInsertRowid }` in both

## Pitfalls
- `db.pragma()` does NOT exist in bun:sqlite — must use `db.exec('PRAGMA ...')`
- `bun:sqlite` only works under Bun runtime, not Node.js
- Must remove `postinstall` script that rebuilds better-sqlite3 native addon
- Previous attempt kept `better-sqlite3` as a devDep/shim for Vitest — that was wrong. Tests must run via `bun vitest run` so `bun:sqlite` resolves natively.

## Tasks

- [x] 1. Update `src/types.ts` — change `Database` type from `BetterSqlite3.Database` to `bun:sqlite`'s `Database`
- [x] 2. Update `src/index.ts` — change import and `db.pragma()` → `db.exec('PRAGMA ...')`
- [x] 3–13. Update all 11 test files — change import and `db.pragma()` → `db.exec('PRAGMA ...')`
- [x] 14. Remove `better-sqlite3` shim and `resolve.alias` from `vitest.config.ts`
- [x] 15. Remove `better-sqlite3` and `@types/better-sqlite3` from `package.json` entirely
- [x] 16. Run `bun install` to clean up lockfile
- [x] 17. Fix `null` vs `undefined` API difference: `bun:sqlite` `.get()` returns `null` for no-match (not `undefined`)
- [x] 18. Update test scripts to use `bun --bun vitest run` for native `bun:sqlite` resolution
- [x] 19. Run `bun --bun vitest run` and verify all 304 tests pass
- [x] 20. Update wiki to reflect pure bun:sqlite usage
