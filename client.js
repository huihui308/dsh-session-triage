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
 *
 * Board state (unread / triage / last-seen running / interrupted) is mirrored
 * to the host half so a dsh web restart or an http/https switch keeps it.
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
    const RUNNING_KEY = 'dsh.session-triage.running.v1'
    const INTERRUPTED_KEY = 'dsh.session-triage.interrupted.v1'
    const SYNC_URL = '/session-triage/state'
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
      'settings.shortcut': '看板快捷键：{keys} · 在「键盘快捷键」里改',
      'settings.shortcut.unbound': '看板快捷键：未绑定 · 在「键盘快捷键」里录一个',
      'shortcut.nextUnread': '下一个未读会话',
      'shortcut.cycleTriage': '循环当前会话处理状态',
      'shortcut.board': '打开 / 返回会话看板',
      'board.title': '会话看板',
      'board.active': '未闭环 {n}',
      'board.all': '全部',
      'board.running': '运行中',
      'board.red': '待我处理',
      'board.amber': '待回看',
      'board.recent': '最近 7 天未标记',
      'board.interrupted': '运行中断',
      'board.interruptedBadge': '已中断',
      'board.schedule': '定时任务',
      'schedule.active': '已开启',
      'schedule.paused': '已暂停',
      'schedule.ended': '已结束',
      'schedule.pause': '暂停',
      'schedule.resume': '恢复',
      'schedule.run': '立即执行',
      'schedule.edit': '编辑 ↗',
      'schedule.delete': '删除',
      'schedule.confirmDelete': '确认删除',
      'schedule.running': '执行中',
      'schedule.toSession': '复用「{title}」',
      'schedule.newOnce': '首次投递新建会话',
      'schedule.newEach': '每次新建会话',
      'schedule.sessionGone': '目标会话已不存在',
      'schedule.empty': '没有定时任务',
      'schedule.emptyHint': '在 Automation tasks 里新建，或让 Agent 用 schedule_create 建一条。',
      'schedule.hint': '规则编辑在 Automation tasks 面板；这里只做查看和常用操作。',
      'schedule.unavailable': '定时任务服务不可用',
      'schedule.pauseDone': '已暂停',
      'schedule.resumeDone': '已恢复',
      'schedule.runDone': '已提交执行',
      'schedule.deleteDone': '已删除',
      'schedule.conflict': '这条任务刚在别处改过，已刷新',
      'schedule.pending': '上一次投递还在执行中',
      'schedule.failed': '操作失败，稍后再试',
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
      'settings.shortcut': 'Board shortcut: {keys} · change it under Keyboard shortcuts',
      'settings.shortcut.unbound': 'Board shortcut: not bound · record one under Keyboard shortcuts',
      'shortcut.nextUnread': 'Next unread session',
      'shortcut.cycleTriage': 'Cycle current session triage',
      'shortcut.board': 'Open / leave the session board',
      'board.title': 'Session board',
      'board.active': '{n} open',
      'board.all': 'All',
      'board.running': 'Running',
      'board.red': 'Needs me',
      'board.amber': 'Review',
      'board.recent': 'Untriaged · 7d',
      'board.interrupted': 'Ended mid-run',
      'board.interruptedBadge': 'Interrupted',
      'board.schedule': 'Scheduled',
      'schedule.active': 'Active',
      'schedule.paused': 'Paused',
      'schedule.ended': 'Ended',
      'schedule.pause': 'Pause',
      'schedule.resume': 'Resume',
      'schedule.run': 'Run now',
      'schedule.edit': 'Edit ↗',
      'schedule.delete': 'Delete',
      'schedule.confirmDelete': 'Confirm delete',
      'schedule.running': 'Delivering',
      'schedule.toSession': 'Reuses “{title}”',
      'schedule.newOnce': 'New session on first run',
      'schedule.newEach': 'New session every run',
      'schedule.sessionGone': 'Target session is gone',
      'schedule.empty': 'No scheduled tasks',
      'schedule.emptyHint': 'Create one in Automation tasks, or ask the Agent to run schedule_create.',
      'schedule.hint': 'Rules are edited in Automation tasks; this view covers reading and common actions.',
      'schedule.unavailable': 'Schedule service unavailable',
      'schedule.pauseDone': 'Paused',
      'schedule.resumeDone': 'Resumed',
      'schedule.runDone': 'Delivery queued',
      'schedule.deleteDone': 'Deleted',
      'schedule.conflict': 'Changed elsewhere meanwhile; refreshed',
      'schedule.pending': 'The previous delivery is still running',
      'schedule.failed': 'Action failed; try again',
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

    function normalizeRunMap(raw) {
      const now = Date.now()
      const entries = []
      for (const [id, value] of Object.entries(raw && typeof raw === 'object' ? raw : {})) {
        if (typeof id !== 'string' || id === '') continue
        if (value === null || typeof value !== 'object') continue
        const at = typeof value.at === 'number' && Number.isFinite(value.at) ? value.at : now
        if (now - at > MAX_AGE_MS) continue
        entries.push([id, {
          title: typeof value.title === 'string' ? value.title.slice(0, 200) : '',
          at,
        }])
      }
      entries.sort((a, b) => b[1].at - a[1].at)
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
        replace: (next) => {
          commit(next !== null && typeof next === 'object' ? next : {})
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
    const running = createMapStore(RUNNING_KEY, normalizeRunMap)
    const interrupted = createMapStore(INTERRUPTED_KEY, normalizeRunMap)
    const settings = createSettingsStore()

    /* Host-backed board state. The browser keeps localStorage as a fast cache,
       but the durable copy lives in $DSH_HOME/session-triage/state.json: a
       dsh web restart or an http/https/host change no longer wipes the marks. */
    let syncSavedAt = 0
    let syncError = ''
    let syncReady = false
    let syncTimer = null
    let syncPushing = false
    let syncDirty = false

    const boardState = () => ({
      version: 1,
      unread: unread.getSnapshot(),
      triage: triage.getSnapshot(),
      running: running.getSnapshot(),
      interrupted: interrupted.getSnapshot(),
    })

    /* Never write before the host copy has been adopted: a page that is still
       connecting has an empty Session list and would otherwise clobber the
       saved marks and the last-seen running set. */
    let boardAdopted = false

    function schedulePush() {
      syncDirty = true
      if (syncTimer !== null) return
      syncTimer = setTimeout(() => {
        syncTimer = null
        if (!boardAdopted) {
          schedulePush()
          return
        }
        void flushBoardState()
      }, 600)
    }

    /* Host schedule catalog, read and mutated through the client remote proxy.
       Empty until the board first asks; unavailable when ui-schedule is absent. */
    const scheduleStore = (() => {
      let snapshot = Object.freeze({ status: 'idle', records: [], notice: '', busy: {} })
      const listeners = new Set()
      const emit = () => { for (const listener of [...listeners]) listener() }
      return {
        getSnapshot: () => snapshot,
        subscribe: (listener) => {
          listeners.add(listener)
          return () => { listeners.delete(listener) }
        },
        set: (patch) => {
          snapshot = Object.freeze({ ...snapshot, ...patch })
          emit()
        },
      }
    })()

    async function flushBoardState() {
      if (syncPushing || !syncDirty) return
      syncDirty = false
      syncPushing = true
      try {
        const response = await fetch(SYNC_URL, {
          method: 'PUT',
          credentials: 'include',
          cache: 'no-store',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(boardState()),
        })
        if (response.ok) {
          const out = await response.json()
          if (typeof out.savedAt === 'number') syncSavedAt = out.savedAt
        }
      } catch (_error) {
        /* Host route missing or offline: localStorage stays authoritative. */
      } finally {
        syncPushing = false
        if (syncDirty) schedulePush()
      }
    }

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

    /** Settings -> General row: auto-suggest, triage-bar switches, and the
        board shortcut as currently bound (rebinding happens in the shared
        Keyboard shortcuts editor, so this line only points at it). */
    function SessionMarkSettings({ t, shortcuts }) {
      const current = React.useSyncExternalStore(settings.subscribe, settings.getSnapshot)
      const subscribeShortcuts = shortcuts === undefined ? (() => () => {}) : shortcuts.catalog.subscribe
      const readShortcuts = shortcuts === undefined ? (() => []) : shortcuts.catalog.getSnapshot
      const catalog = React.useSyncExternalStore(subscribeShortcuts, readShortcuts)
      const tr = typeof t === 'function' ? t : (key) => key
      const boardRow = Array.isArray(catalog) ? catalog.find(row => row.id === 'session-triage.board') : undefined
      const boardKeys = boardRow === undefined || !Array.isArray(boardRow.keys) ? '' : boardRow.keys.join('')
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
      }, tr('settings.description')),
      h('div', {
        style: { fontSize: '12px', lineHeight: '18px', color: 'var(--dsw-alias-label-tertiary)' },
      }, boardKeys === '' ? tr('settings.shortcut.unbound') : tr('settings.shortcut', { keys: boardKeys }))),
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
    const GROUP_ORDER = ['running', 'red', 'amber', 'interrupted', 'recent', 'closed']
    const GROUP_META = {
      running: { label: 'board.running', dot: 'running', bar: 'running' },
      red: { label: 'board.red', dot: 'red', bar: 'red' },
      amber: { label: 'board.amber', dot: 'amber', bar: 'amber' },
      interrupted: { label: 'board.interrupted', dot: 'interrupted', bar: 'amber' },
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
.dsu-dot.interrupted { background: transparent; box-shadow: inset 0 0 0 2px var(--dsw-alias-state-warn-primary, #f5a623); }
.dsu-dot.schedule { background: transparent; box-shadow: inset 0 0 0 2px var(--dsw-alias-state-business-primary, #4c6fff); }
.dsu-task-time { flex: none; min-width: 76px; white-space: nowrap; font-variant-numeric: tabular-nums; font-size: 12px; color: var(--dsw-alias-label-secondary); }
.dsu-task { align-items: center; }
.dsu-task .dsu-row-main { flex: 1; min-width: 0; }
.dsu-task-actions { opacity: 1; gap: 6px; }
.dsu-btn { font: inherit; font-size: 12px; height: 24px; padding: 0 9px; border: 1px solid var(--dsw-alias-border-l1, rgba(0,0,0,.12)); border-radius: 7px; background: var(--dsw-alias-bg-layer-1, #fff); color: var(--dsw-alias-label-secondary); cursor: pointer; white-space: nowrap; }
.dsu-btn:hover { background: var(--dsw-alias-interactive-bg-hover, rgba(0,0,0,.04)); }
.dsu-btn:disabled { opacity: .45; cursor: default; }
.dsu-btn.danger { color: var(--dsw-alias-state-error-primary, #e5484d); }
.dsu-task-chip { color: var(--dsw-alias-state-business-primary, #4c6fff); font-variant-numeric: tabular-nums; white-space: nowrap; }
.dsu-task-running { color: var(--dsw-alias-state-business-primary, #4c6fff); }
.dsu-sched-notice { margin: 0 0 10px; padding: 8px 12px; border-radius: 8px; background: var(--dsw-alias-bg-layer-2, rgba(0,0,0,.06)); color: var(--dsw-alias-label-secondary); font-size: 12px; }
.dsu-sched-hint { margin-top: 14px; color: var(--dsw-alias-label-tertiary); font-size: 12px; }
@media (max-width: 720px) { .dsu-task-actions { flex-wrap: wrap; } .dsu-task-time { width: auto; } }
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

      /** Runs we recorded as started but never saw finish were killed by a
          restart; surface them instead of letting them slide into the backlog. */
      const adoptRunning = (doc) => {
        let list
        try { list = ctx.sessions.list.getSnapshot() } catch (_error) { return }
        if (list.ids.length === 0) return
        const leftovers = new Map()
        for (const [id, entry] of Object.entries(running.getSnapshot())) leftovers.set(id, entry)
        for (const [id, entry] of Object.entries(doc.running !== null && typeof doc.running === 'object' ? doc.running : {})) {
          if (!leftovers.has(id)) leftovers.set(id, entry)
        }
        for (const [id, entry] of leftovers) {
          const row = list.byId[id]
          const status = statusOf(id)
          const live = (status !== undefined && status !== null && status.running === true)
            || (row !== undefined && row.running === true)
          if (live) continue
          running.remove(id)
          if (row === undefined || row.blank === true || row.origin === 'subagent' || isArchived(id)) continue
          const updatedAt = typeof row.updatedAt === 'number' ? row.updatedAt : 0
          // A run that ended after our last snapshot finished on its own.
          if (syncSavedAt > 0 && updatedAt > syncSavedAt + 2000) continue
          interrupted.set(id, {
            title: row.displayTitle || row.title || entry.title || id,
            at: Date.now(),
          })
        }
        if (Object.keys(interrupted.getSnapshot()).length > 0) schedulePush()
      }

      /** Adopt the host copy of the board state; localStorage stays the fallback. */
      const loadBoardState = async () => {
        let doc = {}
        try {
          const response = await fetch(SYNC_URL, { credentials: 'include', cache: 'no-store' })
          if (response.ok) {
            const parsed = await response.json()
            if (parsed !== null && typeof parsed === 'object') doc = parsed
          }
        } catch (_error) {
          /* Host route missing (older host half) or offline. */
        }
        if (doc.savedAt !== undefined) syncSavedAt = typeof doc.savedAt === 'number' ? doc.savedAt : 0
        const remoteUnread = doc.unread !== null && typeof doc.unread === 'object' ? doc.unread : {}
        const remoteTriage = doc.triage !== null && typeof doc.triage === 'object' ? doc.triage : {}
        const hasRemote = Object.keys(remoteUnread).length > 0 || Object.keys(remoteTriage).length > 0
        let migrated = false
        if (hasRemote) {
          unread.replace(remoteUnread)
          triage.replace(remoteTriage)
        } else if (Object.keys(unread.getSnapshot()).length > 0 || Object.keys(triage.getSnapshot()).length > 0) {
          // One-time migration for installs that only ever wrote localStorage.
          migrated = true
        }
        adoptRunning(doc)
        return migrated
      }

      /* --- host schedule catalog ------------------------------------------- */
      const scheduleRemote = () => {
        try {
          if (ctx.remote?.schedule !== undefined) return ctx.remote.schedule
        } catch (_error) { /* remote not injected */ }
        try {
          if (typeof ctx.get === 'function') {
            const remote = ctx.get('remote')
            if (remote !== undefined && remote !== null && remote.schedule !== undefined) return remote.schedule
          }
        } catch (_error) { /* remote service not mounted */ }
        return undefined
      }

      const refreshSchedules = async () => {
        const api = scheduleRemote()
        if (api === undefined) {
          scheduleStore.set({ status: 'unavailable' })
          return
        }
        if (scheduleStore.getSnapshot().status !== 'ready') scheduleStore.set({ status: 'loading' })
        try {
          const result = await api.catalog()
          if (result === undefined || result === null || result.ok !== true) {
            scheduleStore.set({ status: 'error' })
            return
          }
          scheduleStore.set({
            status: 'ready',
            records: Array.isArray(result.value) ? result.value : [],
          })
        } catch (_error) {
          scheduleStore.set({ status: 'error' })
        }
      }

      const scheduleBusy = (id, busy) => {
        const next = { ...scheduleStore.getSnapshot().busy }
        if (busy) next[id] = true
        else delete next[id]
        scheduleStore.set({ busy: next })
      }

      const scheduleAction = async (record, kind) => {
        const api = scheduleRemote()
        if (api === undefined) return
        const t = translate()
        scheduleBusy(record.id, true)
        try {
          let result
          if (kind === 'pause' || kind === 'resume') {
            result = await api.edit({
              id: record.id,
              action: 'update',
              patch: { active: kind === 'resume' },
              expectedUpdatedAt: record.updatedAt ?? null,
            })
          } else if (kind === 'delete') {
            result = await api.edit({ id: record.id, action: 'delete', expectedUpdatedAt: record.updatedAt ?? null })
          } else {
            result = await api.run({ id: record.id })
          }
          const code = result !== undefined && result !== null && result.ok === true
            ? undefined
            : result?.error?.code
          if (code === 'schedule_conflict') scheduleStore.set({ notice: t('schedule.conflict') })
          else if (code === 'schedule_execution_pending') scheduleStore.set({ notice: t('schedule.pending') })
          else if (code === 'schedule_not_found') { scheduleStore.set({ notice: t('schedule.failed') }) }
          else if (code !== undefined) scheduleStore.set({ notice: t('schedule.failed') })
          else scheduleStore.set({ notice: t('schedule.' + kind + 'Done') })
        } catch (_error) {
          scheduleStore.set({ notice: t('schedule.failed') })
        } finally {
          scheduleBusy(record.id, false)
          void refreshSchedules()
        }
      }

      /* Load once the board exists, and follow host-side changes. */
      ctx.effect(() => {
        void refreshSchedules()
        let disposeEvent = () => {}
        try {
          const remote = typeof ctx.get === 'function' ? ctx.get('remote') : undefined
          const dispose = remote?.$on?.('schedule/changed', () => { void refreshSchedules() })
          if (typeof dispose === 'function') disposeEvent = dispose
        } catch (_error) { /* event bridge missing */ }
        return () => { disposeEvent() }
      }, 'session-triage: schedule catalog')

      /* Load once the Session list is real, then mirror local changes (debounced). */
      let adopted = false
      let attempts = 0
      const tryAdopt = async () => {
        if (adopted) return
        let list
        try { list = ctx.sessions.list.getSnapshot() } catch (_error) { list = undefined }
        if (list === undefined || list.ids.length === 0) {
          attempts += 1
          if (attempts < 40) setTimeout(() => { void tryAdopt() }, 500)
          return
        }
        let migrated = false
        try {
          migrated = await loadBoardState()
        } catch (error) {
          syncError = String(error?.message ?? error)
        }
        adopted = true
        boardAdopted = true
        if (migrated || syncDirty) schedulePush()
      }
      ctx.effect(() => {
        const disposers = [
          unread.subscribe(schedulePush),
          triage.subscribe(schedulePush),
          running.subscribe(schedulePush),
          interrupted.subscribe(schedulePush),
        ]
        const timer = setTimeout(() => { void tryAdopt() }, 0)
        return () => {
          clearTimeout(timer)
          for (const dispose of disposers) dispose()
        }
      }, 'session-triage: host-backed state')

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
        const changed = next !== undefined && next !== previousCurrent
        if (changed) {
          if (unread.has(next)) unread.remove(next)
          /* A Session that was already open when the process died must keep its
             interrupted mark; only actually opening it again clears it. */
          if (previousCurrent !== undefined && interrupted.has(next)) interrupted.remove(next)
        }
        previousCurrent = next
      }
      ctx.effect(() => {
        const dispose = ctx.sessions.list.subscribe(syncOpen)
        syncOpen()
        return dispose
      }, 'session-unread: clear on open')

      /* A run that ends while the board is the active surface can come back
         from the host with completionUnread=false: the board is treated as
         "seen" even though the user never opened the session. Track the
         running -> idle edge ourselves and keep that result unread. */
      let previousRuns = null
      const boardIsActive = () => {
        try {
          return ctx.layout.panelInfo.getSnapshot().activePanelId === BOARD_ID
        } catch (_error) {
          return false
        }
      }
      const syncRuns = () => {
        let list
        try {
          list = ctx.sessions.list.getSnapshot()
        } catch (_error) {
          return
        }
        if (list.ids.length === 0) return
        const current = currentSessionId(list)
        const boardActive = boardIsActive()
        const next = new Map()
        for (const id of list.ids) {
          const row = list.byId[id]
          if (row === undefined || row.blank === true || row.origin === 'subagent') continue
          const status = statusOf(id)
          const isRunning = status !== undefined && status !== null && typeof status.running === 'boolean'
            ? status.running === true
            : row.running === true
          next.set(id, isRunning)
          /* Keep the last-seen running set for the next load to compare against. */
          if (isRunning) {
            if (!running.has(id)) {
              running.set(id, { title: row.displayTitle || row.title || id, at: Date.now() })
            }
            if (interrupted.has(id)) interrupted.remove(id)
          } else if (adopted && running.has(id)) {
            running.remove(id)
          }
          if (previousRuns === null) continue
          if (previousRuns.get(id) !== true || isRunning) continue
          if (isArchived(id)) continue
          const entry = triage.getSnapshot()[id]
          if (entry !== undefined && entry !== null && entry.level === 'green') continue
          if (boardActive || current !== id) {
            if (!unread.has(id)) unread.set(id, Date.now())
          }
        }
        previousRuns = next
      }
      ctx.effect(() => {
        const disposeSessions = ctx.sessions.list.subscribe(syncRuns)
        const disposeStatus = ctx.uiSession.sessionStatus.subscribe(syncRuns)
        syncRuns()
        return () => {
          disposeSessions()
          disposeStatus()
        }
      }, 'session-unread: fallback completion unread')

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
                interrupted.remove(sessionId)
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
        }, (props) => h(SessionMarkSettings, { ...props, shortcuts: ctx.shortcuts }))
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
      /* Board command: toggles the cross-workspace board and returns to the
         panel it covered. Web only admits Mod+Alt on Windows/macOS; Linux Web
         spends its three slots (Mod+/, Mod+Shift+, Mod+Shift+.) on core and
         earlier plugin commands, so the default is declared for Desktop and
         Windows/macOS Web only — Linux Web keeps the command, unbound. */
      const boardBinding = { code: 'KeyL', modifiers: ['primary', 'alt'] }
      const boardDefaults = {
        'desktop:macos': boardBinding,
        'desktop:windows': boardBinding,
        'desktop:linux': boardBinding,
        'web:windows': boardBinding,
        'web:macos': boardBinding,
      }
      /** Panel that the board covered, so the toggle restores it instead of
          always dumping the user on the Conversation. */
      let boardReturn = null
      /** The board commits a frame after selectPanel; retry a few frames so
          the keyboard lands in the search field instead of nowhere. */
      const focusBoardSearch = (attempt = 0) => {
        const search = document.querySelector('.dsu-board .dsu-search')
        if (search !== null) { search.focus(); return }
        if (attempt < 8) window.requestAnimationFrame(() => focusBoardSearch(attempt + 1))
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
                  interrupted.remove(current)
                },
              }
            },
          }),
          registerShortcut({
            id: 'session-triage.board',
            label: () => translate()('shortcut.board'),
            aliases: ['session board', 'board', '会话看板', '看板'],
            defaults: boardDefaults,
            regions: ['page', 'editable'],
            modals: [],
            resolve: () => {
              const layout = ctx.layout
              if (layout === undefined) return { status: 'blocked', reason: 'no-board' }
              const active = layout.panelInfo.getSnapshot().activePanelId
              return {
                status: 'handled',
                run: () => {
                  if (active === BOARD_ID) {
                    clearBoardReload()
                    const back = boardReturn
                    boardReturn = null
                    try { layout.selectPanel(back) } catch (_error) { layout.selectPanel(null) }
                    return
                  }
                  boardReturn = active
                  try {
                    layout.selectPanel(BOARD_ID)
                  } catch (_error) {
                    boardReturn = null
                    return
                  }
                  window.requestAnimationFrame(() => focusBoardSearch())
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
        const interruptedState = useObservable(interrupted)
        const scheduleState = useObservable(scheduleStore)
        const [deleteConfirm, setDeleteConfirm] = React.useState(null)
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

        const scheduleRecords = React.useMemo(
          () => (Array.isArray(scheduleState.records) ? scheduleState.records : []),
          [scheduleState.records],
        )
        const visibleTasks = React.useMemo(() => {
          const rank = (record) => record.status === 'active' ? 0 : record.status === 'paused' ? 1 : 2
          const when = (record) => {
            const at = typeof record.scheduledAt === 'string' ? Date.parse(record.scheduledAt) : Number.NaN
            return Number.isFinite(at) ? at : Number.MAX_SAFE_INTEGER
          }
          return scheduleRecords
            .filter(record => showClosed || record.status !== 'ended')
            .slice()
            .sort((a, b) => rank(a) - rank(b) || when(a) - when(b))
        }, [scheduleRecords, showClosed])
        const scheduleCount = scheduleRecords.filter(record => record.status !== 'ended').length
        const taskBySession = React.useMemo(() => {
          const map = new Map()
          for (const record of scheduleRecords) {
            const target = record.target
            const sessionId = target !== null && typeof target === 'object' ? target.sessionId : undefined
            if (typeof sessionId !== 'string') continue
            const list = map.get(sessionId)
            if (list === undefined) map.set(sessionId, [record])
            else list.push(record)
          }
          return map
        }, [scheduleRecords])

        const formatTaskTime = (iso) => {
          if (typeof iso !== 'string') return '—'
          const at = Date.parse(iso)
          if (!Number.isFinite(at)) return '—'
          const date = new Date(at)
          const hh = String(date.getHours()).padStart(2, '0')
          const mm = String(date.getMinutes()).padStart(2, '0')
          const today = new Date(now)
          const sameDay = date.getFullYear() === today.getFullYear()
            && date.getMonth() === today.getMonth()
            && date.getDate() === today.getDate()
          return sameDay ? hh + ':' + mm : (date.getMonth() + 1) + '-' + date.getDate() + ' ' + hh + ':' + mm
        }

        const describeTarget = (target) => {
          if (target === null || typeof target !== 'object') return tr('schedule.newEach')
          if (target.kind === 'session') {
            const row = sessions.byId[target.sessionId]
            const title = row === undefined ? undefined : (row.displayTitle || row.title || target.sessionId)
            return title === undefined ? tr('schedule.sessionGone') : tr('schedule.toSession', { title: String(title).slice(0, 36) })
          }
          return target.kind === 'new_once' ? tr('schedule.newOnce') : tr('schedule.newEach')
        }

        const openSchedulesPanel = () => {
          try { ctx.layout.selectPanel('schedules') } catch (_error) { /* official panel missing */ }
        }

        /* Transient notice from a schedule action; hides itself. */
        React.useEffect(() => {
          if (scheduleState.notice === '') return undefined
          const timer = window.setTimeout(() => scheduleStore.set({ notice: '' }), 4000)
          return () => { window.clearTimeout(timer) }
        }, [scheduleState.notice])

        const allRows = React.useMemo(() => {
          const archived = new Set(workspaces.archivedSessionIds)
          const rows = []
          for (const id of sessions.ids) {
            const row = sessions.byId[id]
            const interruptedEntry = interruptedState[id]
            if (row === undefined || row.origin === 'subagent') continue
            // A run that died before its first turn is blank; keep it anyway.
            if (row.blank === true && interruptedEntry === undefined) continue
            if (archived.has(id)) continue
            const status = statuses.get(id)
            const entry = triageState[id]
            const level = entry === undefined ? undefined : entry.level
            const running = row.running === true
            const pending = status !== undefined && status.pendingInteraction != null
            const unreadFlag = (status !== undefined && status.completionUnread === true)
              || Object.prototype.hasOwnProperty.call(unreadState, id)
            const interruptedFlag = interruptedEntry !== undefined && !running
            const updatedAt = typeof row.updatedAt === 'number'
              ? row.updatedAt
              : interruptedEntry !== undefined ? interruptedEntry.at : now
            const age = now - updatedAt
            let group
            if (pending || level === 'red') group = 'red'
            else if (level === 'amber') group = 'amber'
            else if (interruptedFlag) group = 'interrupted'
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
                : group === 'interrupted' ? 'amber'
                  : group === 'running' ? 'running'
                    : group === 'closed' ? 'green' : 'recent'
            const tasks = taskBySession.get(id) ?? []
            const nextTask = tasks.find(task => task.status === 'active')
            rows.push({
              id, title, updatedAt, group, level, running, pending, unread: unreadFlag,
              interrupted: interruptedFlag, tasks, taskAt: nextTask === undefined ? undefined : nextTask.scheduledAt,
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
        }, [sessions, workspaces, statuses, unreadState, triageState, interruptedState, taskBySession, now, showClosed, workspaceRows, tr])

        const matchingRows = React.useMemo(() => {
          const needle = query.trim().toLowerCase()
          return allRows.filter(row => {
            if (workspaceFilter !== 'all' && row.workspaceId !== workspaceFilter) return false
            if (needle !== '' && !row.search.includes(needle)) return false
            return true
          })
        }, [allRows, query, workspaceFilter])

        const counts = React.useMemo(() => {
          const result = { running: 0, red: 0, amber: 0, interrupted: 0, recent: 0, closed: 0 }
          for (const row of matchingRows) result[row.group] += 1
          return result
        }, [matchingRows])
        const activeCount = counts.running + counts.red + counts.amber + counts.interrupted + counts.recent

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
          interrupted.remove(id)
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
          if (row.interrupted) badges.push(badge('interrupted', tr('board.interruptedBadge'), 'amber', false))
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
              h('span', null, formatAge(row.updatedAt, now, tr)),
              row.tasks.length === 0 ? null : h(React.Fragment, null,
                h('span', { className: 'dsu-sep', 'aria-hidden': 'true' }, '·'),
                h('span', {
                  className: 'dsu-task-chip',
                  title: row.tasks.map(task => task.title).join(' · '),
                }, '⏱ ' + (row.taskAt === undefined ? tr('schedule.paused') : formatTaskTime(row.taskAt)))))),
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

        const renderTask = (record) => {
          const busy = scheduleState.busy[record.id] === true
          const active = record.status === 'active'
          const paused = record.status === 'paused'
          const ended = record.status === 'ended'
          const confirming = deleteConfirm === record.id
          const button = (key, label, onClick, danger = false) => h('button', {
            key,
            type: 'button',
            className: 'dsu-btn' + (danger ? ' danger' : ''),
            disabled: busy,
            onClick: (event) => { event.stopPropagation(); onClick() },
          }, label)
          return h('div', { key: record.id, className: 'dsu-row dsu-task', 'data-task-id': record.id },
            h('span', { className: 'dsu-task-time' }, ended ? '—' : formatTaskTime(record.scheduledAt)),
            h('div', { className: 'dsu-row-main' },
              h('div', { className: 'dsu-row-title', title: typeof record.title === 'string' ? record.title : '' },
                h('span', { className: 'dsu-row-title-text' }, record.title || record.id)),
              h('div', { className: 'dsu-row-meta' },
                h('span', null, describeTarget(record.target)),
                record.executionActive === true
                  ? h('span', { className: 'dsu-task-running' }, tr('schedule.running'))
                  : null)),
            h('span', { className: 'dsu-badge ' + (active ? 'green' : paused ? 'amber' : '') },
              tr(active ? 'schedule.active' : paused ? 'schedule.paused' : 'schedule.ended')),
            h('div', { className: 'dsu-actions dsu-task-actions' },
              active || paused
                ? button('toggle', tr(active ? 'schedule.pause' : 'schedule.resume'), () => { void scheduleAction(record, active ? 'pause' : 'resume') })
                : null,
              active
                ? button('run', tr('schedule.run'), () => { void scheduleAction(record, 'run') })
                : null,
              button('edit', tr('schedule.edit'), () => { openSchedulesPanel() }),
              button('delete', confirming ? tr('schedule.confirmDelete') : tr('schedule.delete'), () => {
                if (confirming) {
                  setDeleteConfirm(null)
                  void scheduleAction(record, 'delete')
                  return
                }
                setDeleteConfirm(record.id)
                window.setTimeout(() => {
                  setDeleteConfirm(current => (current === record.id ? null : current))
                }, 4000)
              }, true)))
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
              chip('interrupted', tr('board.interrupted'), counts.interrupted, 'interrupted'),
              scheduleState.status === 'unavailable' ? null : chip('schedule', tr('board.schedule'), scheduleCount, 'schedule'),
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
            groupFilter === 'schedule'
              ? h('div', { className: 'dsu-sched-list' },
                scheduleState.notice === '' ? null : h('div', { className: 'dsu-sched-notice' }, scheduleState.notice),
                scheduleState.status === 'unavailable'
                  ? h('div', { className: 'dsu-empty' }, h('div', { className: 'dsu-empty-title' }, tr('schedule.unavailable')))
                  : visibleTasks.length === 0
                    ? h('div', { className: 'dsu-empty' },
                      h('div', { className: 'dsu-empty-title' }, tr('schedule.empty')),
                      h('div', { className: 'dsu-empty-hint' }, tr('schedule.emptyHint')))
                    : visibleTasks.map(renderTask),
                h('div', { className: 'dsu-sched-hint' }, tr('schedule.hint')))
              : groups.length === 0
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
      inject: ['slots', 'locale', 'sessions', 'contextMenus', 'workspaces', 'uiSession', 'shortcuts', 'uiWorkspace', 'layout', 'remote', 'remote.schedule'],
      apply,
    }
  },
})
