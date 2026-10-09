import { useSyncExternalStore } from 'react'
import { rankedProfile } from '../ranked/profile'
import { setAuth, social, type Auth, type MeProfile } from './api'

/**
 * Your name on the Feed and Leaderboards. No password and no email: claiming
 * a name gives you a recovery code, and the name + code is your login on
 * another device. The code stays in this browser so you don't have to type it.
 */
const KEY = 'rbr.account.v1'

export interface Account extends Auth {
  me: MeProfile | null
}

let account: Account | null = read()
setAuth(account)
const listeners = new Set<() => void>()

function read(): Account | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const a = JSON.parse(raw)
      if (typeof a?.name === 'string' && typeof a?.code === 'string') return { name: a.name, code: a.code, me: a.me ?? null }
    }
  } catch {
    /* ignore */
  }
  return null
}

function write(next: Account | null) {
  account = next
  setAuth(next ? { name: next.name, code: next.code } : null)
  try {
    if (next) localStorage.setItem(KEY, JSON.stringify(next))
    else localStorage.removeItem(KEY)
  } catch {
    /* ignore */
  }
  listeners.forEach((fn) => fn())
}

function adopt(me: MeProfile, confirmed: string[] = []) {
  if (!account) return
  write({ ...account, name: me.name, me })
  rankedProfile.setFromServer(me, confirmed)
}

export const accountStore = {
  get: () => account,
  subscribe(fn: () => void) {
    listeners.add(fn)
    return () => listeners.delete(fn)
  },
  /** Claim a name. This device's rank history is replayed on the server (placement still caps it at Breakout). */
  async claim(name: string) {
    const r = await social.claim(name.trim(), rankedProfile.localEvents())
    write({ name: r.me.name, code: r.code, me: r.me })
    rankedProfile.setFromServer(r.me, rankedProfile.get().pending.map((p) => p.id))
    return r.code
  },
  async restore(name: string, code: string) {
    setAuth({ name: name.trim(), code: code.trim().toUpperCase() })
    try {
      const r = await social.restore(name.trim(), code.trim().toUpperCase())
      write({ name: r.me.name, code: code.trim().toUpperCase(), me: r.me })
      rankedProfile.setFromServer(r.me)
    } catch (e) {
      setAuth(account)
      throw e
    }
  },
  signOut() {
    write(null)
  },
  /** Refresh from the server and send anything awarded while offline. */
  async refresh() {
    if (!account) return
    try {
      await flushPending()
      const r = await social.me()
      adopt(r.me)
    } catch {
      /* offline: keep the local copy */
    }
  },
}

let flushing: Promise<void> | null = null
function flushPending() {
  if (!flushing)
    flushing = (async () => {
      for (const e of [...rankedProfile.get().pending]) {
        const r = await social.rp(e)
        adopt(r.me, [e.id])
      }
    })().finally(() => (flushing = null))
  return flushing
}

// Signed in: every award also goes to the server, which recomputes it and has the final word.
rankedProfile.onAward((e) => {
  if (!account) return
  rankedProfile.queue(e)
  void flushPending().catch(() => {
    /* stays pending; retried on the next refresh */
  })
})

export function useAccount() {
  return useSyncExternalStore(accountStore.subscribe, accountStore.get, accountStore.get)
}
