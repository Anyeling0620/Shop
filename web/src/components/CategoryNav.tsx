'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { useRouter } from 'next/navigation';
import type { Category } from '@/modules/catalog/types';

/**
 * Header top-level category navigation: hover a category and its subcategories
 * drop down directly beneath the trigger.
 *
 * - The trigger is a real <Link> to `/search?category=<name>`, so clicking a
 *   parent category means "browse all goods of this parent" and stays a
 *   same-tab client-side transition.
 * - The panel is one column anchored at the trigger's bottom-left. A child row
 *   that still has children opens the next column to its RIGHT on hover, level
 *   by level. (Province/city/district cascading belongs to the home sidebar,
 *   not here.)
 * - Only a leaf row is a <Link>; a row with children is a <button>, so clicking
 *   it can never reload the page. Pending rows look distinct until resolved.
 */

type CategoryItem = Category;

/**
 * Lazily load children, with an in-session cache so we never refetch.
 * Returns null when the request failed: a failure must stay "unknown" instead
 * of being cached as "no children", otherwise a transient error would turn a
 * parent category into a navigable leaf.
 */
function useChildrenLoader() {
  const cache = useRef<Map<number, CategoryItem[]>>(new Map());
  const inflight = useRef<Map<number, Promise<CategoryItem[] | null>>>(new Map());

  return useCallback(async (parentId: number): Promise<CategoryItem[] | null> => {
    const cached = cache.current.get(parentId);
    if (cached) return cached;

    const pending = inflight.current.get(parentId);
    if (pending) return pending;

    const task = (async () => {
      try {
        const res = await fetch(`/api/categories/children?parentId=${parentId}`);
        if (!res.ok) return null;
        const data = (await res.json()) as CategoryItem[];
        cache.current.set(parentId, data);
        return data;
      } catch {
        return null;
      } finally {
        inflight.current.delete(parentId);
      }
    })();

    inflight.current.set(parentId, task);
    return task;
  }, []);
}

const searchHref = (name: string) => `/search?category=${encodeURIComponent(name)}`;

/** Add the U+203A chevron without hardcoding multibyte literals in source. */
const CHEVRON = '\u203a';
const LABEL_ALL = '\u5168\u90e8';
const LABEL_LOADING = '\u52a0\u8f7d\u4e2d\u2026';
const LABEL_NO_CHILD = '\u6682\u65e0\u5b50\u5206\u7c7b';
const LABEL_PANEL = '\u5206\u7c7b';
/** Shown on a row whose leaf/parent state is not resolved yet. */
const ELLIPSIS = '\u2026';

/** Cap simultaneous child fetches so one wide column cannot flood the API. */
const MAX_CONCURRENT_FETCHES = 6;

/** Panel height bounds: prefer scrolling inside over running off screen. */
const MIN_PANEL_HEIGHT = 120;
const MAX_PANEL_HEIGHT = 520;

interface PanelPos {
  left: number;
  top: number;
  maxHeight: number;
  /** bottom = under the trigger (normal); top = flipped up near the viewport bottom. */
  placement: 'bottom' | 'top';
}

