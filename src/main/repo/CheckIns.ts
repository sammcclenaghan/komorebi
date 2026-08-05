import { randomUUID } from "node:crypto";
import type { Row } from "@libsql/client";
import { Effect } from "effect";
import {
  CoachMessageSchema,
  type CoachMessage,
  type CoachMessageRole
} from "~/shared/schema";
import { Db, DbError } from "../db/Db";
import { decodeRow, text } from "./rows";

const decodeMessage = decodeRow(CoachMessageSchema, "coach check-in message");

const fromRow = (row: Row): Effect.Effect<CoachMessage, DbError> =>
  decodeMessage({
    id: text(row, "id"),
    weekStart: text(row, "week_start"),
    role: text(row, "role"),
    content: text(row, "content"),
    createdAt: text(row, "created_at")
  });

export class CheckInsRepo extends Effect.Service<CheckInsRepo>()("CheckInsRepo", {
  dependencies: [Db.Default],
  effect: Effect.gen(function* () {
    const db = yield* Db;

    const listForWeek = (weekStart: string): Effect.Effect<CoachMessage[], DbError> =>
      db
        .rows(
          "SELECT * FROM coach_checkin_messages WHERE week_start = ? ORDER BY created_at ASC",
          [weekStart]
        )
        .pipe(Effect.flatMap(Effect.forEach(fromRow)));

    const add = (
      weekStart: string,
      role: CoachMessageRole,
      content: string
    ): Effect.Effect<CoachMessage, DbError> =>
      Effect.suspend(() => {
        const message: CoachMessage = {
          id: randomUUID(),
          weekStart,
          role,
          content: content.trim(),
          createdAt: new Date().toISOString()
        };
        return db
          .execute(
            `INSERT INTO coach_checkin_messages (id, week_start, role, content, created_at)
             VALUES (?, ?, ?, ?, ?)`,
            [message.id, message.weekStart, message.role, message.content, message.createdAt]
          )
          .pipe(Effect.as(message));
      });

    /** User-authored check-in notes that should steer future task composition. */
    const recentUserNotes = (limit: number = 12): Effect.Effect<CoachMessage[], DbError> =>
      db
        .rows(
          `SELECT * FROM coach_checkin_messages
           WHERE role = 'user' ORDER BY created_at DESC LIMIT ?`,
          [limit]
        )
        .pipe(Effect.flatMap(Effect.forEach(fromRow)));

    return { listForWeek, add, recentUserNotes } as const;
  })
}) {}
