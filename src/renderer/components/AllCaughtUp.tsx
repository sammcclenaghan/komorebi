export function AllCaughtUp() {
  return (
    <div className="mt-10 flex flex-col items-center">
      <div className="relative h-14 w-14">
        {/* Outward pulse ring */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-full bg-[var(--color-accent)]/30"
          style={{ animation: "ring-pulse 1.4s ease-out 0.15s both" }}
        />
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-full bg-[var(--color-accent)]/20"
          style={{ animation: "ring-pulse 1.8s ease-out 0.4s both" }}
        />

        {/* Solid circle */}
        <div
          className="relative flex h-14 w-14 items-center justify-center rounded-full bg-[var(--color-accent-tint)] ring-1 ring-[var(--color-accent)]/40"
          style={{ animation: "scale-in 420ms cubic-bezier(0.34, 1.56, 0.64, 1)" }}
        >
          <svg
            viewBox="0 0 24 24"
            className="h-7 w-7"
            fill="none"
            stroke="var(--color-accent-strong)"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path
              d="M5 12.5l4 4 10-10"
              style={{
                strokeDasharray: 30,
                strokeDashoffset: 30,
                animation: "draw-check 0.55s ease-out 0.32s forwards"
              }}
            />
          </svg>
        </div>
      </div>

      <div
        className="mt-5 text-center"
        style={{ animation: "fade-up 520ms ease-out 0.6s both" }}
      >
        <h3 className="text-[16px] font-semibold tracking-tight text-[var(--color-ink)]">
          All done.
        </h3>
        <p className="mt-1 text-[13px] text-[var(--color-ink-2)]">See you tomorrow.</p>
      </div>
    </div>
  );
}