export function CategoryNav({ categories }: { categories: CategoryItem[] }) {
  const router = useRouter();
  const load = useChildrenLoader();

  /** Open path: path[0] is the top category, path[i] the expanded node at depth i. */
  const [path, setPath] = useState<CategoryItem[]>([]);
  /** Known children per category id. An empty array means "this is a leaf". */
  const [childrenMap, setChildrenMap] = useState<Record<number, CategoryItem[]>>({});
  /**
   * Authoritative copy of childrenMap, written only from async callbacks so a
   * render never has a side effect. State exists purely to trigger re-renders.
   */
  const childrenMapRef = useRef<Record<number, CategoryItem[]>>({});
  /** Ids already queried once; stops the prefetch effect from retry-looping. */
  const attempted = useRef<Set<number>>(new Set());

  const [panelPos, setPanelPos] = useState<PanelPos | null>(null);

  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const triggerEls = useRef<Record<number, HTMLAnchorElement | null>>({});
  const rootRef = useRef<HTMLDivElement | null>(null);

  /** Ids whose children are being fetched right now (dedupe across renders). */
  const [pendingIds, setPendingIds] = useState<Record<number, true>>({});

  /**
   * Simple gate: at most MAX_CONCURRENT_FETCHES /api/categories/children
   * requests in flight. A queue of waiters is drained as slots free up.
   * The loader itself also caches + dedupes by parentId, so this only has to
   * bound the burst that a wide column would otherwise cause.
   */
  const activeFetches = useRef(0);
  const waiters = useRef<Array<() => void>>([]);

  const acquireSlot = useCallback(async () => {
    if (activeFetches.current < MAX_CONCURRENT_FETCHES) {
      activeFetches.current += 1;
      return;
    }
    await new Promise<void>((resolve) => waiters.current.push(resolve));
  }, []);

  const releaseSlot = useCallback(() => {
    const next = waiters.current.shift();
    // Hand the slot straight to the next waiter; otherwise free it.
    if (next) next();
    else activeFetches.current = Math.max(0, activeFetches.current - 1);
  }, []);

  const open = path.length > 0;

  const cancelClose = useCallback(() => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }, []);

  // Small delay so moving the pointer from the trigger into the panel
  // does not close it mid-flight.
  const scheduleClose = useCallback(() => {
    cancelClose();
    closeTimer.current = setTimeout(() => setPath([]), 200);
  }, [cancelClose]);

  const closePanel = useCallback(() => {
    cancelClose();
    setPath([]);
  }, [cancelClose]);

  const ensureChildren = useCallback(
    async (id: number): Promise<CategoryItem[] | null> => {
      // Already resolved (including a known-empty array): nothing to do.
      const known = childrenMapRef.current[id];
      if (known) return known;

      setPendingIds((prev) => (prev[id] ? prev : { ...prev, [id]: true }));
      attempted.current.add(id);
      await acquireSlot();
      try {
        const kids = await load(id);
        if (kids === null) return null;
        if (childrenMapRef.current[id] === undefined) {
          childrenMapRef.current = { ...childrenMapRef.current, [id]: kids };
        }
        setChildrenMap((prev) => (prev[id] ? prev : { ...prev, [id]: kids }));
        return childrenMapRef.current[id];
      } finally {
        releaseSlot();
        setPendingIds((prev) => {
          if (!prev[id]) return prev;
          const next = { ...prev };
          delete next[id];
          return next;
        });
      }
    },
    [acquireSlot, load, releaseSlot],
  );

  /**
   * Resolve every row of the columns that are on screen, so each row renders as
   * a real <Link> or a real parent <button> immediately instead of every row
   * looking like an identical button until hovered.
   *
   * `path` grows one level when a column opens, so this runs per opened column
   * and never prefetches levels the user has not reached (top-level categories
   * are 21, so eager loading everything would be a burst of requests).
   */
  useEffect(() => {
    if (!open) return;
    const knownMap = { ...childrenMapRef.current, ...childrenMap };
    const todo: number[] = [];
    for (const node of path) {
      const items = knownMap[node.id];
      if (items === undefined) continue;
      for (const child of items) {
        // Known answer or an already-attempted id: never refetch in a loop.
        if (knownMap[child.id] !== undefined) continue;
        if (attempted.current.has(child.id)) continue;
        todo.push(child.id);
      }
    }
    if (todo.length === 0) return;

    // Short debounce: sweeping the pointer across top categories opens and
    // closes panels in quick succession. Only the panel the user actually
    // settles on pays for resolving its rows; the 6-way gate bound whatever
    // does fire. Clearing on path change turns a fast sweep into 0 requests.
    const timer = setTimeout(() => {
      for (const id of todo) void ensureChildren(id);
    }, 140);
    return () => clearTimeout(timer);
    // childrenMap is a dependency so a column resolves its rows as soon as its
    // own list arrives; `attempted` keeps that from refetching anything.
  }, [open, path, childrenMap, ensureChildren]);

  const isKnown = (item: CategoryItem) => childrenMap[item.id] !== undefined;
  const isLeaf = (item: CategoryItem) => childrenMap[item.id]?.length === 0;
  const isPending = (item: CategoryItem) => !isKnown(item) && pendingIds[item.id] === true;

  /**
   * Hover a top category: drop its subcategories right under the trigger.
   * A category already known to be a leaf has nothing to show, so it closes
   * whatever panel is open instead of leaving a stale one behind.
   */
  const hoverTop = (item: CategoryItem) => {
    cancelClose();
    if (isKnown(item) && isLeaf(item)) {
      closePanel();
      return;
    }
    if (path[0]?.id === item.id) return;
    setPath([item]);
    if (!isKnown(item)) {
      void ensureChildren(item.id).then((kids) => {
        // Discovered a leaf after opening optimistically: drop the empty panel.
        if (kids && kids.length === 0) setPath((prev) => (prev[0]?.id === item.id ? [] : prev));
      });
    }
  };

  /**
   * Hover a child row: open the next column to its right. Hovering a leaf row
   * closes any deeper column, so a stale branch never hangs to the right.
   */
  const hoverChild = (depth: number, item: CategoryItem) => {
    cancelClose();
    if (isKnown(item) && isLeaf(item)) {
      setPath((prev) => (prev.length > depth + 1 ? prev.slice(0, depth + 1) : prev));
      return;
    }
    if (path[depth + 1]?.id === item.id) return;
    setPath((prev) => prev.slice(0, depth + 1).concat(item));
    if (!isKnown(item)) {
      void ensureChildren(item.id).then((kids) => {
        if (kids && kids.length === 0) {
          setPath((prev) => (prev[depth + 1]?.id === item.id ? prev.slice(0, depth + 1) : prev));
        }
      });
    }
  };

  /**
   * Click a child row: expand/collapse its column, or navigate when it is a
   * leaf. A row that has not been resolved yet is resolved right here and then
   * acts on the answer, so a fast click can never leave the user stuck.
   */
  const activateChild = async (depth: number, item: CategoryItem) => {
    cancelClose();
    const kids = await ensureChildren(item.id);
    if (kids && kids.length === 0) {
      closePanel();
      router.push(searchHref(item.name));
      return;
    }
    if (kids === null) {
      // Could not resolve: fall back to browsing the category rather than nothing.
      closePanel();
      router.push(searchHref(item.name));
      return;
    }
    setPath((prev) =>
      prev[depth + 1]?.id === item.id ? prev.slice(0, depth + 1) : prev.slice(0, depth + 1).concat(item),
    );
  };

  /**
   * Anchor the panel at the trigger's bottom-left. It stays `position: fixed`
   * because .category-nav is a horizontal scroll container and would clip an
   * absolutely placed panel. When the trigger sits near the right edge the whole
   * panel slides left; when it sits near the bottom it flips above, and if
   * neither side fits it is height-capped and scrolls internally.
   */
  const reposition = useCallback(() => {
    const panel = panelRef.current;
    const anchor = panel?.parentElement as HTMLElement | null;
    if (!panel || !anchor) return;

    const rect = anchor.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const margin = 8;

    const width = panel.offsetWidth || 208;

    // Left edge of the trigger: the panel hangs from the trigger, not its right.
    let left = rect.left;
    if (left + width + margin > vw) left = Math.max(margin, vw - width - margin);

    const below = vh - rect.bottom - margin;
    const above = rect.top - margin;
    const placement: PanelPos['placement'] =
      below < MIN_PANEL_HEIGHT && above > below ? 'top' : 'bottom';
    const room = placement === 'top' ? above : below;
    const maxHeight = Math.max(MIN_PANEL_HEIGHT, Math.min(MAX_PANEL_HEIGHT, room));
    const height = Math.min(panel.offsetHeight || maxHeight, maxHeight);
    const top = placement === 'top' ? Math.max(margin, rect.top - height) : rect.bottom;

    setPanelPos((prev) =>
      prev &&
      prev.left === left &&
      prev.top === top &&
      prev.maxHeight === maxHeight &&
      prev.placement === placement
        ? prev
        : { left, top, maxHeight, placement },
    );
  }, []);

  useEffect(() => {
    if (!open) {
      setPanelPos(null);
      return;
    }
    reposition();
    const onViewportChange = () => reposition();
    window.addEventListener('resize', onViewportChange);
    document.addEventListener('scroll', onViewportChange, true);
    return () => {
      window.removeEventListener('resize', onViewportChange);
      document.removeEventListener('scroll', onViewportChange, true);
    };
  }, [open, path, childrenMap, reposition]);

  // Close when clicking anywhere outside the nav (the panel lives inside it).
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) closePanel();
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open, closePanel]);

  // Clear the pending close timer on unmount.
  useEffect(() => () => cancelClose(), [cancelClose]);

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Escape' || !open) return;
    event.stopPropagation();
    const topId = path[0]?.id;
    closePanel();
    if (topId !== undefined) triggerEls.current[topId]?.focus();
  };

  const renderChildRow = (depth: number, item: CategoryItem) => {
    const active = path[depth + 1]?.id === item.id;

    // Known leaf: a real link, client-side transition, same tab.
    if (isLeaf(item)) {
      return (
        <li key={item.id} className="cat-panel__row">
          <Link
            className="cat-panel__item"
            href={searchHref(item.name)}
            data-leaf="true"
            onClick={closePanel}
            onMouseEnter={() => hoverChild(depth, item)}
          >
            <span>{item.name}</span>
          </Link>
        </li>
      );
    }

    // Known parent: expandable button. A link here would navigate away from a
    // column the hover just opened, which is a hostile pairing.
    if (isKnown(item)) {
      return (
        <li key={item.id} className="cat-panel__row">
          <button
            type="button"
            className="cat-panel__item"
            data-active={active}
            aria-haspopup="true"
            aria-expanded={active}
            onMouseEnter={() => hoverChild(depth, item)}
            onFocus={() => hoverChild(depth, item)}
            onClick={() => void activateChild(depth, item)}
          >
            <span>{item.name}</span>
            <span aria-hidden="true" className="cat-panel__arrow">
              {CHEVRON}
            </span>
          </button>
        </li>
      );
    }

    // State not resolved yet. Deliberately looks different from a jumpable row
    // (muted, ellipsis) so the user is never told "this navigates" wrongly.
    // Clicking still resolves it and then either expands or navigates.
    const pending = isPending(item);
    return (
      <li key={item.id} className="cat-panel__row">
        <button
          type="button"
          className="cat-panel__item"
          data-pending="true"
          aria-busy={pending}
          aria-label={`${item.name}\uFF0C${LABEL_LOADING}`}
          onMouseEnter={() => hoverChild(depth, item)}
          onFocus={() => hoverChild(depth, item)}
          onClick={() => void activateChild(depth, item)}
        >
          <span>{item.name}</span>
          <span aria-hidden="true" className="cat-panel__arrow">
            {ELLIPSIS}
          </span>
        </button>
      </li>
    );
  };

  return (
    <div ref={rootRef} className="category-nav__root" onKeyDown={handleKeyDown}>
      <Link className="category-nav__link category-nav__link--active" href="/goods">
        {LABEL_ALL}
      </Link>

      {categories.map((top) => {
        const expanded = path[0]?.id === top.id;
        // Unknown counts as "may have children": do not promise aria-expanded
        // on a category we already know is a leaf.
        const hasChildren = !isLeaf(top);

        return (
          <div
            key={top.id}
            className="category-nav__item"
            onMouseEnter={() => hoverTop(top)}
            onMouseLeave={scheduleClose}
          >
            <Link
              ref={(el) => {
                triggerEls.current[top.id] = el;
              }}
              className="category-nav__link"
              href={searchHref(top.name)}
              aria-haspopup={hasChildren ? 'true' : undefined}
              aria-expanded={hasChildren ? expanded : undefined}
              onFocus={() => hoverTop(top)}
              onClick={closePanel}
            >
              {top.name}
            </Link>

            {expanded && (
              <div
                ref={panelRef}
                className="cat-panel"
                data-placement={panelPos?.placement ?? 'bottom'}
                role="group"
                aria-label={LABEL_PANEL}
                style={{
                  visibility: panelPos ? 'visible' : 'hidden',
                  left: panelPos?.left,
                  top: panelPos?.top,
                  maxHeight: panelPos?.maxHeight,
                }}
                onMouseEnter={cancelClose}
                onMouseLeave={scheduleClose}
              >
                {path.map((node, depth) => {
                  const items = childrenMap[node.id];
                  return (
                    <div key={node.id} className="cat-panel__col" data-depth={depth}>
                      {/* The trigger already names the first column, so its title
                          would only repeat it; deeper columns need the label. */}
                      {depth > 0 && <div className="cat-panel__title">{node.name}</div>}

                      {items === undefined ? (
                        <div className="cat-panel__hint">{LABEL_LOADING}</div>
                      ) : items.length === 0 ? (
                        <div className="cat-panel__hint">{LABEL_NO_CHILD}</div>
                      ) : (
                        <ul className="cat-panel__list">
                          {items.map((item) => renderChildRow(depth, item))}
                        </ul>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
