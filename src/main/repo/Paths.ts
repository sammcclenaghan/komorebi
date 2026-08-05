import { randomUUID } from "node:crypto";
import type { InStatement, Row } from "@libsql/client";
import { Data, Effect } from "effect";
import {
  GoalPathSchema,
  PathMilestoneSchema,
  PathSourceSchema,
  type GoalPath,
  type PathMilestone,
  type PathPlanDraft,
  type PathSource
} from "~/shared/schema";
import { Db, DbError } from "../db/Db";
import { decodeRow, integer, text } from "./rows";

export class PathConflictError extends Data.TaggedError("PathConflictError")<{
  message: string;
}> {}

export class PathValidationError extends Data.TaggedError("PathValidationError")<{
  message: string;
}> {}

/** Longer than the normal Exa + Ollama path-generation budget. */
export const STALE_PATH_GENERATION_MS = 10 * 60 * 1000;

const decodeMilestone = decodeRow(PathMilestoneSchema, "path milestone");
const decodeSource = decodeRow(PathSourceSchema, "path source");
const decodePath = decodeRow(GoalPathSchema, "goal path");

const milestoneFromRow = (row: Row): Effect.Effect<PathMilestone, DbError> =>
  decodeMilestone({
    id: text(row, "id"),
    pathId: text(row, "path_id"),
    position: integer(row, "position"),
    title: text(row, "title"),
    outcome: text(row, "outcome"),
    rationale: text(row, "rationale"),
    completionCriteria: text(row, "completion_criteria"),
    status: text(row, "status"),
    completionEvidence: text(row, "completion_evidence"),
    completedAt: text(row, "completed_at")
  });

const sourceFromRow = (row: Row): Effect.Effect<PathSource, DbError> =>
  decodeSource({
    id: text(row, "id"),
    pathId: text(row, "path_id"),
    title: text(row, "title"),
    url: text(row, "url"),
    excerpt: text(row, "excerpt")
  });

