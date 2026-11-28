/**
 * dsh-session-triage — Host 半片。
 *
 * 看板的标记（未读 / 红黄绿）、上一次看到的运行快照、以及运行中断记录
 * 都存在 $DSH_HOME/session-triage/state.json。这样它们不再绑在浏览器
 * 某个 origin 的 localStorage 上：重启 dsh web、换 http/https、换 IP 或
 * 主机名访问，标记都还在。
 *
 * 客户端通过 /session-triage/state 读写整份文档（GET / PUT），鉴权沿用
 * connection.requestRejection。
 */
import { chmod, mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

export const name = 'dsh-session-triage'
export const inject = ['webServer', 'connection']

const STATE_ROUTE = '/session-triage/state'
const HEALTH_ROUTE = '/session-triage/health'
const MAX_BODY = 512 * 1024
const MAX_ENTRIES = 500
const MAX_ID = 120
const MAX_TITLE = 200
const MAX_REASON = 120
const LEVELS = new Set(['red', 'amber', 'green'])

const EMPTY = () => ({ version: 1, savedAt: 0, unread: {}, seen: {}, triage: {}, running: {}, interrupted: {} })

function dshHome(env = process.env) {
  return env.DSH_HOME || join(homedir(), '.dsh')
}

function statePath() {
  return join(dshHome(), 'session-triage', 'state.json')
}

function text(value, limit) {
  return typeof value === 'string' ? value.slice(0, limit) : ''
}

function finite(value) {
  return typeof value === 'number' && Number.isFinite(value) ? Math.floor(value) : null
}

function isId(value) {
  return typeof value === 'string' && value.length > 0 && value.length <= MAX_ID
}

/** 按时间戳倒序裁剪，避免文档无限增长；空对象也接受。 */
function trim(record, stamp) {
  return Object.fromEntries(Object.entries(record)
    .sort((a, b) => stamp(b[1]) - stamp(a[1]))
    .slice(0, MAX_ENTRIES))
}

function normalize(raw) {
  const source = raw !== null && typeof raw === 'object' ? raw : {}
  const unread = {}
  for (const [id, at] of Object.entries(source.unread !== null && typeof source.unread === 'object' ? source.unread : {})) {
    const stamp = finite(at)
    if (!isId(id) || stamp === null) continue
    unread[id] = stamp
  }
  const seen = {}
  for (const [id, at] of Object.entries(source.seen !== null && typeof source.seen === 'object' ? source.seen : {})) {
    const stamp = finite(at)
    if (!isId(id) || stamp === null) continue
    seen[id] = stamp
  }
  const triage = {}
  for (const [id, value] of Object.entries(source.triage !== null && typeof source.triage === 'object' ? source.triage : {})) {
    if (!isId(id) || value === null || typeof value !== 'object' || !LEVELS.has(value.level)) continue
    triage[id] = {
      level: value.level,
      reason: text(value.reason, MAX_REASON),
      source: value.source === 'auto' ? 'auto' : 'manual',
      updatedAt: finite(value.updatedAt) ?? Date.now(),
    }
  }
  const running = {}
  for (const [id, value] of Object.entries(source.running !== null && typeof source.running === 'object' ? source.running : {})) {
    if (!isId(id) || value === null || typeof value !== 'object') continue
    running[id] = { title: text(value.title, MAX_TITLE), at: finite(value.at) ?? Date.now() }
  }
  const interrupted = {}
  for (const [id, value] of Object.entries(source.interrupted !== null && typeof source.interrupted === 'object' ? source.interrupted : {})) {
    if (!isId(id) || value === null || typeof value !== 'object') continue
    interrupted[id] = { title: text(value.title, MAX_TITLE), at: finite(value.at) ?? Date.now() }
  }
  return {
    version: 1,
    savedAt: Date.now(),
    unread: trim(unread, (at) => at),
    seen: trim(seen, (at) => at),
    triage: trim(triage, (entry) => entry.updatedAt),
    running: Object.fromEntries(Object.entries(running).slice(0, MAX_ENTRIES)),
    interrupted: trim(interrupted, (entry) => entry.at),
  }
}

async function readState() {
  try {
    const raw = await readFile(statePath(), 'utf8')
    return normalize(JSON.parse(raw))
  } catch (_error) {
    return EMPTY()
  }
}

let queue = Promise.resolve()

/** 原子写 + 600 权限；并发写入串行化，失败不阻塞后续写入。 */
function saveState(doc) {
  const write = async () => {
    const file = statePath()
    await mkdir(dirname(file), { recursive: true, mode: 0o700 })
    const temp = file + '.tmp'
    await writeFile(temp, JSON.stringify(doc, null, 2), { mode: 0o600 })
    await rename(temp, file)
    try { await chmod(file, 0o600) } catch (_error) { /* 权限已是目标值 */ }
    return doc.savedAt
  }
  queue = queue.then(write, write)
  return queue
}

function json(res, status, body, head = false) {
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('cache-control', 'no-store')
  if (head) return res.end()
  res.end(JSON.stringify(body))
}

async function readBody(req) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > MAX_BODY) throw Object.assign(new Error('内容太大'), { status: 413 })
    chunks.push(chunk)
  }
  return Buffer.concat(chunks).toString('utf8')
}

/** 与宿主其它插件一致：cookie/令牌由 connection 判定，未通过一律 401/403。 */
function rejection(ctx, req) {
  const connection = ctx.get('connection')
  if (typeof connection?.requestRejection !== 'function') return 403
  return connection.requestRejection({ headers: req.headers })
}

export function apply(ctx) {
  ctx.effect(() => ctx.webServer.register({
    kind: 'prefix',
    path: '/session-triage',
    handler: async (req, res) => {
      try {
        const denied = rejection(ctx, req)
        if (denied) return json(res, denied, { error: 'unauthorized' })
        const path = (req.url ?? '/').split('?')[0]
        if (path === HEALTH_ROUTE) {
          const doc = await readState()
          return json(res, 200, { ok: true, savedAt: doc.savedAt, unread: Object.keys(doc.unread).length, triage: Object.keys(doc.triage).length })
        }
        if (path === STATE_ROUTE) {
          if (req.method === 'GET' || req.method === 'HEAD') {
            return json(res, 200, await readState(), req.method === 'HEAD')
          }
          if (req.method !== 'PUT' && req.method !== 'POST') {
            return json(res, 405, { error: 'method not allowed' })
          }
          let parsed
          try {
            parsed = JSON.parse(await readBody(req))
          } catch (error) {
            if (error.status !== undefined) return json(res, error.status, { error: String(error.message) })
            return json(res, 400, { error: 'invalid json' })
          }
          const doc = normalize(parsed)
          await saveState(doc)
          return json(res, 200, { savedAt: doc.savedAt })
        }
        return json(res, 404, { error: 'not found' })
      } catch (error) {
        if (res.headersSent) { try { res.end() } catch (_error) { /* 已断开 */ } return }
        json(res, 500, { error: String(error?.message ?? error) })
      }
    },
  }))
}
