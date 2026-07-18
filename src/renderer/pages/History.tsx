import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, ChevronRight, Clock, History as HistoryIcon, SkipForward, ThumbsDown, ThumbsUp } from "lucide-react";
import { cn } from "~/lib/cn";
import type { Goal, HistoryDay, Reflection, Suggestion } from "~/shared/schema";

const WEEKS = 17;

type Props = {
  onOpenSuggestion: (id: string) => void;
};

export function History({ onOpenSuggestion }: Props) {
  const historyQuery = useQuery({
    queryKey: ["history", WEEKS * 7],
    queryFn: () => window.komorebi.history.list(WEEKS * 7)
  });

  const todayQuery = useQuery({
    queryKey: ["checklist", "today"],
    queryFn: () => window.komorebi.checklist.today()
  });

  const goalsQuery = useQuery({
    queryKey: ["goals"],
    queryFn: () => window.komorebi.goals.list(),
    staleTime: 60_000
  });

  const goalsById = useMemo(
    () => new Map((goalsQuery.data ?? []).map((g) => [g.id, g])),
    [goalsQuery.data]
  );

  const days = historyQuery.data ?? [];
  const todayDate = todayQuery.data?.date ?? localDate();
  const todayItems = todayQuery.data?.items ?? [];

  // History excludes today; fold today in so the grid + streak include it.
  const byDate = useMemo(() => {
    const map = new Map<string, HistoryDay>();
    for (const d of days) map.set(d.date, d);
    if (todayQuery.data) {
      map.set(todayDate, { date: todayDate, items: todayItems, reflectionsByItem: {} });
    }
    return map;
  }, [days, todayQuery.data, todayDate, todayItems]);

  const [selected, setSelected] = useState<string | null>(null);
  const selectedDate = selected ?? days[0]?.date ?? todayDate;
  const selectedDay = byDate.get(selectedDate);

  const hasAny = byDate.size > 0 && [...byDate.values()].some((d) => d.items.length > 0);

  return (
    <div className="page-shell">
      <header>
        <div className="flex items-center gap-3 text-[var(--color-ink-3)]">
          <HistoryIcon className="h-4 w-4" strokeWidth={1.5} />
          <span className="font-mono text-2xs uppercase tracking-[0.22em]">history</span>
        </div>
        <h1 className="mt-3 text-4xl font-semibold text-[var(--color-ink)]">
          What you've been <span className="font-normal text-[var(--color-ink-2)]">working on.</span>
        </h1>
        <p className="mt-3 max-w-lg text-base leading-relaxed text-[var(--color-ink-2)]">
          Your last {WEEKS} weeks at a glance. Pick any day to see what Komorebi
          composed, what you finished, and the notes you left.
        </p>
      </header>

      {historyQuery.isLoading ? (
        <div className="mt-12">
          <LoadingState />
        </div>
      ) : !hasAny ? (
        <div className="mt-12">
          <EmptyState />
        </div>
      ) : (
        <>
          <Heatmap
            byDate={byDate}
            todayDate={todayDate}
            selectedDate={selectedDate}
            onSelect={setSelected}
          />

          <div className="mt-10 border-t border-[var(--color-rule)] pt-8">
            {selectedDay && selectedDay.items.length > 0 ? (
              <DayBlock
                key={selectedDate}
                day={selectedDay}
                goalsById={goalsById}
                onOpenSuggestion={onOpenSuggestion}
                style={{ animation: "fade-in 150ms ease-out" }}
              />
            ) : (
              <SelectedEmpty key={selectedDate} date={selectedDate} todayDate={todayDate} />
            )}
          </div>
        </>
      )}
    </div>
  );
}

