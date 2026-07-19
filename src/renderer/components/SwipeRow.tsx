import { useRef } from "react";
import { cn } from "~/lib/cn";
import { SWIPE, shouldCommitSwipe } from "../lib/swipe";

type SwipeSideAction = {
  /** Rendered in the revealed layer (icon + optional label). */
  content: React.ReactNode;
  /** Background classes for the revealed layer, e.g. "bg-[var(--color-accent)]". */
  className: string;
  onTrigger: () => void;
};

type Props = {
  /** Revealed when swiping RIGHT (sits on the left edge). */
  leftAction?: SwipeSideAction;
  /** Revealed when swiping LEFT (sits on the right edge). */
  rightAction?: SwipeSideAction;
  disabled?: boolean;
  /** Matches the child's rounding so the revealed layer's corners align. */
  className?: string;
  children: React.ReactNode;
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * iOS-style swipe-to-act wrapper: slides `children` horizontally over a
 * colored action layer. Touch pointers only — desktop keeps hover
 * affordances and is completely unaffected. All gesture state lives in
 * refs and is written straight to the DOM; nothing here triggers a
 * re-render per pointer move.
 */
export function SwipeRow({ leftAction, rightAction, disabled, className, children }: Props) {
  const outerRef = useRef<HTMLDivElement | null>(null);
  const sliderRef = useRef<HTMLDivElement | null>(null);
  const leftZoneRef = useRef<HTMLDivElement | null>(null);
  const rightZoneRef = useRef<HTMLDivElement | null>(null);

  // Gesture state — refs only, never React state (a re-render per move is jank).
  const activePointerId = useRef<number | null>(null);
  const dragging = useRef(false);
  const startX = useRef(0);
  const startY = useRef(0);
  const t0 = useRef(0);
  const lastDx = useRef(0);
  const suppressClick = useRef(false);
  const settleTimer = useRef<number | null>(null);

  function resetVisuals() {
    const slider = sliderRef.current;
    if (slider) {
      slider.style.transform = "";
      slider.style.transition = "";
    }
    outerRef.current?.removeAttribute("data-past-threshold");
    if (leftZoneRef.current) leftZoneRef.current.style.opacity = "";
    if (rightZoneRef.current) rightZoneRef.current.style.opacity = "";
  }

  function snapHome() {
    const slider = sliderRef.current;
    if (!slider) return;
    slider.style.transition = "transform 240ms var(--ease-drawer)";
    slider.style.transform = "translateX(0)";

    let settled = false;
    const settle = () => {
      if (settled) return;
      settled = true;
      slider.removeEventListener("transitionend", settle);
      if (settleTimer.current != null) {
        window.clearTimeout(settleTimer.current);
        settleTimer.current = null;
      }
      resetVisuals();
    };
    slider.addEventListener("transitionend", settle);
    settleTimer.current = window.setTimeout(settle, 250);
  }

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (e.pointerType !== "touch") return;
    if (disabled) return;
    if (activePointerId.current !== null) return; // multi-touch: ignore extra pointers
    activePointerId.current = e.pointerId;
    dragging.current = false;
    startX.current = e.clientX;
    startY.current = e.clientY;
    t0.current = e.timeStamp;
    lastDx.current = 0;
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (activePointerId.current !== e.pointerId) return;
    const dx0 = e.clientX - startX.current;
    const dy0 = e.clientY - startY.current;

    if (!dragging.current) {
      if (Math.abs(dy0) > SWIPE.intentPx) {
        // Vertical intent — abandon and let the page scroll.
        activePointerId.current = null;
        return;
      }
      if (Math.abs(dx0) > SWIPE.intentPx && Math.abs(dx0) > Math.abs(dy0)) {
        dragging.current = true;
        sliderRef.current?.setPointerCapture(e.pointerId);
      } else {
        return;
      }
    }

    const hasAction = dx0 > 0 ? !!leftAction : !!rightAction;
    const resisted = hasAction ? dx0 : dx0 / SWIPE.resistance;
    const dx = clamp(resisted, -SWIPE.maxPx, SWIPE.maxPx);
    lastDx.current = dx;

    const slider = sliderRef.current;
    if (slider) {
      slider.style.transition = "none";
      slider.style.transform = `translateX(${dx}px)`;
    }

    const outer = outerRef.current;
    if (outer) {
      if (Math.abs(dx) >= SWIPE.commitPx) outer.setAttribute("data-past-threshold", "true");
      else outer.removeAttribute("data-past-threshold");
    }

    if (leftZoneRef.current) leftZoneRef.current.style.opacity = dx > 0 ? "1" : "0";
    if (rightZoneRef.current) rightZoneRef.current.style.opacity = dx < 0 ? "1" : "0";
  }

  function onPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    if (activePointerId.current !== e.pointerId) return;
    const wasDragging = dragging.current;
    const dx = lastDx.current;
    const elapsed = e.timeStamp - t0.current;
    activePointerId.current = null;
    dragging.current = false;

    if (!wasDragging) return; // plain tap — let the underlying click fire

    suppressClick.current = true;
    const hasAction = dx > 0 ? !!leftAction : !!rightAction;
    if (hasAction && shouldCommitSwipe(dx, elapsed)) {
      if (dx > 0) leftAction?.onTrigger();
      else rightAction?.onTrigger();
    }
    snapHome();
  }

  function onPointerCancel(e: React.PointerEvent<HTMLDivElement>) {
    if (activePointerId.current !== e.pointerId) return;
    const wasDragging = dragging.current;
    activePointerId.current = null;
    dragging.current = false;
    if (wasDragging) {
      // iOS fires pointercancel when the system claims the gesture (e.g.
      // edge-swipe back) — never commit, always snap home.
      suppressClick.current = true;
      snapHome();
    }
  }

  function onClickCapture(e: React.MouseEvent<HTMLDivElement>) {
    if (suppressClick.current) {
      e.preventDefault();
      e.stopPropagation();
      suppressClick.current = false;
    }
  }

  return (
    <div
      ref={outerRef}
      className={cn("relative overflow-hidden", className)}
      onClickCapture={onClickCapture}
    >
      <div className="absolute inset-0 flex">
        {leftAction && (
          <div
            ref={leftZoneRef}
            className={cn(
              "flex flex-1 items-center justify-start px-5 opacity-0",
              leftAction.className
            )}
          >
            <span className="swipe-action-icon">{leftAction.content}</span>
          </div>
        )}
        {rightAction && (
          <div
            ref={rightZoneRef}
            className={cn(
              "ml-auto flex flex-1 items-center justify-end px-5 opacity-0",
              rightAction.className
            )}
          >
            <span className="swipe-action-icon">{rightAction.content}</span>
          </div>
        )}
      </div>
      <div
        ref={sliderRef}
        className="swipe-slider relative"
        style={{ touchAction: "pan-y" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
      >
        {children}
      </div>
    </div>
  );
}
