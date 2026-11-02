import type { PGlite } from "@electric-sql/pglite";

/** Private SQL transport port. Domain callers never choose SQL or an actor. */
export interface SqlQuery {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: T[]; affectedRows?: number }>;
}
export interface SqlTransaction extends SqlQuery { exec(sql: string): Promise<unknown> }
export interface SqlDatabase extends SqlTransaction {
  transaction<T>(callback: (transaction: SqlTransaction) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

/** Preserve JSON intent across transports without guessing from user text. */
export class JsonParameter { constructor(public readonly text: string) {} }
export const sqlJson = (value: unknown) => new JsonParameter(JSON.stringify(value));
/** An explicit UUID field; UUID-looking learning text remains ordinary text. */
export class UuidParameter { constructor(public readonly text: string) {} }
export const sqlUuid = (value: string | null | undefined) => value == null ? null : new UuidParameter(value);
export function pgliteDatabase(database: PGlite): SqlDatabase {
  const params = (values?: unknown[]) => values?.map(value => value instanceof JsonParameter || value instanceof UuidParameter ? value.text : value);
  return {
    query: (sql, values) => database.query(sql, params(values)),
    exec: sql => database.exec(sql),
    transaction: callback => database.transaction(transaction => callback({
      query: (sql, values) => transaction.query(sql, params(values)),
      exec: sql => transaction.exec(sql),
    })),
    close: () => database.close(),
  };
}
