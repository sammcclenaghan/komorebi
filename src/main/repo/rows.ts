/**
 * Row decoding shared by the repositories: map a snake_case libsql row to a
 * camelCase candidate, then validate it against the domain schema. A row
 * that doesn't decode is corrupted data — fail loudly with what's wrong
 * instead of letting it flow into the UI.
 */
import type { Row } from "@libsql/client";
import { Effect, Schema } from "effect";
import { DbError } from "../db/Db";

export const decodeRow = <A, I>(
  schema: Schema.Schema<A, I>,
  what: string
) => {
  const decode = Schema.decodeUnknownEither(schema);
  return (candidate: unknown): Effect.Effect<A, DbError> => {
    const result = decode(candidate);
    if (result._tag === "Right") return Effect.succeed(result.right);
    return Effect.fail(
      new DbError({
        message: `Corrupted ${what} row in database: ${result.left.message}`,
        cause: result.left
      })
    );
  };
};

export const text = (row: Row, key: string): string | null => {
  const v = row[key];
  return typeof v === "string" ? v : null;
};

export const integer = (row: Row, key: string): number | null => {
  const v = row[key];
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "bigint") return Number(v);
  return null;
};
