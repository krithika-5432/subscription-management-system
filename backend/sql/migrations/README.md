# Migrations

`schema.sql` is the baseline. Later schema changes go here as numbered files such as `002_add_column.sql`.
`npm run db:setup` applies any file not yet listed in the `schema_migrations` table, in name order.