function Heatmap({
  byDate,
  todayDate,
  selectedDate,
  onSelect
}: {
  byDate: Map<string, HistoryDay>;
  todayDate: string;
  selectedDate: string;
  onSelect: (date: string) => void;
}) {
  const { columns, monthLabels } = useMemo(() => buildGrid(byDate, todayDate), [byDate, todayDate]);

  const totalDone = useMemo(
    () => [...byDate.values()].reduce((n, d) => n + d.items.filter((s) => s.status === "done").length, 0),
    [byDate]
  );

  return (
    <div className="mt-10 flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
      <div className="overflow-x-auto" dir="rtl">
        <div dir="ltr" className="w-fit">
          {/* Month labels */}
          <div className="mb-1.5 flex pl-[24px] text-2xs text-[var(--color-ink-3)]">
            {columns.map((_, ci) => (
              <div key={ci} className="w-[18px] shrink-0 font-mono">
                {monthLabels[ci] ?? ""}
              </div>
            ))}
          </div>

          <div className="flex gap-[4px]">
            {/* Weekday labels */}
            <div className="mr-[4px] flex w-[20px] flex-col gap-[4px] text-2xs text-[var(--color-ink-3)]">
              {["", "M", "", "W", "", "F", ""].map((d, i) => (
                <div key={i} className="flex h-3.5 items-center font-mono leading-none">
                  {d}
                </div>
              ))}
            </div>

            {columns.map((col, ci) => (
              <div key={ci} className="flex flex-col gap-[4px]">
                {col.map((cell, ri) =>
                  cell ? (
                    <button
                      key={cell.iso}
                      onClick={() => onSelect(cell.iso)}
                      title={cellTitle(cell)}
                      aria-label={cellTitle(cell)}
                      aria-pressed={cell.iso === selectedDate}
                      className="group/cell flex h-3.5 w-3.5 items-center justify-center"
                    >
                      <span
                        className={cn(
                          "h-3.5 w-3.5 rounded-[3px] transition-transform",
                          "[@media(hover:hover)]:group-hover/cell:scale-125 group-active/cell:scale-90",
                          cell.iso === selectedDate &&
                            "ring-[1.5px] ring-[var(--color-ink)] ring-offset-1 ring-offset-[var(--color-canvas)]"
                        )}
                        style={{ background: LEVEL_BG[cell.level] }}
                      />
                    </button>
                  ) : (
                    <div key={`empty-${ci}-${ri}`} className="h-3.5 w-3.5" />
                  )
                )}
              </div>
            ))}
          </div>

          {/* Legend */}
          <div className="mt-2.5 flex items-center gap-1.5 pl-[24px] text-2xs text-[var(--color-ink-3)]">
            <span className="font-mono">less</span>
            {[0, 1, 2, 3, 4].map((l) => (
              <span
                key={l}
                className="h-3.5 w-3.5 rounded-[3px]"
                style={{ background: LEVEL_BG[l] }}
              />
            ))}
            <span className="font-mono">more</span>
          </div>
        </div>
      </div>

      <div className="flex shrink-0 gap-6 sm:flex-col sm:gap-4">
        <Stat label="completed" value={totalDone} unit={totalDone === 1 ? "task" : "tasks"} />
      </div>
    </div>
  );
}

function Stat({ label, value, unit }: { label: string; value: number; unit: string }) {
  return (
    <div>
      <div className="font-mono text-2xs uppercase tracking-[0.18em] text-[var(--color-ink-3)]">
        {label}
      </div>
      <div className="mt-0.5 flex items-baseline gap-1">
        <span className="text-2xl font-semibold tabular-nums leading-none text-[var(--color-ink)]">
          {value}
        </span>
        <span className="text-xs text-[var(--color-ink-3)]">{unit}</span>
      </div>
    </div>
  );
}

function SelectedEmpty({ date, todayDate }: { date: string; todayDate: string }) {
  return (
    <section style={{ animation: "fade-in 150ms ease-out" }}>
      <header className="flex items-baseline gap-3">
        <h2 className="text-xl font-semibold text-[var(--color-ink)]">
          {formatLongDate(date)}
        </h2>
        <span className="font-mono text-2xs uppercase tracking-[0.18em] text-[var(--color-ink-3)]">
          {formatRelativeDay(date)}
        </span>
      </header>
      <p className="mt-3 text-base text-[var(--color-ink-2)]">
        {date === todayDate
          ? "Nothing composed yet today."
          : "Nothing was composed on this day."}
      </p>
    </section>
  );
}

// ── Grid construction ──────────────────────────────────────────────

type Cell = { iso: string; level: number; done: number; total: number };

