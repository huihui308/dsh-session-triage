/**
 * dsh-session-unread — Host half.
 *
 * All behavior lives in the browser half (client.js). This no-op Cordis plugin
 * exists so the package is a complete DSH bundle with one Loader entry; the web
 * client module table discovers the browser bundle through package.json's
 * `dsh.client` declaration and exports["./client"].
 */
export const name = 'dsh-session-unread'
export const inject = []
export function apply() {}
