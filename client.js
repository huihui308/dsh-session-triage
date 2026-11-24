/**
 * dsh-session-unread — browser half.
 *
 * Two independent, user-owned signals on top of core's own status dot:
 *
 *   - Unread: the existing green StateDot in the row's leading 16px cell,
 *     cleared when the session is opened.
 *   - Triage: a 3px left-edge bar (red / amber / green), set from the Session
 *     context menu. DSH rows already carry a 3px transparent inline border
 *     (--dsh-sidebar-paint-inset), so recoloring its start side adds the bar
 *     without moving layout and without competing with the status dot.
 *
 * Triage is deliberately a processing state, not an abstract "importance":
 *   red   = needs me (open question / decision / risk / deadline)
 *   amber = review (output or conclusion waiting, not archived)
 *   green = settled / reference
 *
 * A client-side heuristic may suggest a level from title keywords and live
 * session status. Suggestions are never auto-applied: they appear in the menu
 * and the hover card, and adopting one is an explicit click.
 */

window.__ModuleLoader__.load({
  id: 'dsh-session-unread',
  factory(require) {
    const React = require('react')
    const primitives = require('@deepseek-ai/dsh-client-ui-primitives')
    const h = React.createElement

    const NS = 'session-unread'
    const UNREAD_KEY = 'dsh.session-unread.v1'
    const TRIAGE_KEY = 'dsh.session-triage.v1'
    const MAX_AGE_MS = 180 * 24 * 60 * 60 * 1000
    const MAX_ENTRIES = 500

    const zh = {
      'menu.mark': '标记为未读',
      'menu.unmark': '取消未读标记',
      'row.unread': '未读',
      'hover.unread': '未读 · 点开后自动清除',
      'triage.menu': '处理状态',
      'triage.current': '处理状态：{level}',
      'triage.clear': '清除处理状态',
      'triage.suggest': '采纳建议：{level}（{reason}）',
      'triage.currentLine': '处理状态：{level}（{source}）',
      'triage.suggestLine': '建议：{level} · {reason}（未采纳）',
      'level.red': '红 · 待我处理',
      'level.amber': '黄 · 待回看',
      'level.green': '绿 · 已闭环',
      'level.short.red': '红',
      'level.short.amber': '黄',
      'level.short.green': '绿',
      'source.manual': '手动',
      'source.auto': '自动',
      'reason.pending': '等待你响应',
      'reason.unread': '有未读结果',
      'reason.title': '标题含“{word}”',
      'reason.manual': '手动',
      'reason.generic': '状态提示',
    }
    const en = {
      'menu.mark': 'Mark as unread',
      'menu.unmark': 'Clear unread mark',
      'row.unread': 'Unread',
      'hover.unread': 'Unread · clears when opened',
      'triage.menu': 'Triage status',
      'triage.current': 'Triage: {level}',
      'triage.clear': 'Clear triage status',
      'triage.suggest': 'Adopt suggestion: {level} ({reason})',
      'triage.currentLine': 'Triage: {level} ({source})',
      'triage.suggestLine': 'Suggestion: {level} · {reason} (not adopted)',
      'level.red': 'Red · Needs me',
      'level.amber': 'Amber · Review',
      'level.green': 'Green · Settled',
      'level.short.red': 'Red',
      'level.short.amber': 'Amber',
      'level.short.green': 'Green',
      'source.manual': 'manual',
      'source.auto': 'auto',
      'reason.pending': 'waiting for your response',
      'reason.unread': 'unread result',
      'reason.title': 'title contains “{word}”',
      'reason.manual': 'manual',
      'reason.generic': 'status hint',
    }

    const LEVELS = {
      red: { token: 'var(--dsw-alias-state-error-primary)' },
      amber: { token: 'var(--dsw-alias-state-warn-primary)' },
      green: { token: 'var(--dsw-alias-state-success-primary)' },
    }
    const LEVEL_IDS = ['red', 'amber', 'green']

    const RED_WORDS = [
      '故障', '报错', '失败', '卡住', '阻塞', '待确认', '待定', '未解决', '紧急', '截止',
      '客户', '合同', '报价', '面试', '上线', '发布', '事故', '风险', '决策', '拍板', '评审',
      'error', 'failed', 'blocked', 'urgent', 'deadline', 'release', 'deploy', 'incident',
    ]
    const AMBER_WORDS = [
      '方案', '优化', '排查', '修复', '迁移', '改造', '分析', '复盘', '设计', '实现',
      '开发', '部署', '测试', '验证', '调研', '评估', '计划',
      'plan', 'refactor', 'fix', 'migrate', 'design', 'implement', 'deploy', 'test', 'review',
    ]
    const CALM_WORDS = ['已解决', '已完成', '已交付', '已归档', 'done', 'resolved', 'shipped']

    function readRaw(key) {
      try {
        return globalThis.localStorage?.getItem(key) ?? null
      } catch (_error) {
        return null
      }
    }

    function writeRaw(key, value) {
      try {
        globalThis.localStorage?.setItem(key, value)
      } catch (_error) {
        /* Private mode / quota: the in-memory state still works for this page. */
      }
    }

    function readJson(key) {
      const raw = readRaw(key)
      if (raw === null || raw === '') return {}
      try {
        return JSON.parse(raw)
      } catch (_error) {
        return {}
      }
    }

    function normalizeUnread(raw) {
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

    function normalizeTriage(raw) {
      const now = Date.now()
      const entries = []
      for (const [id, value] of Object.entries(raw && typeof raw === 'object' ? raw : {})) {
        if (typeof id !== 'string' || id === '') continue
        if (value === null || typeof value !== 'object') continue
        if (LEVEL_IDS.indexOf(value.level) === -1) continue
        const updatedAt = typeof value.updatedAt === 'number' && Number.isFinite(value.updatedAt)
          ? value.updatedAt
          : now
        if (now - updatedAt > MAX_AGE_MS) continue
        const reason = typeof value.reason === 'string' ? value.reason.slice(0, 120) : ''
        const source = value.source === 'auto' ? 'auto' : 'manual'
        entries.push([id, { level: value.level, reason, source, updatedAt }])
      }
      entries.sort((a, b) => b[1].updatedAt - a[1].updatedAt)
      return Object.fromEntries(entries.slice(0, MAX_ENTRIES))
    }

    /** Tiny persisted map: Session id -> value, with a stable snapshot reference. */
    function createMapStore(key, normalize) {
      let snapshot = Object.freeze(normalize(readJson(key)))
      const listeners = new Set()
      const emit = () => {
        for (const listener of [...listeners]) listener()
      }
      const commit = (next) => {
        snapshot = Object.freeze(normalize(next))
        writeRaw(key, JSON.stringify(snapshot))
        emit()
      }
      return {
        getSnapshot: () => snapshot,
        subscribe: (listener) => {
          listeners.add(listener)
          return () => { listeners.delete(listener) }
        },
        get: (id) => snapshot[id],
        has: (id) => Object.prototype.hasOwnProperty.call(snapshot, id),
        set: (id, value) => {
          if (typeof id !== 'string' || id === '') return
          commit({ ...snapshot, [id]: value })
        },
        remove: (id) => {
          if (!Object.prototype.hasOwnProperty.call(snapshot, id)) return
          const next = { ...snapshot }
          delete next[id]
          commit(next)
        },
        refresh: () => {
          snapshot = Object.freeze(normalize(readJson(key)))
          emit()
        },
      }
    }

    const unread = createMapStore(UNREAD_KEY, normalizeUnread)
    const triage = createMapStore(TRIAGE_KEY, normalizeTriage)

    /* External session/status changes that a hover line or menu should reflect. */
    const revision = { value: 0, listeners: new Set() }
    const bumpRevision = () => {
      revision.value += 1
      for (const listener of [...revision.listeners]) listener()
    }
    const subscribeRevision = (listener) => {
      revision.listeners.add(listener)
      return () => { revision.listeners.delete(listener) }
    }

    const runtime = { suggestFor: () => null }

    function GreenDot(props) {
      return typeof primitives.StateDot === 'function'
        ? h(primitives.StateDot, { state: 'done', ...props })
        : h('span', {
          'aria-hidden': 'true',
          style: {
            display: 'inline-block',
            width: '10px',
            height: '10px',
            borderRadius: '50%',
            backgroundColor: 'var(--dsw-alias-state-success-primary)',
          },
        })
    }

    function TriageDot({ color, opacity = 1 }) {
      return h('span', {
        'aria-hidden': 'true',
        style: {
          display: 'inline-block',
          width: '10px',
          height: '10px',
          borderRadius: '3px',
          backgroundColor: color,
          opacity,
          flex: 'none',
        },
      })
    }

    /** Row-leading dot; the seat only renders while the row's primary state is idle. */
    function UnreadRowDot({ sessionId, t }) {
      const marked = React.useSyncExternalStore(
        unread.subscribe,
        () => unread.has(sessionId),
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

    /** Hover-card status lines: unread and triage/suggestion. */
    function SessionStateHover({ sessionId, t }) {
      const marked = React.useSyncExternalStore(
        unread.subscribe,
        () => unread.has(sessionId),
      )
      const entry = React.useSyncExternalStore(
        triage.subscribe,
        () => triage.get(sessionId),
      )
      React.useSyncExternalStore(subscribeRevision, () => revision.value)
      const suggestion = runtime.suggestFor(sessionId)
      const translate = typeof t === 'function' ? t : (key) => key
      const lines = []

      if (marked) {
        lines.push(h('div', {
          key: 'unread',
          style: {
            display: 'flex', alignItems: 'center', gap: '6px',
            fontSize: '12px', lineHeight: '18px', color: 'var(--dsw-alias-label-secondary)',
          },
        }, h(GreenDot), h('span', null, translate('hover.unread'))))
      }

      if (entry !== undefined && LEVELS[entry.level] !== undefined) {
        lines.push(h('div', {
          key: 'triage',
          style: {
            display: 'flex', alignItems: 'center', gap: '6px',
            fontSize: '12px', lineHeight: '18px', color: 'var(--dsw-alias-label-secondary)',
          },
        },
        h(TriageDot, { color: LEVELS[entry.level].token }),
        h('span', null, translate('triage.currentLine', {
          level: translate('level.' + entry.level),
          source: translate(entry.source === 'auto' ? 'source.auto' : 'source.manual'),
        }))))
      } else if (suggestion !== null && LEVELS[suggestion.level] !== undefined) {
        const reason = suggestion.reason.length > 24
          ? suggestion.reason.slice(0, 24) + '…'
          : suggestion.reason
        lines.push(h('div', {
          key: 'suggestion',
          style: {
            display: 'flex', alignItems: 'center', gap: '6px',
            fontSize: '12px', lineHeight: '18px', color: 'var(--dsw-alias-label-tertiary)',
          },
        },
        h(TriageDot, { color: LEVELS[suggestion.level].token, opacity: 0.6 }),
        h('span', null, translate('triage.suggestLine', {
          level: translate('level.short.' + suggestion.level),
          reason,
        }))))
      }

      return lines.length === 0 ? null : h(React.Fragment, null, ...lines)
    }

    function apply(ctx) {
      ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'session-unread: dictionaries')

      const translate = () => ctx.locale.bind(NS)

      /** Current main-view session id, exactly the derivation WorkspaceBrowser uses. */
      const currentSessionId = (list) => {
        for (const row of Object.values(list.byId)) {
          if ((row.retainedBy?.mainView ?? 0) > 0) return row.id
        }
        return undefined
      }

      /** Archived rows hold a blank leading cell and read as inactive. */
      const isArchived = (sessionId) => {
        try {
          return ctx.workspaces.list.getSnapshot().archivedSessionIds.includes(sessionId)
        } catch (_error) {
          return false
        }
      }

      const statusOf = (sessionId) => {
        try {
          return ctx.uiSession.sessionStatus.getSnapshot().get(sessionId)
        } catch (_error) {
          return undefined
        }
      }

      /**
       * Client-only triage suggestion. It reads title + live status only; it
       * never reads conversation content and never applies itself.
       */
      const suggestFor = (sessionId) => {
        if (isArchived(sessionId)) return null
        const row = ctx.sessions.list.getSnapshot().byId[sessionId]
        if (row === undefined || row.blank === true) return null
        const status = statusOf(sessionId)
        const t = translate()

        if (status !== undefined && status.pendingInteraction != null) {
          return { level: 'red', reason: t('reason.pending') }
        }

        const title = (String(row.title ?? '') + ' ' + String(row.displayTitle ?? '')).toLowerCase()
        let score = 0
        const reasons = []

        if (status !== undefined && status.completionUnread === true) {
          score += 3
          reasons.push(t('reason.unread'))
        }

        const redWord = RED_WORDS.find(word => title.includes(word))
        if (redWord !== undefined) {
          score += 5
          reasons.push(t('reason.title', { word: redWord }))
        }

        const amberWord = AMBER_WORDS.find(word => title.includes(word))
        if (amberWord !== undefined) {
          score += 2
          reasons.push(t('reason.title', { word: amberWord }))
        }

        if (CALM_WORDS.some(word => title.includes(word))) score -= 4

        if (score >= 5) return { level: 'red', reason: reasons[0] ?? t('reason.generic') }
        if (score >= 2) return { level: 'amber', reason: reasons[0] ?? t('reason.generic') }
        return null
      }
      runtime.suggestFor = suggestFor

      /* Re-render hover lines and menu metadata for external session changes. */
      ctx.effect(() => {
        const disposers = [
          ctx.sessions.list.subscribe(bumpRevision),
          ctx.uiSession.sessionStatus.subscribe(bumpRevision),
          ctx.workspaces.list.subscribe(bumpRevision),
        ]
        return () => { for (const dispose of disposers) dispose() }
      }, 'session-unread: status revisions')

      /* Opening a marked session clears unread; marking the already-open
         session does not, because no selection transition happens. */
      let previousCurrent
      const syncOpen = () => {
        const next = currentSessionId(ctx.sessions.list.getSnapshot())
        if (next !== undefined && next !== previousCurrent && unread.has(next)) unread.remove(next)
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
          if (event.key === UNREAD_KEY) unread.refresh()
          if (event.key === TRIAGE_KEY) triage.refresh()
        }
        window.addEventListener('storage', onStorage)
        return () => { window.removeEventListener('storage', onStorage) }
      }, 'session-unread: cross-tab sync')

      /* The left-edge triage bar, using the row's existing 3px inline border. */
      if (typeof document !== 'undefined') {
        const styleEl = document.createElement('style')
        styleEl.dataset.plugin = 'dsh-session-unread'
        styleEl.dataset.pluginCss = 'triage.css'
        document.head.appendChild(styleEl)
        const renderBars = () => {
          const archived = new Set(ctx.workspaces.list.getSnapshot().archivedSessionIds)
          const rules = []
          for (const [id, entry] of Object.entries(triage.getSnapshot())) {
            if (archived.has(id) || entry === null || LEVELS[entry.level] === undefined) continue
            rules.push('[data-row-key=' + JSON.stringify('session:' + id) + '] { border-inline-start-width: 5px; border-inline-start-color: ' + LEVELS[entry.level].token + '; padding-inline-start: calc(var(--dsh-sidebar-row-padding) - 5px + var(--dsh-workspace-indent, 0px)); }')
          }
          styleEl.textContent = rules.join(' ')
        }
        ctx.effect(() => {
          const disposeTriage = triage.subscribe(renderBars)
          const disposeWorkspaces = ctx.workspaces.list.subscribe(renderBars)
          renderBars()
          return () => {
            disposeTriage()
            disposeWorkspaces()
            styleEl.remove()
          }
        }, 'session-unread: triage bars')
      }

      /* Triage submenu: red / amber / green / clear, plus one suggestion. */
      ctx.effect(() => ctx.contextMenus.register({
        id: 'session-triage.menu',
        target: 'session',
        order: 340,
        observe: () => [triage, ctx.sessions.list, ctx.uiSession.sessionStatus, ctx.workspaces.list],
        resolve: ({ sessionId }) => {
          if (isArchived(sessionId)) return []
          const t = translate()
          const current = triage.get(sessionId)
          const suggestion = suggestFor(sessionId)
          const children = LEVEL_IDS.map((level) => ({
            id: 'session-triage.' + level,
            label: (current !== undefined && current.level === level ? '✓ ' : '') + t('level.' + level),
            run: () => {
              triage.set(sessionId, {
                level,
                reason: t('reason.manual'),
                source: 'manual',
                updatedAt: Date.now(),
              })
            },
          }))
          if (current !== undefined) {
            children.push({
              id: 'session-triage.clear',
              label: t('triage.clear'),
              separatorBefore: true,
              run: () => { triage.remove(sessionId) },
            })
          }
          if (suggestion !== null && (current === undefined || suggestion.level !== current.level)) {
            const reason = suggestion.reason.length > 30
              ? suggestion.reason.slice(0, 30) + '…'
              : suggestion.reason
            children.push({
              id: 'session-triage.suggest',
              label: t('triage.suggest', {
                level: t('level.short.' + suggestion.level),
                reason,
              }),
              separatorBefore: true,
              run: () => {
                triage.set(sessionId, {
                  level: suggestion.level,
                  reason: suggestion.reason,
                  source: 'auto',
                  updatedAt: Date.now(),
                })
              },
            })
          }
          return [{
            id: 'session-triage.menu',
            label: current === undefined
              ? t('triage.menu')
              : t('triage.current', { level: t('level.short.' + current.level) }),
            icon: { key: 'session-triage.' + (current === undefined ? 'none' : current.level) },
            children,
          }]
        },
      }), 'session-unread: triage menu')

      /* Structured unread action. */
      ctx.effect(() => ctx.contextMenus.register({
        id: 'session-unread.toggle',
        target: 'session',
        order: 350,
        observe: () => [unread],
        resolve: ({ sessionId }) => {
          if (isArchived(sessionId)) return []
          const marked = unread.has(sessionId)
          const t = translate()
          return [{
            id: marked ? 'session-unread.clear' : 'session-unread.mark',
            label: t(marked ? 'menu.unmark' : 'menu.mark'),
            icon: { key: 'session-unread.dot' },
            run: () => {
              if (marked) unread.remove(sessionId)
              else unread.set(sessionId, Date.now())
            },
          }]
        },
      }), 'session-unread: unread menu')

      /* Menu glyphs: unread green dot, triage colored squares. */
      ctx.slots.inject('contextMenu.icon', () => {
        const disposers = []
        const register = (key, color, opacity) => {
          disposers.push(ctx.slots.register({
            name: 'contextMenu.icon',
            key,
          }, () => h(TriageDot, { color, opacity })))
        }
        register('session-triage.red', LEVELS.red.token, 1)
        register('session-triage.amber', LEVELS.amber.token, 1)
        register('session-triage.green', LEVELS.green.token, 1)
        register('session-triage.none', 'var(--dsw-alias-label-tertiary)', 0.45)
        disposers.push(ctx.slots.register({
          name: 'contextMenu.icon',
          key: 'session-unread.dot',
        }, () => h(GreenDot, { size: 12 })))
        return () => { for (const dispose of disposers) dispose() }
      })

      /* Row-leading unread dot. The seat renders only while the row is idle. */
      ctx.slots.inject('sidebar.session.row.leading', () => {
        const unregister = ctx.slots.register({
          name: 'sidebar.session.row.leading',
          id: 'session-unread-dot',
          order: 40,
          locale: NS,
        }, UnreadRowDot)
        return () => { unregister() }
      })

      /* Hover-card lines: unread + triage/suggestion. */
      ctx.slots.inject('sidebar.session.row.hover', () => {
        const unregister = ctx.slots.register({
          name: 'sidebar.session.row.hover',
          id: 'session-unread-hover',
          order: 40,
          locale: NS,
        }, SessionStateHover)
        return () => { unregister() }
      })
    }

    return {
      name: 'dsh-session-unread',
      inject: ['slots', 'locale', 'sessions', 'contextMenus', 'workspaces', 'uiSession'],
      apply,
    }
  },
})