function buildGrid(
  byDate: Map<string, HistoryDay>,
  todayDate: string
): { columns: (Cell | null)[][]; monthLabels: (string | null)[] } {
  const today = toDate(todayDate);
  const todayDow = today.getDay(); // 0 = Sunday
  const start = addDays(today, -((WEEKS - 1) * 7 + todayDow));

  const columns: (Cell | null)[][] = [];
  const monthLabels: (string | null)[] = [];
  let lastMonth = -1;

  for (let w = 0; w < WEEKS; w++) {
    const col: (Cell | null)[] = [];
    for (let r = 0; r < 7; r++) {
      const d = addDays(start, w * 7 + r);
      const iso = isoOf(d);
      if (iso > todayDate) {
        col.push(null);
        continue;
      }
      col.push(makeCell(iso, byDate.get(iso)));
    }
    // Month label for the column = month of its first in-range day.
    const firstReal = col.find((c): c is Cell => c != null);
    const month = firstReal ? toDate(firstReal.iso).getMonth() : -1;
    if (month !== -1 && month !== lastMonth) {
      monthLabels.push(MONTHS[month] ?? null);
      lastMonth = month;
    } else {
      monthLabels.push(null);
    }
    columns.push(col);
  }

  return { columns, monthLabels };
}

function makeCell(iso: string, day: HistoryDay | undefined): Cell {
  if (!day || day.items.length === 0) return { iso, level: 0, done: 0, total: 0 };
  const nonSkipped = day.items.filter((s) => s.status !== "skipped");
  const done = day.items.filter((s) => s.status === "done").length;
  const total = nonSkipped.length;
  let level = 1;
  if (done > 0) {
    const ratio = total > 0 ? done / total : 0;
    level = ratio >= 1 ? 4 : ratio >= 0.5 ? 3 : 2;
  }
  return { iso, level, done, total };
}

const LEVEL_BG = [
  "var(--color-panel-2)",
  "var(--color-heat-1)",
  "var(--color-heat-2)",
  "var(--color-heat-3)",
  "var(--color-accent)"
];

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function cellTitle(cell: Cell): string {
  const date = formatLongDate(cell.iso);
  if (cell.total === 0) return `${date} — nothing composed`;
  return `${date} — ${cell.done}/${cell.total} done`;
}

// ── Date helpers (local, YYYY-MM-DD) ───────────────────────────────

function localDate(): string {
  return isoOf(new Date());
}

function isoOf(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function toDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
}

function addDays(d: Date, n: number): Date {
  const next = new Date(d);
  next.setDate(next.getDate() + n);
  return next;
}

// ── Day detail (reused from the previous list view) ────────────────

