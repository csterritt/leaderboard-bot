Currently this is written to use 'better-sqlite3' for the database. However, that does not
work with bun at runtime. Please change the database access to use 'bun:sqlite' instead.
See here for its documentation: https://bun.com/docs/runtime/sqlite

The first cut at this task rewrote it referencing 'better-sqlite3' and recasting the 'bun:sqlite'
usage to match. That was a mistake, please remove all the 'better-sqlite3' references and usage.
Then rewrite with just 'bun:sqlite' usage.

Write the plan to make the change, write it to Notes/Plan.md, and then implement it.
