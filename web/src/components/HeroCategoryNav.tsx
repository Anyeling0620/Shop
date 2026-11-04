'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { useRouter } from 'next/navigation';
import type { Category } from '@/modules/catalog/types';

/**
 * 首页海报区左侧的一级分类栏：像「省/市/区」那样逐级向右展开。
 *
 * - 悬停一级分类 → 在它**右边缘**外展开第一列子分类（不会压住被悬停的那一项）。
 * - 悬停子分类且它还有下级 → 在**该列右侧**再展开一列，一列一级。
 * - 每列顶部有当前层级名（「图书」「少儿」……），用户知道自己在第几级。
 *
 * 与顶部 CategoryNav 完全独立：那边是「正下方弹出」，这里是「右侧横向级联」，
 * 样式（hero-cats* / cat-panel*）与状态都不共享，改动时不要互相牵连。
 *
 * 行内三种形态：
 * - 已确定是叶子 → <Link> 直接跳 /search?category=<名字>（同页客户端跳转）。
 * - 已确定有下级 → <button>，点击就地展开，绝不会误跳走。
 * - 还没判定完 → <button data-pending>，灰字 + 省略号，点击时先取子级再决定展开或跳转。
 */

/** 同时最多 6 个 /api/categories/children 请求，避免一列 10 个子类把接口打爆。 */
const MAX_CONCURRENT_FETCHES = 6;
/** 列展开后等 140ms 再预取下一级：快速扫过时不会连发请求。 */
const PREFETCH_DEBOUNCE_MS = 140;
/** 移出面板后延迟关闭，给「从分类项移到面板」留出通行时间。 */
const CLOSE_DELAY_MS = 200;
const VIEWPORT_MARGIN = 8;
const MIN_PANEL_HEIGHT = 120;
const MAX_PANEL_HEIGHT = 560;

const CHEVRON = '\u203a';
const ELLIPSIS = '\u2026';
const LABEL_PANEL = '\u5206\u7c7b';
const LABEL_LOADING = '\u52a0\u8f7d\u4e2d\u2026';
const LABEL_NO_CHILD = '\u6682\u65e0\u5b50\u5206\u7c7b';

/** 叶子分类：后端 ES 只索引叶子类目名，按名字搜才有结果。 */
const leafHref = (name: string) => `/search?category=${encodeURIComponent(name)}`;

interface PanelPos {
  left: number;
  top: number;
  maxHeight: number;
  /** right = 贴在分类项右边缘（默认）；left = 右侧放不下时翻到左侧。 */
  placement: 'right' | 'left';
}

/**
 * 按需取子分类：会话内缓存 + inflight 去重。
 * 失败返回 null 且**不写缓存**——否则一次网络抖动会把父分类永久降级成叶子。
 */