function DayBlock({
  day,
  goalsById,
  onOpenSuggestion,
  style
}: {
  day: HistoryDay;
  goalsById: Map<string, Goal>;
  onOpenSuggestion: (id: string) => void;
  style?: React.CSSProperties;
}) {
  const doneCount = day.items.filter((s) => s.status === "done").length;
  const nonSkipped = day.items.filter((s) => s.status !== "skipped");

  return (
    <section style={style}>
      <header className="flex items-baseline justify-between">
        <div className="flex items-baseline gap-3">
          <h2 className="text-xl font-semibold text-[var(--color-ink)]">
            {formatLongDate(day.date)}
          </h2>
          <span className="font-mono text-2xs uppercase tracking-[0.18em] text-[var(--color-ink-3)]">
            {formatRelativeDay(day.date)}
          </span>
        </div>
        {nonSkipped.length > 0 && (
          <span className="font-mono text-2xs tabular-nums text-[var(--color-ink-3)]">
            <span className="text-[var(--color-ink)]">{doneCount}</span>
            <span className="opacity-60"> / </span>
            <span>{nonSkipped.length}</span>
          </span>
        )}
      </header>

      <ul className="mt-3 space-y-2">
        {day.items.map((item) => (
          <li key={item.id}>
            <HistoryRow
              item={item}
              goal={goalsById.get(item.goalId)}
              reflections={day.reflectionsByItem[item.id] ?? []}
              onOpen={() => onOpenSuggestion(item.id)}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}

function HistoryRow({
  item,
  goal,
  reflections,
  onOpen
}: {
  item: Suggestion;
  goal: Goal | undefined;
  reflections: Reflection[];
  onOpen: () => void;
}) {
  const isDone = item.status === "done";
  const isSkipped = item.status === "skipped";

  return (
    <article
      className={cn(
        "pressable-row group rounded-xl border border-[var(--color-rule)] bg-[var(--color-canvas)]",
        "hover:border-[var(--color-rule-2)] active:border-[var(--color-rule-2)] active:bg-[var(--color-panel-hover)]",
        isSkipped && "opacity-55"
      )}
    >
      <button onClick={onOpen} className="flex w-full items-start gap-4 px-4 py-3.5 text-left">
        <StatusDot status={item.status} />

        <div className="min-w-0 flex-1">
          <h3
            className={cn(
              "text-lg font-medium leading-snug text-[var(--color-ink)]",
              (isDone || isSkipped) && "line-through decoration-[var(--color-ink-3)] decoration-[1px]"
            )}
          >
            {item.title}
          </h3>
          <p className="mt-1 text-sm leading-snug text-[var(--color-ink-2)] line-clamp-1">
            {item.summary}
          </p>
          <div className="mt-2 flex items-center gap-2.5 text-2xs text-[var(--color-ink-3)]">
            {goal && <span className="font-mono uppercase tracking-[0.14em]">{goal.title}</span>}
            {item.estimatedMinutes != null && (
              <span className="flex items-center gap-1 font-mono">
                <Clock className="h-2.5 w-2.5" strokeWidth={2} />
                {item.estimatedMinutes}m
              </span>
            )}
            {isSkipped && <span className="font-mono uppercase tracking-[0.14em]">skipped</span>}
          </div>
        </div>

        {item.rating === "up" && (
          <ThumbsUp
            className="mt-1 h-3.5 w-3.5 shrink-0 text-[var(--color-accent-strong)]"
            strokeWidth={2.5}
            fill="currentColor"
          />
        )}
        {item.rating === "down" && (
          <ThumbsDown
            className="mt-1 h-3.5 w-3.5 shrink-0 text-[var(--color-ink-3)]"
            strokeWidth={2.5}
            fill="currentColor"
          />
        )}

        <ChevronRight
          className="mt-3 h-4 w-4 shrink-0 text-[var(--color-ink-3)] opacity-0 transition-opacity group-hover:opacity-60"
          strokeWidth={1.5}
        />
      </button>

      {reflections.length > 0 && (
        <div className="border-t border-[var(--color-rule)] px-4 py-3">
          <div className="space-y-1.5">
            {reflections.map((r) => (
              <p
                key={r.id}
                className="border-l-2 border-[var(--color-rule-2)] pl-3 text-sm leading-snug italic text-[var(--color-ink-2)]"
              >
                {r.text}
              </p>
            ))}
          </div>
        </div>
      )}
    </article>
  );
}

function StatusDot({ status }: { status: Suggestion["status"] }) {
  if (status === "done") {
    return (
      <span className="mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full bg-[var(--color-accent)] text-[var(--color-canvas)]">
        <Check className="h-3 w-3" strokeWidth={3} />
      </span>
    );
  }
  if (status === "skipped") {
    return (
      <span className="mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border-[1.5px] border-[var(--color-rule-2)] bg-[var(--color-panel)] text-[var(--color-ink-3)]">
        <SkipForward className="h-2.5 w-2.5" strokeWidth={2.5} />
      </span>
    );
  }
  return (
    <span className="mt-0.5 h-[18px] w-[18px] shrink-0 rounded-full border-[1.5px] border-[var(--color-rule-2)] bg-[var(--color-canvas)]" />
  );
}

function LoadingState() {
  return (
    <div className="space-y-6">
      <div className="h-[120px] rounded-xl border border-[var(--color-rule)] bg-[var(--color-panel)]" />
      <div className="mt-3 space-y-2">
        <div className="h-[74px] rounded-xl border border-[var(--color-rule)] bg-[var(--color-panel)]" />
        <div className="h-[74px] rounded-xl border border-[var(--color-rule)] bg-[var(--color-panel)]" />
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="mx-auto mt-12 max-w-sm text-center">
      <h3 className="text-2xl font-semibold text-[var(--color-ink)]">
        Nothing yet.
      </h3>
      <p className="mt-2 text-base text-[var(--color-ink-2)]">
        Past days will show up here. Come back tomorrow.
      </p>
    </div>
  );
}

function formatLongDate(yyyymmdd: string): string {
  return toDate(yyyymmdd).toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric"
  });
}

function formatRelativeDay(yyyymmdd: string): string {
  const target = toDate(yyyymmdd);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Math.round((today.getTime() - target.getTime()) / (24 * 60 * 60 * 1000));
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  if (days < 14) return "last week";
  if (days < 30) return `${Math.floor(days / 7)} weeks ago`;
  return `${Math.floor(days / 30)} months ago`;
}
