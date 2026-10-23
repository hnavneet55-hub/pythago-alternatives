import postgres from "postgres";

const globalForDb = globalThis as unknown as { sql?: postgres.Sql };

// bigint and numeric columns come back as strings; convert explicitly where needed.
// prepare: false because Neon's pooled connection string runs PgBouncer in transaction mode.
export const sql = globalForDb.sql ?? postgres(process.env.DATABASE_URL!, { max: 5, prepare: false });

if (process.env.NODE_ENV !== "production") globalForDb.sql = sql;