export class PathsRepo extends Effect.Service<PathsRepo>()("PathsRepo", {
  dependencies: [Db.Default],
  effect: Effect.gen(function* () {
    const db = yield* Db;

    const hydrate = (row: Row): Effect.Effect<GoalPath, DbError> =>
      Effect.gen(function* () {
        const id = text(row, "id");
        if (!id) {
          return yield* Effect.fail(new DbError({ message: "Corrupted goal path row: no id" }));
        }
        const [milestoneRows, sourceRows] = yield* Effect.all([
          db.rows("SELECT * FROM path_milestones WHERE path_id = ? ORDER BY position", [id]),
          db.rows("SELECT * FROM path_sources WHERE path_id = ? ORDER BY id", [id])
        ]);
        const milestones = yield* Effect.forEach(milestoneRows, milestoneFromRow);
        const sources = yield* Effect.forEach(sourceRows, sourceFromRow);
        return yield* decodePath({
          id,
          goalId: text(row, "goal_id"),
          version: integer(row, "version"),
          status: text(row, "status"),
          revision: integer(row, "revision"),
          assumptions: text(row, "assumptions"),
          researchSummary: text(row, "research_summary"),
          researchAt: text(row, "research_at"),
          error: text(row, "error"),
          createdAt: text(row, "created_at"),
          updatedAt: text(row, "updated_at"),
          milestones,
          sources
        });
      });

    const one = (sql: string, args: string[]) =>
      db.rows(sql, args).pipe(
        Effect.flatMap((rows) => (rows[0] ? hydrate(rows[0]) : Effect.succeed(null)))
      );

    const getById = (id: string) => one("SELECT * FROM goal_paths WHERE id = ?", [id]);
    const getForGoal = (goalId: string) =>
      one("SELECT * FROM goal_paths WHERE goal_id = ? ORDER BY version DESC LIMIT 1", [goalId]);
    const getActive = (goalId: string) =>
      one("SELECT * FROM goal_paths WHERE goal_id = ? AND status = 'active'", [goalId]);

    const requireResult = (path: GoalPath | null, message: string) =>
      path ? Effect.succeed(path) : Effect.fail(new PathConflictError({ message }));

    const start = (goalId: string) =>
      Effect.gen(function* () {
        const id = randomUUID();
        const nowDate = new Date();
        const now = nowDate.toISOString();
        const staleBefore = new Date(nowDate.getTime() - STALE_PATH_GENERATION_MS).toISOString();

        // A process may stop after persisting the attempt but before its
        // network calls settle. Recover only attempts older than the full
        // research budget; a fresh attempt remains the single owner.
        yield* db.execute(
          `UPDATE goal_paths SET status = 'failed', error = ?, revision = revision + 1,
             updated_at = ?
           WHERE goal_id = ? AND status = 'generating' AND updated_at < ?`,
          ["Path generation was interrupted. Retry to continue.", now, goalId, staleBefore]
        );

        const existingCandidate = yield* db.rows(
          `SELECT id FROM goal_paths
           WHERE goal_id = ? AND status IN ('generating', 'draft') LIMIT 1`,
          [goalId]
        );
        if (existingCandidate.length > 0) {
          return yield* Effect.fail(
            new PathConflictError({
              message: "A path is already being generated or waiting for review."
            })
          );
        }

        // One generating/draft candidate per goal. The unique expression index
        // makes simultaneous generation attempts deterministic.
        const inserted = yield* db.rows(
          `INSERT INTO goal_paths
             (id, goal_id, version, status, revision, created_at, updated_at)
           SELECT ?, ?, COALESCE(MAX(version), 0) + 1, 'generating', 0, ?, ?
           FROM goal_paths WHERE goal_id = ?
           RETURNING *`,
          [id, goalId, now, now, goalId]
        );
        return yield* hydrate(inserted[0]!);
      }).pipe(
        Effect.catchIf(
          (error) => error instanceof DbError && /unique/i.test(error.message),
          () =>
            Effect.fail(
              new PathConflictError({
                message: "A path is already being generated or waiting for review."
              })
            )
        )
      );

    const fail = (id: string, error: string) =>
      db
        .rows(
          `UPDATE goal_paths SET status = 'failed', error = ?, revision = revision + 1,
             updated_at = ? WHERE id = ? AND status = 'generating' RETURNING *`,
          [error.slice(0, 1000), new Date().toISOString(), id]
        )
        .pipe(
          Effect.flatMap((rows): Effect.Effect<GoalPath, DbError | PathConflictError> =>
            rows[0]
              ? hydrate(rows[0])
              : Effect.fail(new PathConflictError({ message: "Path generation is stale." }))
          )
        );

    const saveDraft = (id: string, plan: PathPlanDraft, sources: PathSource[]) =>
      Effect.gen(function* () {
        const now = new Date().toISOString();
        const statements: InStatement[] = [
          {
            sql: `UPDATE goal_paths SET status = 'draft', assumptions = ?, research_summary = ?,
                    research_at = ?, error = NULL, revision = revision + 1, updated_at = ?
                  WHERE id = ? AND status = 'generating'`,
            args: [plan.assumptions, plan.researchSummary, now, now, id]
          }
        ];
        for (const [position, milestone] of plan.milestones.entries()) {
          statements.push({
            sql: `INSERT INTO path_milestones
                    (id, path_id, position, title, outcome, rationale, completion_criteria, status)
                  SELECT ?, ?, ?, ?, ?, ?, ?, 'pending'
                  WHERE EXISTS (SELECT 1 FROM goal_paths WHERE id = ? AND status = 'draft')`,
            args: [
              randomUUID(), id, position, milestone.title, milestone.outcome,
              milestone.rationale, milestone.completionCriteria, id
            ]
          });
        }
        for (const source of sources) {
          statements.push({
            sql: `INSERT INTO path_sources (id, path_id, title, url, excerpt)
                  SELECT ?, ?, ?, ?, ?
                  WHERE EXISTS (SELECT 1 FROM goal_paths WHERE id = ? AND status = 'draft')`,
            args: [source.id, id, source.title, source.url, source.excerpt, id]
          });
        }
        yield* db.batch(statements);
        return yield* getById(id).pipe(
          Effect.flatMap((path) => requireResult(path?.status === "draft" ? path : null, "Path generation is stale."))
        );
      });

    const activate = (id: string, expectedRevision: number) =>
      Effect.gen(function* () {
        const now = new Date().toISOString();
        // Initial activation only: never replace an existing active path.
        yield* db.batch([
          {
            sql: `UPDATE goal_paths SET status = 'active', revision = revision + 1, updated_at = ?
                  WHERE id = ? AND status = 'draft' AND revision = ?
                    AND NOT EXISTS (
                      SELECT 1 FROM goal_paths active
                      WHERE active.goal_id = goal_paths.goal_id AND active.status = 'active'
                    )`,
            args: [now, id, expectedRevision]
          },
          {
            sql: `UPDATE path_milestones SET status = 'current'
                  WHERE id = (SELECT id FROM path_milestones WHERE path_id = ? ORDER BY position LIMIT 1)
                    AND status = 'pending'
                    AND EXISTS (
                      SELECT 1 FROM goal_paths WHERE id = ? AND status = 'active'
                        AND revision = ?
                    )`,
            args: [id, id, expectedRevision + 1]
          }
        ]);
        const path = yield* getById(id);
        return yield* requireResult(
          path?.status === "active" &&
            path.revision === expectedRevision + 1 &&
            path.milestones.some((milestone) => milestone.status === "current")
            ? path
            : null,
          "Path changed or another path is already active; reload before activating."
        );
      });

    const completeMilestone = (
      id: string,
      milestoneId: string,
      evidence: string,
      expectedRevision: number
    ) =>
      Effect.gen(function* () {
        const trimmedEvidence = evidence.trim();
        if (!trimmedEvidence) {
          return yield* Effect.fail(
            new PathValidationError({ message: "Completion evidence is required." })
          );
        }
        const now = new Date().toISOString();
        yield* db.batch([
          {
            sql: `UPDATE path_milestones SET status = 'completed', completion_evidence = ?, completed_at = ?
                  WHERE id = ? AND path_id = ? AND status = 'current'
                    AND EXISTS (SELECT 1 FROM goal_paths WHERE id = ? AND status = 'active' AND revision = ?)`,
            args: [trimmedEvidence, now, milestoneId, id, id, expectedRevision]
          },
          {
            sql: `UPDATE path_milestones SET status = 'current'
                  WHERE id = (
                    SELECT next.id FROM path_milestones next
                    JOIN path_milestones done ON done.id = ?
                    WHERE next.path_id = ? AND next.status = 'pending'
                      AND next.position > done.position AND done.status = 'completed'
                    ORDER BY next.position LIMIT 1
                  ) AND status = 'pending'`,
            args: [milestoneId, id]
          },
          {
            sql: `UPDATE goal_paths SET
                    status = CASE WHEN EXISTS (
                      SELECT 1 FROM path_milestones WHERE path_id = ? AND status = 'current'
                    ) THEN 'active' ELSE 'completed' END,
                    revision = revision + 1, updated_at = ?
                  WHERE id = ? AND status = 'active' AND revision = ?
                    AND EXISTS (
                      SELECT 1 FROM path_milestones WHERE id = ? AND path_id = ?
                        AND status = 'completed' AND completion_evidence = ?
                    )`,
            args: [id, now, id, expectedRevision, milestoneId, id, trimmedEvidence]
          }
        ]);
        const path = yield* getById(id);
        return yield* requireResult(
          path && path.revision === expectedRevision + 1 ? path : null,
          "Path or current milestone changed; reload before completing it."
        );
      });

    const removeForGoal = (goalId: string): Effect.Effect<void, DbError> =>
      db
        .batch([
          {
            sql: `DELETE FROM path_sources WHERE path_id IN
                    (SELECT id FROM goal_paths WHERE goal_id = ?)`,
            args: [goalId]
          },
          {
            sql: `DELETE FROM path_milestones WHERE path_id IN
                    (SELECT id FROM goal_paths WHERE goal_id = ?)`,
            args: [goalId]
          },
          { sql: "DELETE FROM goal_paths WHERE goal_id = ?", args: [goalId] }
        ])
        .pipe(Effect.asVoid);

    return {
      getById,
      getForGoal,
      getActive,
      start,
      fail,
      saveDraft,
      activate,
      completeMilestone,
      removeForGoal
    } as const;
  })
}) {}