function useChildrenLoader() {
  const cache = useRef<Map<number, Category[]>>(new Map());
  const inflight = useRef<Map<number, Promise<Category[] | null>>>(new Map());

  return useCallback(async (parentId: number): Promise<Category[] | null> => {
    const cached = cache.current.get(parentId);
    if (cached) return cached;

    const pending = inflight.current.get(parentId);
    if (pending) return pending;

    const task = (async () => {
      try {
        const res = await fetch(`/api/categories/children?parentId=${parentId}`);
        if (!res.ok) return null;
        const data = (await res.json()) as Category[];
        if (!Array.isArray(data)) return null;
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

export function HeroCategoryNav({ categories }: { categories: Category[] }) {
  const router = useRouter();
  const load = useChildrenLoader();

  /** 展开路径：path[0] 是被悬停的一级分类，path[i] 是第 i 级展开的节点。 */
  const [path, setPath] = useState<Category[]>([]);
  /** 已知子级；空数组 = 已确定是叶子。 */
  const [childrenMap, setChildrenMap] = useState<Record<number, Category[]>>({});
  /** childrenMap 的权威副本，只在异步回调里写，渲染期不产生副作用。 */
  const childrenMapRef = useRef<Record<number, Category[]>>({});
  /** 预取过一次的 id，防止预取 effect 反复重试。 */
  const attempted = useRef<Set<number>>(new Set());
  /** 正在请求中的 id，用于渲染 pending 态。 */
  const [pendingIds, setPendingIds] = useState<Record<number, true>>({});
  const [panelPos, setPanelPos] = useState<PanelPos | null>(null);

  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerEls = useRef<Record<number, HTMLButtonElement | null>>({});

  /** 并发闸：信号量 + 等待队列。 */
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

  const scheduleClose = useCallback(() => {
    cancelClose();
    closeTimer.current = setTimeout(() => setPath([]), CLOSE_DELAY_MS);
  }, [cancelClose]);

  const closePanel = useCallback(() => {
    cancelClose();
    setPath([]);
  }, [cancelClose]);

  const ensureChildren = useCallback(
    async (id: number): Promise<Category[] | null> => {
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
   * 某列一展开，就把这一列所有子项的下一级预取回来，
   * 让每行立刻长成正确形态（可跳转的 <Link> / 可继续展开的父级）。
   *
   * path 只在真的展开了更深一级时才变长，所以这里永远只预取「用户已经走到的那层」，
   * 21 个一级分类不会在首屏被一次性拉满。
   */
  useEffect(() => {
    if (!open) return;
    const knownMap = { ...childrenMapRef.current, ...childrenMap };
    const todo: number[] = [];
    for (const node of path) {
      const items = knownMap[node.id];
      if (items === undefined) continue;
      for (const child of items) {
        if (knownMap[child.id] !== undefined) continue;
        if (attempted.current.has(child.id)) continue;
        todo.push(child.id);
      }
    }
    if (todo.length === 0) return;

    // 指针快速扫过若干一级分类时，面板会连续开关；debounce 把这段抖动折成 0 请求。
    const timer = setTimeout(() => {
      for (const id of todo) void ensureChildren(id);
    }, PREFETCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [open, path, childrenMap, ensureChildren]);

  const isKnown = (item: Category) => childrenMap[item.id] !== undefined;
  const isLeaf = (item: Category) => childrenMap[item.id]?.length === 0;
  const isPending = (item: Category) => !isKnown(item) && pendingIds[item.id] === true;

  /** 悬停一级分类：右边缘外展开它的子分类。 */
  const hoverTop = (item: Category) => {
    cancelClose();
    if (path[0]?.id === item.id) return;
    setPath([item]);
    if (!isKnown(item) && !isLeaf(item)) {
      void ensureChildren(item.id).then((kids) => {
        // 乐观展开后才发现是叶子：收掉空面板
        if (kids && kids.length === 0) {
          setPath((prev) => (prev[0]?.id === item.id ? [] : prev));
        }
      });
    }
  };

  /** 悬停子分类：在该列右侧再展开一列；叶子则把更深的列收掉。 */
  const hoverChild = (depth: number, item: Category) => {
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
   * 点击尚未判定完成的行：先取子级，有子级就地展开，没有就同页跳转。
   * 用户永远不会点到一个「点了没反应」的项。
   */
  const activateChild = async (depth: number, item: Category) => {
    cancelClose();
    const kids = await ensureChildren(item.id);
    if (kids === null || kids.length === 0) {
      closePanel();
      if (kids === null) {
        router.push(`/search?categoryId=${item.id}&category=${encodeURIComponent(item.name)}`);
        return;
      }
      router.push(leafHref(item.name));
      return;
    }
    setPath((prev) =>
      prev[depth + 1]?.id === item.id
        ? prev.slice(0, depth + 1)
        : prev.slice(0, depth + 1).concat(item),
    );
  };

  /**
   * 定位：默认贴分类项右边缘、顶部对齐该项顶部。
   * 右侧放不下就整体翻到该项左侧；上下超出视口就收进视口并限高内部滚动。
   *
   * 用 position: fixed 是因为 .hero__cats 是 overflow-y: auto 的滚动容器，
   * absolute 会被它裁掉。已确认 .hero / .container 祖先链上没有
   * transform / filter / will-change / contain，fixed 不会退化成相对该祖先定位。
   */
  const reposition = useCallback(() => {
    const panel = panelRef.current;
    const top = path[0];
    if (!panel || !top) return;
    const anchor = triggerEls.current[top.id];
    if (!anchor) return;

    const rect = anchor.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const width = panel.offsetWidth || 204;
    const maxHeight = Math.max(
      MIN_PANEL_HEIGHT,
      Math.min(MAX_PANEL_HEIGHT, vh - VIEWPORT_MARGIN * 2),
    );
    const height = Math.min(panel.offsetHeight || MIN_PANEL_HEIGHT, maxHeight);

    let placement: PanelPos['placement'] = 'right';
    let left = rect.right;
    if (left + width + VIEWPORT_MARGIN > vw) {
      const flipped = rect.left - width;
      if (flipped >= VIEWPORT_MARGIN) {
        left = flipped;
        placement = 'left';
      } else {
        // 左右都放不下（窄屏）：整体推进视口内，至少保证点得到
        left = Math.max(VIEWPORT_MARGIN, vw - width - VIEWPORT_MARGIN);
      }
    }

    let topPos = rect.top;
    if (topPos + height + VIEWPORT_MARGIN > vh) {
      topPos = Math.max(VIEWPORT_MARGIN, vh - height - VIEWPORT_MARGIN);
    }
    if (topPos < VIEWPORT_MARGIN) topPos = VIEWPORT_MARGIN;

    setPanelPos((prev) =>
      prev &&
      prev.left === left &&
      prev.top === topPos &&
      prev.maxHeight === maxHeight &&
      prev.placement === placement
        ? prev
        : { left, top: topPos, maxHeight, placement },
    );
  }, [path]);

  useEffect(() => {
    if (!open) {
      setPanelPos(null);
      return;
    }
    reposition();
    const onViewportChange = () => reposition();
    window.addEventListener('resize', onViewportChange);
    // 页面滚动会让锚点位移，fixed 面板必须跟着重算
    document.addEventListener('scroll', onViewportChange, true);
    return () => {
      window.removeEventListener('resize', onViewportChange);
      document.removeEventListener('scroll', onViewportChange, true);
    };
  }, [open, path, childrenMap, reposition]);

  // 点击分类栏外部关闭
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) closePanel();
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open, closePanel]);

  useEffect(() => () => cancelClose(), [cancelClose]);

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Escape' || !open) return;
    event.stopPropagation();
    const topId = path[0]?.id;
    closePanel();
    if (topId !== undefined) triggerEls.current[topId]?.focus();
  };

  const renderRow = (depth: number, item: Category) => {
    const active = path[depth + 1]?.id === item.id;

    if (isLeaf(item)) {
      return (
        <li key={item.id} className="hero-cats__row">
          <Link
            className="hero-cats__link"
            href={leafHref(item.name)}
            data-leaf="true"
            onClick={closePanel}
            onMouseEnter={() => hoverChild(depth, item)}
          >
            <span>{item.name}</span>
          </Link>
        </li>
      );
    }

    if (isKnown(item)) {
      return (
        <li key={item.id} className="hero-cats__row">
          <button
            type="button"
            className="hero-cats__link"
            data-active={active}
            aria-haspopup="true"
            aria-expanded={active}
            onMouseEnter={() => hoverChild(depth, item)}
            onFocus={() => hoverChild(depth, item)}
            onClick={() => void activateChild(depth, item)}
          >
            <span>{item.name}</span>
            <span aria-hidden="true" className="hero-cats__arrow">
              {CHEVRON}
            </span>
          </button>
        </li>
      );
    }

    // 未判定：灰字 + 省略号，与可跳转项明显不同；点击会先判定再决定动作
    const pending = isPending(item);
    return (
      <li key={item.id} className="hero-cats__row">
        <button
          type="button"
          className="hero-cats__link"
          data-pending="true"
          aria-busy={pending}
          aria-label={`${item.name}\uFF0C${LABEL_LOADING}`}
          onMouseEnter={() => hoverChild(depth, item)}
          onFocus={() => hoverChild(depth, item)}
          onClick={() => void activateChild(depth, item)}
        >
          <span>{item.name}</span>
          <span aria-hidden="true" className="hero-cats__arrow">
            {pending ? ELLIPSIS : CHEVRON}
          </span>
        </button>
      </li>
    );
  };

  return (
    <div ref={rootRef} className="hero-cats" onKeyDown={handleKeyDown}>
      {categories.map((top) => {
        const expanded = path[0]?.id === top.id;
        return (
          <div
            key={top.id}
            className="hero-cats__term"
            onMouseEnter={() => hoverTop(top)}
            onMouseLeave={scheduleClose}
          >
            {/*
              一级分类刻意做成无 href 的 button：点击不跳转、也不触发任何动作，
              只靠悬停向右展开子分类。原生导航因此不可能发生。
            */}
            <button
              type="button"
              ref={(el) => {
                triggerEls.current[top.id] = el;
              }}
              className="hero-cats__item"
              data-active={expanded}
              aria-haspopup={isLeaf(top) ? undefined : 'true'}
              aria-expanded={isLeaf(top) ? undefined : expanded}
              onFocus={() => hoverTop(top)}
              onClick={(event) => event.preventDefault()}
            >
              <span>{top.name}</span>
              <span aria-hidden="true" className="hero-cats__caret">
                {CHEVRON}
              </span>
            </button>
          </div>
        );
      })}

      {open && (
        <div
          ref={panelRef}
          className="hero-cats__flyout"
          data-placement={panelPos?.placement ?? 'right'}
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
              <div key={node.id} className="hero-cats__col" data-depth={depth}>
                <div className="hero-cats__title">{node.name}</div>
                {items === undefined ? (
                  <div className="hero-cats__hint">{LABEL_LOADING}</div>
                ) : items.length === 0 ? (
                  <div className="hero-cats__hint">{LABEL_NO_CHILD}</div>
                ) : (
                  <ul className="hero-cats__list">{items.map((item) => renderRow(depth, item))}</ul>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
