/**
 * dsh-session-triage — browser half.
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
  id: 'dsh-session-triage',
  factory(require) {
    const React = require('react')
    const primitives = require('@deepseek-ai/dsh-client-ui-primitives')
    const h = React.createElement

    const NS = 'session-unread'
    const UNREAD_KEY = 'dsh.session-unread.v1'
    const TRIAGE_KEY = 'dsh.session-triage.v1'
    const SETTINGS_KEY = 'dsh.session-unread.settings.v1'
    const MAX_AGE_MS = 180 * 24 * 60 * 60 * 1000
    const MAX_ENTRIES = 500
    const PROFILES = ['web:macos', 'web:windows', 'web:linux', 'desktop:macos', 'desktop:windows', 'desktop:linux']

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
      'settings.title': '会话标记',
      'settings.description': '未读绿点、处理状态色条；快捷键在「键盘快捷键」里修改。',
      'settings.autoSuggest': '自动建议处理状态',
      'settings.showBars': '显示处理状态色条',
      'shortcut.nextUnread': '下一个未读会话',
      'shortcut.cycleTriage': '循环当前会话处理状态',
      'board.title': '会话看板',
      'board.active': '未闭环 {n}',
      'board.all': '全部',
      'board.running': '运行中',
      'board.red': '待我处理',
      'board.amber': '待回看',
      'board.recent': '最近 7 天未标记',
      'board.closed': '已闭环',
      'board.showClosed': '显示已闭环',
      'board.search': '搜索标题或工作区',
      'board.workspaceAll': '全部工作区',
      'board.empty': '没有进行中的会话',
      'board.emptyHint': '会话运行、出现未读结果或标了红 / 黄后，会出现在这里。',
      'board.noMatch': '没有匹配的会话',
      'board.noMatchHint': '换个关键词或筛选条件试试。',
      'board.clearFilters': '清除筛选',
      'board.unread': '未读',
      'board.pending': '等你响应',
      'board.noWorkspace': '未归入工作区',
      'board.markRed': '标为红 · 待我处理',
      'board.markAmber': '标为黄 · 待回看',
      'board.markGreen': '标为绿 · 已闭环',
      'board.clearStatus': '再次点击清除处理状态',
      'board.open': '打开会话',
      'board.justNow': '刚刚',
      'board.minutes': '{n} 分钟',
      'board.hours': '{n} 小时',
      'board.days': '{n} 天',
      'board.runBadge': '运行中',
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
      'settings.title': 'Session marks',
      'settings.description': 'Unread dot and triage bar. Shortcuts are edited under Keyboard shortcuts.',
      'settings.autoSuggest': 'Suggest triage status',
      'settings.showBars': 'Show triage bar',
      'shortcut.nextUnread': 'Next unread session',
      'shortcut.cycleTriage': 'Cycle current session triage',
      'board.title': 'Session board',
      'board.active': '{n} open',
      'board.all': 'All',
      'board.running': 'Running',
      'board.red': 'Needs me',
      'board.amber': 'Review',
      'board.recent': 'Untriaged · 7d',
      'board.closed': 'Settled',
      'board.showClosed': 'Show settled',
      'board.search': 'Search title or workspace',
      'board.workspaceAll': 'All workspaces',
      'board.empty': 'No active sessions',
      'board.emptyHint': 'Sessions appear here when they run, get an unread result, or are marked red / amber.',
      'board.noMatch': 'No matching sessions',
      'board.noMatchHint': 'Try another keyword or filter.',
      'board.clearFilters': 'Clear filters',
      'board.unread': 'Unread',
      'board.pending': 'Waiting for you',
      'board.noWorkspace': 'No workspace',
      'board.markRed': 'Mark red · Needs me',
      'board.markAmber': 'Mark amber · Review',
      'board.markGreen': 'Mark green · Settled',
      'board.clearStatus': 'Click again to clear triage',
      'board.open': 'Open session',
      'board.justNow': 'just now',
      'board.minutes': '{n}m',
      'board.hours': '{n}h',
      'board.days': '{n}d',
      'board.runBadge': 'Running',
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

    function normalizeSettings(raw) {
      const value = raw && typeof raw === 'object' ? raw : {}
      return {
        autoSuggest: value.autoSuggest !== false,
        showBars: value.showBars !== false,
      }
    }

    function createSettingsStore() {
      let snapshot = Object.freeze(normalizeSettings(readJson(SETTINGS_KEY)))
      const listeners = new Set()
      const emit = () => {
        for (const listener of [...listeners]) listener()
      }
      return {
        getSnapshot: () => snapshot,
        subscribe: (listener) => {
          listeners.add(listener)
          return () => { listeners.delete(listener) }
        },
        set: (next) => {
          snapshot = Object.freeze(normalizeSettings(next))
          writeRaw(SETTINGS_KEY, JSON.stringify(snapshot))
          emit()
        },
        refresh: () => {
          snapshot = Object.freeze(normalizeSettings(readJson(SETTINGS_KEY)))
          emit()
        },
      }
    }

    const unread = createMapStore(UNREAD_KEY, normalizeUnread)
    const triage = createMapStore(TRIAGE_KEY, normalizeTriage)
    const settings = createSettingsStore()

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

    /** Settings -> General row: auto-suggest and triage-bar switches. */
    function SessionMarkSettings({ t }) {
      const current = React.useSyncExternalStore(settings.subscribe, settings.getSnapshot)
      const tr = typeof t === 'function' ? t : (key) => key
      const toggle = (label, value, onChange) => h('label', {
        style: {
          display: 'flex', alignItems: 'center', gap: '8px',
          fontSize: '12px', lineHeight: '18px',
          color: 'var(--dsw-alias-label-secondary)', cursor: 'pointer',
        },
      },
      h('button', {
        type: 'button',
        role: 'switch',
        'aria-checked': value,
        'aria-label': label,
        onClick: () => { onChange(!value) },
        style: {
          position: 'relative', width: '36px', height: '20px', padding: '0',
          border: 'none', borderRadius: '10px', cursor: 'pointer', flex: 'none',
          background: value ? 'var(--dsw-alias-state-business-primary)' : 'var(--dsw-alias-border-l2)',
          transition: 'background 120ms ease',
        },
      }, h('span', {
        'aria-hidden': 'true',
        style: {
          position: 'absolute', top: '2px', left: value ? '18px' : '2px',
          width: '16px', height: '16px', borderRadius: '50%', background: '#fff',
          boxShadow: '0 1px 2px rgba(0, 0, 0, 0.25)', transition: 'left 120ms ease',
        },
      })), h('span', null, label))
      return h('div', {
        style: {
          display: 'flex', alignItems: 'center', gap: '16px',
          padding: '16px 0', borderBottom: '1px solid var(--dsw-alias-border-l2)',
        },
      },
      h('div', {
        style: {
          flex: '1', minWidth: '0', display: 'flex', flexDirection: 'column',
          gap: '4px', paddingRight: '24px',
        },
      },
      h('div', {
        style: { fontSize: '14px', lineHeight: '22px', color: 'var(--dsw-alias-label-primary)' },
      }, tr('settings.title')),
      h('div', {
        style: { fontSize: '12px', lineHeight: '18px', color: 'var(--dsw-alias-label-tertiary)' },
      }, tr('settings.description'))),
      h('div', {
        style: { display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'flex-start' },
      },
      toggle(tr('settings.autoSuggest'), current.autoSuggest, value => settings.set({ ...current, autoSuggest: value })),
      toggle(tr('settings.showBars'), current.showBars, value => settings.set({ ...current, showBars: value }))))
    }

    const BOARD_ID = 'session-unread-board'
    const WEEK_MS = 7 * 24 * 60 * 60 * 1000

    /* The layout drops an active global panel while our client bundle is
       hot-reloaded. This page-scoped marker lets the new bundle put the board
       back; the timeOrigin guard keeps a real page reload on the conversation. */
    const BOARD_RELOAD_KEY = 'dsh.session-triage.board-active.v1'
    const BOARD_PAGE_ORIGIN = (() => {
      try { return performance.timeOrigin } catch (_error) { return 0 }
    })()
    const readBoardReload = () => {
      try {
        const raw = sessionStorage.getItem(BOARD_RELOAD_KEY)
        if (raw !== null) {
          const value = JSON.parse(raw)
          if (value !== null && typeof value === 'object' && value.page === BOARD_PAGE_ORIGIN) return true
        }
      } catch (_error) { /* storage unavailable or bad JSON */ }
      try { sessionStorage.removeItem(BOARD_RELOAD_KEY) } catch (_error) { /* ignore */ }
      return false
    }
    const markBoardReload = () => {
      try { sessionStorage.setItem(BOARD_RELOAD_KEY, JSON.stringify({ page: BOARD_PAGE_ORIGIN })) } catch (_error) { /* ignore */ }
    }
    const clearBoardReload = () => {
      try { sessionStorage.removeItem(BOARD_RELOAD_KEY) } catch (_error) { /* ignore */ }
    }
    const GROUP_ORDER = ['running', 'red', 'amber', 'recent', 'closed']
    const GROUP_META = {
      running: { label: 'board.running', dot: 'running', bar: 'running' },
      red: { label: 'board.red', dot: 'red', bar: 'red' },
      amber: { label: 'board.amber', dot: 'amber', bar: 'amber' },
      recent: { label: 'board.recent', dot: 'recent', bar: 'recent' },
      closed: { label: 'board.closed', dot: 'green', bar: 'green' },
    }

    const BOARD_CSS = `
.dsu-board, .dsu-board * { box-sizing: border-box; }
.dsu-board { height: 100%; min-height: 0; overflow: auto; background: var(--dsw-alias-bg-layer-3, #fff); padding: 28px clamp(20px, 5vw, 56px) 64px; color: var(--dsw-alias-label-primary); }
.dsu-board-inner { width: 100%; max-width: 1040px; margin: 0 auto; }
.dsu-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }
.dsu-title { margin: 0; font-size: 24px; line-height: 32px; font-weight: 600; letter-spacing: -0.01em; }
.dsu-sub { margin-top: 4px; font-size: 13px; line-height: 20px; color: var(--dsw-alias-label-tertiary); }
.dsu-chips { display: flex; flex-wrap: wrap; gap: 8px; margin: 20px 0 14px; }
.dsu-chip { display: inline-flex; align-items: center; gap: 7px; height: 32px; padding: 0 12px; border: 1px solid var(--dsw-alias-border-l1, rgba(0, 0, 0, 0.1)); border-radius: 999px; background: var(--dsw-alias-bg-layer-1, #fff); color: var(--dsw-alias-label-secondary); font: inherit; font-size: 13px; cursor: pointer; transition: background 120ms ease, border-color 120ms ease, color 120ms ease; }
.dsu-chip:hover { background: var(--dsw-alias-interactive-bg-hover, rgba(0, 0, 0, 0.04)); }
.dsu-chip[aria-pressed="true"] { color: var(--dsw-alias-label-primary); border-color: var(--dsw-alias-border-l2, rgba(0, 0, 0, 0.18)); background: var(--dsw-alias-bg-layer-2, rgba(0, 0, 0, 0.06)); }
.dsu-chip-count { color: var(--dsw-alias-label-tertiary); font-variant-numeric: tabular-nums; }
.dsu-chip[aria-pressed="true"] .dsu-chip-count { color: var(--dsw-alias-label-secondary); }
.dsu-dot { width: 8px; height: 8px; border-radius: 50%; flex: none; background: var(--dsw-alias-label-tertiary); }
.dsu-dot.running, .dsu-dot.business { background: var(--dsw-alias-state-business-primary, #4c6fff); }
.dsu-dot.red, .dsu-dot.error { background: var(--dsw-alias-state-error-primary, #e5484d); }
.dsu-dot.amber, .dsu-dot.warn { background: var(--dsw-alias-state-warn-primary, #f5a623); }
.dsu-dot.green, .dsu-dot.success { background: var(--dsw-alias-state-success-primary, #30a46c); }
.dsu-dot.recent { background: var(--dsw-alias-label-tertiary); }
.dsu-toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; margin-bottom: 8px; }
.dsu-search { flex: 1 1 260px; min-width: 180px; height: 36px; padding: 0 12px; border: 1px solid var(--dsw-alias-border-l1, rgba(0, 0, 0, 0.12)); border-radius: 8px; background: var(--dsw-alias-bg-layer-1, #fff); color: var(--dsw-alias-label-primary); font: inherit; font-size: 13px; outline: none; }
.dsu-search::placeholder { color: var(--dsw-alias-label-tertiary); }
.dsu-search:focus { border-color: var(--dsw-alias-state-business-primary, #4c6fff); box-shadow: 0 0 0 2px var(--dsw-focus-ring-color, rgba(76, 111, 255, 0.25)); }
.dsu-select { height: 36px; max-width: 200px; padding: 0 28px 0 10px; border: 1px solid var(--dsw-alias-border-l1, rgba(0, 0, 0, 0.12)); border-radius: 8px; background: var(--dsw-alias-bg-layer-1, #fff); color: var(--dsw-alias-label-primary); font: inherit; font-size: 13px; }
.dsu-select option { background: var(--dsw-alias-bg-layer-1, #fff); color: var(--dsw-alias-label-primary); }
.dsu-toggle { display: inline-flex; align-items: center; gap: 7px; height: 36px; padding: 0 10px; border: 1px solid transparent; border-radius: 8px; background: transparent; color: var(--dsw-alias-label-secondary); font: inherit; font-size: 13px; cursor: pointer; }
.dsu-toggle:hover { background: var(--dsw-alias-interactive-bg-hover, rgba(0, 0, 0, 0.04)); }
.dsu-toggle .dsu-check { display: inline-flex; align-items: center; justify-content: center; width: 16px; height: 16px; border: 1px solid var(--dsw-alias-border-l2, rgba(0, 0, 0, 0.18)); border-radius: 4px; font-size: 11px; line-height: 1; color: var(--dsw-alias-label-inverse, #fff); }
.dsu-toggle[aria-pressed="true"] .dsu-check { background: var(--dsw-alias-state-business-primary, #4c6fff); border-color: var(--dsw-alias-state-business-primary, #4c6fff); }
.dsu-link { border: 0; background: transparent; color: var(--dsw-alias-state-business-primary, #4c6fff); font: inherit; font-size: 13px; cursor: pointer; padding: 0 2px; }
.dsu-link:hover { text-decoration: underline; }
.dsu-group { margin-top: 24px; }
.dsu-group-head { display: flex; align-items: center; gap: 8px; padding: 0 4px 6px; }
.dsu-group-name { font-size: 12px; line-height: 16px; font-weight: 600; letter-spacing: 0.04em; color: var(--dsw-alias-label-tertiary); }
.dsu-group-count { font-size: 12px; line-height: 16px; color: var(--dsw-alias-label-tertiary); }
.dsu-rows { border-top: 1px solid var(--dsw-alias-border-l1, rgba(0, 0, 0, 0.08)); }
.dsu-row { position: relative; display: flex; align-items: center; gap: 12px; min-height: 58px; padding: 8px 8px 8px 0; border-bottom: 1px solid var(--dsw-alias-border-l1, rgba(0, 0, 0, 0.08)); border-radius: 8px; cursor: pointer; outline: none; }
.dsu-row:hover { background: var(--dsw-alias-interactive-bg-hover, rgba(0, 0, 0, 0.04)); }
.dsu-row:focus-visible { box-shadow: inset 0 0 0 2px var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary, #4c6fff)); }
.dsu-row-bar { width: 4px; align-self: stretch; min-height: 28px; margin: 6px 0 6px 8px; border-radius: 2px; background: transparent; flex: none; }
.dsu-row-bar.running { background: var(--dsw-alias-state-business-primary, #4c6fff); }
.dsu-row-bar.red { background: var(--dsw-alias-state-error-primary, #e5484d); }
.dsu-row-bar.amber { background: var(--dsw-alias-state-warn-primary, #f5a623); }
.dsu-row-bar.green { background: var(--dsw-alias-state-success-primary, #30a46c); }
.dsu-row-bar.recent { background: var(--dsw-alias-border-l2, rgba(0, 0, 0, 0.18)); }
.dsu-row-main { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
.dsu-row-title { display: flex; align-items: center; gap: 6px; min-width: 0; font-size: 14px; line-height: 20px; font-weight: 500; }
.dsu-row-title-text { min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.dsu-title-unread { flex: none; height: 18px; padding: 0 6px; border-radius: 999px; font-size: 10px; line-height: 18px; letter-spacing: 0.02em; background: rgba(48, 164, 108, 0.12); }
.dsu-row-meta { display: flex; align-items: center; gap: 6px; min-width: 0; font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-tertiary); }
.dsu-row-workspace { max-width: 260px; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.dsu-sep { opacity: 0.6; }
.dsu-row-badges { display: flex; align-items: center; gap: 6px; flex: none; }
.dsu-badge { display: inline-flex; align-items: center; gap: 5px; height: 20px; padding: 0 7px; border-radius: 999px; background: var(--dsw-alias-bg-layer-2, rgba(0, 0, 0, 0.06)); color: var(--dsw-alias-label-secondary); font-size: 11px; line-height: 20px; white-space: nowrap; }
.dsu-badge.running { color: var(--dsw-alias-state-business-primary, #4c6fff); }
.dsu-badge.red { color: var(--dsw-alias-state-error-primary, #e5484d); }
.dsu-badge.amber { color: var(--dsw-alias-state-warn-primary, #f5a623); }
.dsu-badge.green { color: var(--dsw-alias-state-success-primary, #30a46c); }
.dsu-badge.unread { color: var(--dsw-alias-state-success-primary, #30a46c); }
.dsu-pulse { width: 6px; height: 6px; border-radius: 50%; background: currentColor; animation: dsu-pulse 1.4s ease-in-out infinite; }
.dsu-actions { display: flex; align-items: center; gap: 4px; flex: none; opacity: 0; transition: opacity 120ms ease; }
.dsu-row:hover .dsu-actions, .dsu-row:focus-within .dsu-actions { opacity: 1; }
.dsu-action { display: inline-flex; align-items: center; justify-content: center; width: 24px; height: 24px; padding: 0; border: 1px solid transparent; border-radius: 50%; background: transparent; cursor: pointer; }
.dsu-action:hover { background: var(--dsw-alias-bg-layer-2, rgba(0, 0, 0, 0.06)); }
.dsu-action:focus-visible { outline: 2px solid var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary, #4c6fff)); outline-offset: 1px; }
.dsu-action[aria-pressed="true"] { border-color: currentColor; }
.dsu-action .dsu-dot { width: 9px; height: 9px; background: currentColor; }
.dsu-action.red { color: var(--dsw-alias-state-error-primary, #e5484d); }
.dsu-action.amber { color: var(--dsw-alias-state-warn-primary, #f5a623); }
.dsu-action.green { color: var(--dsw-alias-state-success-primary, #30a46c); }
.dsu-empty { padding: 56px 16px; text-align: center; }
.dsu-empty-title { font-size: 15px; line-height: 22px; font-weight: 500; color: var(--dsw-alias-label-secondary); }
.dsu-empty-hint { margin: 6px auto 0; max-width: 420px; font-size: 13px; line-height: 20px; color: var(--dsw-alias-label-tertiary); }
.dsu-empty .dsu-link { margin-top: 12px; }
@keyframes dsu-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.35; } }
@media (prefers-reduced-motion: reduce) { .dsu-pulse { animation: none; } .dsu-chip, .dsu-row, .dsu-actions { transition: none; } }
@media (max-width: 720px) {
  .dsu-board { padding: 20px 14px 48px; }
  .dsu-row-badges { display: none; }
  .dsu-row-workspace { max-width: 140px; }
  .dsu-actions { opacity: 1; }
  .dsu-select { max-width: 150px; }
}
@media (hover: none) { .dsu-actions { opacity: 1; } }
    `

    function BoardIcon({ size = 16 }) {
      return h('svg', {
        width: size, height: size, viewBox: '0 0 16 16', fill: 'none',
        'aria-hidden': 'true', focusable: 'false',
      },
      h('rect', { x: 2, y: 2.5, width: 3.5, height: 11, rx: 1, fill: 'currentColor', opacity: 0.9 }),
      h('rect', { x: 6.25, y: 2.5, width: 3.5, height: 7.5, rx: 1, fill: 'currentColor', opacity: 0.65 }),
      h('rect', { x: 10.5, y: 2.5, width: 3.5, height: 9.5, rx: 1, fill: 'currentColor', opacity: 0.45 }))
    }

    function useObservable(source) {
      return React.useSyncExternalStore(
        React.useCallback((listener) => source.subscribe(listener), [source]),
        React.useCallback(() => source.getSnapshot(), [source]),
      )
    }

    function cx(...names) {
      return names.filter(Boolean).join(' ')
    }

    function formatAge(updatedAt, now, t) {
      const elapsed = Math.max(0, now - updatedAt)
      const minute = 60 * 1000
      if (elapsed < minute) return t('board.justNow')
      if (elapsed < 60 * minute) return t('board.minutes', { n: Math.floor(elapsed / minute) })
      if (elapsed < 24 * 60 * minute) return t('board.hours', { n: Math.floor(elapsed / (60 * minute)) })
      return t('board.days', { n: Math.floor(elapsed / (24 * 60 * minute)) })
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
        if (settings.getSnapshot().autoSuggest === false) return null
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
          if (event.key === SETTINGS_KEY) settings.refresh()
        }
        window.addEventListener('storage', onStorage)
        return () => { window.removeEventListener('storage', onStorage) }
      }, 'session-unread: cross-tab sync')

      /* The left-edge triage bar, using the row's existing 3px inline border. */
      if (typeof document !== 'undefined') {
        const styleEl = document.createElement('style')
        styleEl.dataset.plugin = 'dsh-session-triage'
        styleEl.dataset.pluginCss = 'triage.css'
        document.head.appendChild(styleEl)
        const renderBars = () => {
          if (settings.getSnapshot().showBars === false) {
            styleEl.textContent = ''
            return
          }
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
          const disposeSettings = settings.subscribe(renderBars)
          renderBars()
          return () => {
            disposeTriage()
            disposeWorkspaces()
            disposeSettings()
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
      /* Settings -> General row: plugin preferences only. Shortcut keys are
         edited in the shared Keyboard shortcuts editor below. */
      ctx.slots.inject('settings.general.item', () => {
        const unregister = ctx.slots.register({
          name: 'settings.general.item',
          id: 'session-unread-settings',
          order: 17,
          locale: NS,
        }, SessionMarkSettings)
        return () => { unregister() }
      })

      /* Two app commands; both appear in Settings -> Keyboard shortcuts and
         are rebindable there. Web Linux only admits Mod+Shift+, / Mod+Shift+.,
         so those are the defaults; a conflict leaves the command unbound
         instead of failing plugin activation. */
      const defaultsFor = (binding) => {
        if (binding === null) return {}
        const entries = {}
        for (const profile of PROFILES) entries[profile] = binding
        return entries
      }
      const bindingAllowed = (binding) => {
        try {
          const described = ctx.shortcuts.describeBinding(binding)
          return described.issue === null && described.conflicts.length === 0
        } catch (_error) {
          return false
        }
      }
      const nextUnreadBinding = bindingAllowed({ code: 'Comma', modifiers: ['primary', 'shift'] })
        ? { code: 'Comma', modifiers: ['primary', 'shift'] }
        : null
      const cycleTriageBinding = bindingAllowed({ code: 'Period', modifiers: ['primary', 'shift'] })
        ? { code: 'Period', modifiers: ['primary', 'shift'] }
        : null
      const registerShortcut = (command) => {
        try {
          return ctx.shortcuts.register(command)
        } catch (_error) {
          try {
            return ctx.shortcuts.register({ ...command, defaults: {} })
          } catch (_ignored) {
            return () => {}
          }
        }
      }
      ctx.effect(() => {
        const disposers = [
          registerShortcut({
            id: 'session-unread.next',
            label: () => translate()('shortcut.nextUnread'),
            aliases: ['next unread', 'unread', '下一个未读'],
            defaults: defaultsFor(nextUnreadBinding),
            regions: ['page', 'editable'],
            modals: [],
            resolve: () => {
              const list = ctx.sessions.list.getSnapshot()
              const current = currentSessionId(list)
              const candidates = list.ids.filter(id =>
                id !== current && unread.has(id) && !isArchived(id))
              if (candidates.length === 0) return { status: 'blocked', reason: 'no-unread' }
              let next = candidates[0]
              if (current !== undefined) {
                const index = list.ids.indexOf(current)
                if (index >= 0) {
                  for (let step = 1; step <= list.ids.length; step += 1) {
                    const id = list.ids[(index + step) % list.ids.length]
                    if (id !== current && unread.has(id) && !isArchived(id)) {
                      next = id
                      break
                    }
                  }
                }
              }
              return {
                status: 'handled',
                run: () => {
                  void Promise.resolve(ctx.uiWorkspace.openSession(next)).catch(() => {})
                },
              }
            },
          }),
          registerShortcut({
            id: 'session-triage.cycle',
            label: () => translate()('shortcut.cycleTriage'),
            aliases: ['triage', 'cycle triage', '循环处理状态'],
            defaults: defaultsFor(cycleTriageBinding),
            regions: ['page', 'editable'],
            modals: [],
            resolve: () => {
              const list = ctx.sessions.list.getSnapshot()
              const current = currentSessionId(list)
              if (current === undefined || isArchived(current)) {
                return { status: 'blocked', reason: 'no-current' }
              }
              const entry = triage.get(current)
              const next = entry === undefined
                ? 'red'
                : entry.level === 'red'
                  ? 'amber'
                  : entry.level === 'amber'
                    ? 'green'
                    : null
              return {
                status: 'handled',
                run: () => {
                  const t = translate()
                  if (next === null) triage.remove(current)
                  else {
                    triage.set(current, {
                      level: next,
                      reason: t('reason.manual'),
                      source: 'manual',
                      updatedAt: Date.now(),
                    })
                  }
                },
              }
            },
          }),
        ]
        return () => { for (const dispose of disposers) dispose() }
      }, 'session-unread: shortcuts')

      /* Board CSS is injected once; rows reuse the app's theme tokens. */
      ctx.effect(() => {
        const style = document.createElement('style')
        style.dataset.pluginCss = 'board.css'
        style.textContent = BOARD_CSS
        document.head.appendChild(style)
        return () => { style.remove() }
      }, 'session-unread: board css')

      const TriageBoard = ({ t }) => {
        const tr = React.useMemo(
          () => (typeof t === 'function' ? t : translate()),
          [t],
        )
        const sessions = useObservable(ctx.sessions.list)
        const workspaces = useObservable(ctx.workspaces.list)
        const statuses = useObservable(ctx.uiSession.sessionStatus)
        const unreadState = useObservable(unread)
        const triageState = useObservable(triage)
        const [query, setQuery] = React.useState('')
        const [workspaceFilter, setWorkspaceFilter] = React.useState('all')
        const [groupFilter, setGroupFilter] = React.useState('all')
        const [showClosed, setShowClosed] = React.useState(false)
        const [now, setNow] = React.useState(() => Date.now())

        React.useEffect(() => {
          const timer = window.setInterval(() => setNow(Date.now()), 60 * 1000)
          return () => { window.clearInterval(timer) }
        }, [])
        React.useEffect(() => { markBoardReload() }, [])

        const workspaceRows = React.useMemo(() => {
          const bySession = new Map()
          const options = []
          for (const item of workspaces.items) {
            options.push({ id: item.workspaceId, title: item.title })
            for (const id of item.sessionIds) bySession.set(id, item)
          }
          options.sort((a, b) => a.title.localeCompare(b.title))
          return { bySession, options }
        }, [workspaces])

        const allRows = React.useMemo(() => {
          const archived = new Set(workspaces.archivedSessionIds)
          const rows = []
          for (const id of sessions.ids) {
            const row = sessions.byId[id]
            if (row === undefined || row.blank === true || row.origin === 'subagent') continue
            if (archived.has(id)) continue
            const status = statuses.get(id)
            const entry = triageState[id]
            const level = entry === undefined ? undefined : entry.level
            const running = row.running === true
            const pending = status !== undefined && status.pendingInteraction != null
            const unreadFlag = (status !== undefined && status.completionUnread === true)
              || Object.prototype.hasOwnProperty.call(unreadState, id)
            const updatedAt = typeof row.updatedAt === 'number' ? row.updatedAt : now
            const age = now - updatedAt
            let group
            if (pending || level === 'red') group = 'red'
            else if (level === 'amber') group = 'amber'
            else if (running) group = 'running'
            else if (unreadFlag) group = 'amber'
            else if (level === 'green') {
              if (!showClosed) continue
              group = 'closed'
            } else if (age <= WEEK_MS) group = 'recent'
            else continue
            const workspace = workspaceRows.bySession.get(id)
            const workspaceTitle = workspace === undefined ? tr('board.noWorkspace') : workspace.title
            const title = row.displayTitle || row.title || id
            const bar = group === 'red' ? 'red'
              : group === 'amber' ? 'amber'
                : group === 'running' ? 'running'
                  : group === 'closed' ? 'green' : 'recent'
            rows.push({
              id, title, updatedAt, group, level, running, pending, unread: unreadFlag,
              workspaceId: workspace === undefined ? 'none' : workspace.workspaceId,
              workspaceTitle, bar,
              search: (title + ' ' + workspaceTitle).toLowerCase(),
            })
          }
          rows.sort((a, b) => {
            const groupDelta = GROUP_ORDER.indexOf(a.group) - GROUP_ORDER.indexOf(b.group)
            if (groupDelta !== 0) return groupDelta
            if (a.pending !== b.pending) return a.pending ? -1 : 1
            if (a.unread !== b.unread) return a.unread ? -1 : 1
            return b.updatedAt - a.updatedAt
          })
          return rows
        }, [sessions, workspaces, statuses, unreadState, triageState, now, showClosed, workspaceRows, tr])

        const matchingRows = React.useMemo(() => {
          const needle = query.trim().toLowerCase()
          return allRows.filter(row => {
            if (workspaceFilter !== 'all' && row.workspaceId !== workspaceFilter) return false
            if (needle !== '' && !row.search.includes(needle)) return false
            return true
          })
        }, [allRows, query, workspaceFilter])

        const counts = React.useMemo(() => {
          const result = { running: 0, red: 0, amber: 0, recent: 0, closed: 0 }
          for (const row of matchingRows) result[row.group] += 1
          return result
        }, [matchingRows])
        const activeCount = counts.running + counts.red + counts.amber + counts.recent

        const filtered = React.useMemo(() => (
          groupFilter === 'all'
            ? matchingRows
            : matchingRows.filter(row => row.group === groupFilter)
        ), [matchingRows, groupFilter])

        const hasFilters = query.trim() !== '' || workspaceFilter !== 'all' || groupFilter !== 'all' || showClosed
        const clearFilters = () => {
          setQuery('')
          setWorkspaceFilter('all')
          setGroupFilter('all')
          setShowClosed(false)
        }
        const open = (id) => {
          clearBoardReload()
          try {
            void Promise.resolve(ctx.uiWorkspace.openSession(id)).catch(() => {})
          } catch (_error) { /* the row stays open on failure */ }
        }
        const setLevel = (id, level) => {
          const entry = triage.get(id)
          if (entry !== undefined && entry.level === level) {
            triage.remove(id)
            return
          }
          triage.set(id, {
            level,
            reason: tr('reason.manual'),
            source: 'manual',
            updatedAt: Date.now(),
          })
        }
        const groupRows = (group) => filtered.filter(row => row.group === group)

        const chip = (id, label, count, dot) => h('button', {
          key: id,
          type: 'button',
          className: 'dsu-chip',
          'aria-pressed': groupFilter === id,
          onClick: () => setGroupFilter(id),
        },
        dot === null ? null : h('span', { className: 'dsu-dot ' + dot, 'aria-hidden': 'true' }),
        h('span', null, label),
        h('span', { className: 'dsu-chip-count' }, String(count)))

        const badge = (key, label, cls, withPulse) => h('span', {
          key, className: 'dsu-badge ' + cls,
        }, withPulse === true ? h('span', { className: 'dsu-pulse', 'aria-hidden': 'true' }) : null, label)

        const renderRow = (row) => {
          const badges = []
          if (row.running) badges.push(badge('running', tr('board.runBadge'), 'running', true))
          if (row.pending) badges.push(badge('pending', tr('board.pending'), 'red', false))
          if (row.level !== undefined && row.group === 'running') {
            badges.push(badge('level', tr('level.short.' + row.level), row.level, false))
          }
          return h('div', {
            key: row.id,
            className: 'dsu-row',
            role: 'button',
            tabIndex: 0,
            'data-session-id': row.id,
            'aria-label': tr('board.open') + ': ' + row.title,
            onClick: () => open(row.id),
            onKeyDown: (event) => {
              if (event.target !== event.currentTarget) return
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                open(row.id)
              }
            },
          },
          h('span', { className: 'dsu-row-bar ' + row.bar, 'aria-hidden': 'true' }),
          h('div', { className: 'dsu-row-main' },
            h('div', { className: 'dsu-row-title', title: row.title },
              h('span', { className: 'dsu-row-title-text' }, row.title),
              row.unread ? h('span', { className: 'dsu-badge unread dsu-title-unread' }, tr('board.unread')) : null),
            h('div', { className: 'dsu-row-meta' },
              h('span', { className: 'dsu-row-workspace', title: row.workspaceTitle }, row.workspaceTitle),
              h('span', { className: 'dsu-sep', 'aria-hidden': 'true' }, '·'),
              h('span', null, formatAge(row.updatedAt, now, tr)))),
          h('div', { className: 'dsu-row-badges' }, badges),
          h('div', { className: 'dsu-actions' }, LEVEL_IDS.map(level => {
            const pressed = row.level === level
            const title = pressed
              ? tr('board.clearStatus')
              : tr(level === 'red' ? 'board.markRed' : level === 'amber' ? 'board.markAmber' : 'board.markGreen')
            return h('button', {
              key: level,
              type: 'button',
              className: 'dsu-action ' + level,
              'aria-label': title,
              'aria-pressed': pressed,
              title,
              onClick: (event) => {
                event.stopPropagation()
                setLevel(row.id, level)
              },
            }, h('span', { className: 'dsu-dot', 'aria-hidden': 'true' }))
          })))
        }

        const groups = GROUP_ORDER
          .filter(group => group !== 'closed' || showClosed)
          .map(group => ({ group, rows: groupRows(group) }))
          .filter(entry => entry.rows.length > 0)
          .filter(entry => groupFilter === 'all' || entry.group === groupFilter)

        return h('div', { className: 'dsu-board' },
          h('div', { className: 'dsu-board-inner' },
            h('div', { className: 'dsu-head' },
              h('div', null,
                h('h1', { className: 'dsu-title' }, tr('board.title')),
                h('div', { className: 'dsu-sub' }, tr('board.active', { n: activeCount }))),
              hasFilters ? h('button', { type: 'button', className: 'dsu-link', onClick: clearFilters }, tr('board.clearFilters')) : null),
            h('div', { className: 'dsu-chips' },
              chip('all', tr('board.all'), activeCount, null),
              chip('running', tr('board.running'), counts.running, 'running'),
              chip('red', tr('board.red'), counts.red, 'red'),
              chip('amber', tr('board.amber'), counts.amber, 'amber'),
              chip('recent', tr('board.recent'), counts.recent, 'recent')),
            h('div', { className: 'dsu-toolbar' },
              h('input', {
                className: 'dsu-search',
                type: 'search',
                value: query,
                placeholder: tr('board.search'),
                'aria-label': tr('board.search'),
                onChange: (event) => setQuery(event.target.value),
              }),
              workspaceRows.options.length === 0 ? null : h('select', {
                className: 'dsu-select',
                value: workspaceFilter,
                'aria-label': tr('board.workspaceAll'),
                onChange: (event) => setWorkspaceFilter(event.target.value),
              },
              h('option', { value: 'all' }, tr('board.workspaceAll')),
              workspaceRows.options.map(option => h('option', { key: option.id, value: option.id }, option.title)),
              allRows.some(row => row.workspaceId === 'none')
                ? h('option', { value: 'none' }, tr('board.noWorkspace'))
                : null),
              h('button', {
                type: 'button',
                className: 'dsu-toggle',
                'aria-pressed': showClosed,
                onClick: () => setShowClosed(value => !value),
              },
              h('span', { className: 'dsu-check', 'aria-hidden': 'true' }, showClosed ? '✓' : ''),
              h('span', null, tr('board.showClosed') + (showClosed ? ' (' + counts.closed + ')' : '')))),
            groups.length === 0
              ? h('div', { className: 'dsu-empty' },
                h('div', { className: 'dsu-empty-title' }, tr(hasFilters ? 'board.noMatch' : 'board.empty')),
                h('div', { className: 'dsu-empty-hint' }, tr(hasFilters ? 'board.noMatchHint' : 'board.emptyHint')),
                hasFilters ? h('button', { type: 'button', className: 'dsu-link', onClick: clearFilters }, tr('board.clearFilters')) : null)
              : groups.map(entry => h('section', { key: entry.group, className: 'dsu-group' },
                h('div', { className: 'dsu-group-head' },
                  h('span', { className: 'dsu-dot ' + GROUP_META[entry.group].dot, 'aria-hidden': 'true' }),
                  h('span', { className: 'dsu-group-name' }, tr(GROUP_META[entry.group].label)),
                  h('span', { className: 'dsu-group-count' }, String(entry.rows.length))),
                h('div', { className: 'dsu-rows' }, entry.rows.map(renderRow))))))
      }

      /* Main view + sidebar entry; the key is the panel id, so clicking the
         entry opens the board. */
      ctx.slots.inject('main', () => ctx.slots.register({
        name: 'main',
        key: BOARD_ID,
        locale: NS,
      }, TriageBoard))
      ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
        name: 'sidebar.panellist',
        id: BOARD_ID,
        order: 8,
        label: () => translate()('board.title'),
      }, (props) => h(BoardIcon, { size: props?.size ?? 16 })))

      ctx.effect(() => {
        const clearOutside = (event) => {
          const board = document.querySelector('.dsu-board')
          const entry = typeof event.target?.closest === 'function'
            ? event.target.closest('button[aria-label]')
            : null
          if (entry !== null && entry.getAttribute('aria-label') === translate()('board.title')) return
          if (board === null || !board.contains(event.target)) clearBoardReload()
        }
        window.addEventListener('pointerdown', clearOutside, true)
        window.addEventListener('keydown', clearOutside, true)
        return () => {
          window.removeEventListener('pointerdown', clearOutside, true)
          window.removeEventListener('keydown', clearOutside, true)
        }
      }, 'session-triage: clear board marker outside the board')

      ctx.effect(() => {
        if (!readBoardReload()) return
        const layout = ctx.layout
        if (layout === undefined) return
        let cancelled = false
        const restore = () => {
          if (cancelled) return
          try {
            if (layout.panelInfo.getSnapshot().activePanelId === null) layout.selectPanel(BOARD_ID)
          } catch (_error) { /* entry not visible yet; leave the conversation */ }
        }
        const timer = setTimeout(restore, 0)
        return () => { cancelled = true; clearTimeout(timer) }
      }, 'session-triage: restore board after client reload')

    }

    return {
      name: 'dsh-session-triage',
      inject: ['slots', 'locale', 'sessions', 'contextMenus', 'workspaces', 'uiSession', 'shortcuts', 'uiWorkspace', 'layout'],
      apply,
    }
  },
})
