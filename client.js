/**
 * dsh-session-unread — browser half.
 *
 * Core's green dot means "a turn finished while you were looking at another
 * session, and you have not opened this one since". It is client-only state
 * (UiSession.completionUnread) and it is gone the moment you open the session.
 *
 * This plugin adds a second, user-owned marker on top of that:
 *
 *   - Session context menu: "标记为未读" / "取消未读标记".
 *   - A real StateDot (state="done", the same green dot core uses) rendered in
 *     the row's leading 16px cell while the row's own primary state is idle.
 *     When core has a higher-priority dot (running / approval / question /
 *     its own completion dot) the row replaces the seat, so the two never
 *     appear side by side.
 *   - Hover-card line "未读 · 点开后自动清除".
 *   - Opening the session (main view selection changes to it) clears it,
 *     matching the WeChat behavior; a page reload does not.
 *
 * Storage is browser-local (localStorage), keyed by Session id, so the mark
 * survives reloads, reconnect, and host restarts on the same origin.
 */

window.__ModuleLoader__.load({
  id: 'dsh-session-unread',
  factory(require) {
    const React = require('react')
    const primitives = require('@deepseek-ai/dsh-client-ui-primitives')
    const h = React.createElement

    /** Locale namespace owned by this plugin. */
    const NS = 'session-unread'
    /** localStorage key; the version suffix allows a future format change. */
    const STORAGE_KEY = 'dsh.session-unread.v1'
    /** A mark older than this is dropped during load. */
    const MAX_AGE_MS = 180 * 24 * 60 * 60 * 1000
    /** Hard cap so an abandoned profile cannot grow localStorage without bound. */
    const MAX_ENTRIES = 500

    const zh = {
      'menu.mark': '标记为未读',
      'menu.unmark': '取消未读标记',
      'row.unread': '未读',
      'hover.unread': '未读 · 点开后自动清除',
    }
    const en = {
      'menu.mark': 'Mark as unread',
      'menu.unmark': 'Clear unread mark',
      'row.unread': 'Unread',
      'hover.unread': 'Unread · clears when opened',
    }

    /** Keep only well-formed, recent entries, newest first up to MAX_ENTRIES. */
    function normalize(raw) {
      const now = Date.now()
      const entries = []
      for (const [id, at] of Object.entries(raw && typeof raw === 'object' ? raw : {})) {
        if (typeof id !== 'string' || id === '') continue
        if (typeof at !== 'number' || !Number.isFinite(at)) continue
        if (now - at > MAX_AGE_MS) continue
        entries.push([id, at])
      }
      entries.sort((a, b) => b[1] - a[1])
      return Object.fromEntries(entries.slice(0, MAX_ENTRIES))
    }

    function readStorage() {
      try {
        const raw = globalThis.localStorage?.getItem(STORAGE_KEY)
        if (raw == null || raw === '') return {}
        return normalize(JSON.parse(raw))
      } catch (_error) {
        return {}
      }
    }

    function writeStorage(value) {
      try {
        globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(value))
      } catch (_error) {
        /* Private mode / quota: the in-memory mark still works for this page. */
      }
    }

    /** Tiny observable map: Session id -> marked-at epoch ms. */
    function createUnreadStore() {
      const listeners = new Set()
      let snapshot = Object.freeze(readStorage())
      const emit = () => {
        for (const listener of [...listeners]) listener()
      }
      const commit = (next) => {
        snapshot = Object.freeze(next)
        writeStorage(snapshot)
        emit()
      }
      return {
        getSnapshot: () => snapshot,
        subscribe: (listener) => {
          listeners.add(listener)
          return () => { listeners.delete(listener) }
        },
        has: (id) => Object.prototype.hasOwnProperty.call(snapshot, id),
        mark: (id) => {
          if (typeof id !== 'string' || id === '') return
          commit(normalize({ ...snapshot, [id]: Date.now() }))
        },
        clear: (id) => {
          if (!Object.prototype.hasOwnProperty.call(snapshot, id)) return
          const next = { ...snapshot }
          delete next[id]
          commit(next)
        },
        refresh: () => {
          snapshot = Object.freeze(readStorage())
          emit()
        },
      }
    }

    const FallbackDot = ({ size = 10 }) => h('span', {
      'aria-hidden': 'true',
      style: {
        display: 'inline-block',
        width: size,
        height: size,
        borderRadius: '50%',
        backgroundColor: 'var(--dsw-alias-state-success-primary)',
      },
    })

    /** Same primitive the sidebar uses for its own "done" dot. */
    const GreenDot = (props) => (typeof primitives.StateDot === 'function'
      ? h(primitives.StateDot, { state: 'done', ...props })
      : h(FallbackDot, props))

    /** Row-leading dot; the seat only renders while the row's primary state is idle. */
    function UnreadRowDot({ sessionId, t }) {
      const marked = React.useSyncExternalStore(
        store.subscribe,
        () => store.has(sessionId),
      )
      if (!marked) return null
      const label = typeof t === 'function' ? t('row.unread') : '未读'
      return h('span', {
        role: 'img',
        'aria-label': label,
        title: label,
        style: { display: 'inline-flex', alignItems: 'center', justifyContent: 'center' },
      }, h(GreenDot))
    }

    /** Hover-card line, so the dot has an explanation that core's status does not own. */
    function UnreadRowHover({ sessionId, t }) {
      const marked = React.useSyncExternalStore(
        store.subscribe,
        () => store.has(sessionId),
      )
      if (!marked) return null
      return h('div', {
        style: {
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          fontSize: '12px',
          lineHeight: '18px',
          color: 'var(--dsw-alias-label-secondary)',
        },
      }, h(GreenDot), h('span', null, typeof t === 'function' ? t('hover.unread') : '未读'))
    }

    function apply(ctx) {
      ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'session-unread: dictionaries')

      /** Current main-view session id, exactly the derivation WorkspaceBrowser uses. */
      const currentSessionId = (list) => {
        for (const row of Object.values(list.byId)) {
          if ((row.retainedBy?.mainView ?? 0) > 0) return row.id
        }
        return undefined
      }

      /** Archived rows hold a blank leading cell, so a mark there would be invisible. */
      const isArchived = (sessionId) => {
        try {
          return ctx.workspaces.list.getSnapshot().archivedSessionIds.includes(sessionId)
        } catch (_error) {
          return false
        }
      }

      /* Opening a marked session clears it; marking the session that is already
         open does not, because no selection transition happens. */
      let previousCurrent
      const syncOpen = () => {
        const next = currentSessionId(ctx.sessions.list.getSnapshot())
        if (next !== undefined && next !== previousCurrent && store.has(next)) store.clear(next)
        previousCurrent = next
      }
      ctx.effect(() => {
        const dispose = ctx.sessions.list.subscribe(syncOpen)
        syncOpen()
        return dispose
      }, 'session-unread: clear on open')

      /* Another tab's mark arrives through the storage event. */
      ctx.effect(() => {
        if (typeof window === 'undefined') return
        const onStorage = (event) => {
          if (event.key === STORAGE_KEY) store.refresh()
        }
        window.addEventListener('storage', onStorage)
        return () => { window.removeEventListener('storage', onStorage) }
      }, 'session-unread: cross-tab sync')

      /* Structured Session context-menu contribution. Built-in actions use the
         same service, so this lands in the native menu between Fork and Copy
         Session ID, with the rest of the menu's keyboard handling. */
      ctx.effect(() => ctx.contextMenus.register({
        id: 'session-unread.toggle',
        target: 'session',
        order: 350,
        observe: () => [store],
        resolve: ({ sessionId }) => {
          if (isArchived(sessionId)) return []
          const marked = store.has(sessionId)
          const t = ctx.locale.bind(NS)
          return [{
            id: marked ? 'session-unread.clear' : 'session-unread.mark',
            label: t(marked ? 'menu.unmark' : 'menu.mark'),
            icon: { key: 'session-unread.dot' },
            run: () => {
              if (marked) store.clear(sessionId)
              else store.mark(sessionId)
            },
          }]
        },
      }), 'session-unread: menu action')

      /* Menu glyph: the same green "done" dot, at menu-icon size. */
      ctx.slots.inject('contextMenu.icon', () => {
        const unregister = ctx.slots.register({
          name: 'contextMenu.icon',
          key: 'session-unread.dot',
        }, () => h(GreenDot, { size: 12 }))
        return () => { unregister() }
      })

      /* Row decoration. The seat never renders beside a core status dot, so
         this is additive and cannot double-mark a row. */
      ctx.slots.inject('sidebar.session.row.leading', () => {
        const unregister = ctx.slots.register({
          name: 'sidebar.session.row.leading',
          id: 'session-unread-dot',
          order: 40,
          locale: NS,
        }, UnreadRowDot)
        return () => { unregister() }
      })

      ctx.slots.inject('sidebar.session.row.hover', () => {
        const unregister = ctx.slots.register({
          name: 'sidebar.session.row.hover',
          id: 'session-unread-hover',
          order: 40,
          locale: NS,
        }, UnreadRowHover)
        return () => { unregister() }
      })
    }

    const store = createUnreadStore()

    return {
      name: 'dsh-session-unread',
      inject: ['slots', 'locale', 'sessions', 'contextMenus', 'workspaces'],
      apply,
    }
  },
})
