import {
  lazy,
  useEffect,
  useSyncExternalStore,
  type AnchorHTMLAttributes,
  type ComponentType,
  type MouseEvent,
} from "react"

export interface Route {
  readonly path: string
  readonly title: string
  readonly group: string
  readonly Page: ComponentType
}

const page = (load: () => Promise<{ default: ComponentType }>) => lazy(load)

// Each page is its own chunk; the home page and the layout load first.
export const routes: readonly Route[] = [
  { path: "/", title: "Overview", group: "Start", Page: page(() => import("./pages/Home")) },
  {
    path: "/getting-started",
    title: "Getting started",
    group: "Start",
    Page: page(() => import("./pages/GettingStarted")),
  },
  { path: "/fields", title: "Fields", group: "Guide", Page: page(() => import("./pages/Fields")) },
  { path: "/panel", title: "The panel", group: "Guide", Page: page(() => import("./pages/Panel")) },
  {
    path: "/reacting",
    title: "Reacting to changes",
    group: "Guide",
    Page: page(() => import("./pages/Reacting")),
  },
  {
    path: "/theming",
    title: "Theming and tokens",
    group: "Guide",
    Page: page(() => import("./pages/Theming")),
  },
  {
    path: "/production",
    title: "Production builds",
    group: "Guide",
    Page: page(() => import("./pages/Production")),
  },
  {
    path: "/adapters",
    title: "Adapters",
    group: "Reference",
    Page: page(() => import("./pages/Adapters")),
  },
  {
    path: "/remote",
    title: "Remote and Swift",
    group: "Reference",
    Page: page(() => import("./pages/Remote")),
  },
  {
    path: "/full-page",
    title: "Full page",
    group: "Reference",
    Page: page(() => import("./pages/FullPage")),
  },
  {
    path: "/examples",
    title: "Examples",
    group: "Reference",
    Page: page(() => import("./pages/Examples")),
  },
]

const listeners = new Set<() => void>()
const subscribe = (cb: () => void) => {
  listeners.add(cb)
  addEventListener("popstate", cb)
  return () => {
    listeners.delete(cb)
    removeEventListener("popstate", cb)
  }
}
const normalize = (path: string) => (path.length > 1 ? path.replace(/\/+$/, "") : path)

export function usePath() {
  return useSyncExternalStore(
    subscribe,
    () => normalize(location.pathname),
    () => "/",
  )
}

export function navigate(href: string) {
  const url = new URL(href, location.href)
  if (url.origin !== location.origin) return void location.assign(href)
  const samePage = normalize(url.pathname) === normalize(location.pathname)
  history.pushState(null, "", url.pathname + url.hash)
  for (const cb of listeners) cb()
  if (url.hash) requestAnimationFrame(() => scrollToHash(url.hash))
  else if (!samePage) scrollTo({ top: 0 })
}

export function scrollToHash(hash: string) {
  const target = document.getElementById(decodeURIComponent(hash.slice(1)))
  target?.scrollIntoView({ block: "start" })
}

export const findRoute = (path: string) => routes.find((r) => r.path === path)

/** Restores the hash target after a lazy page renders. */
export function useHashScroll(ready: boolean) {
  useEffect(() => {
    if (ready && location.hash.length > 1) scrollToHash(location.hash)
  }, [ready])
}

/** An in-app link: client-side navigation for site paths, a normal link for everything else. */
export function Link({ href, onClick, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement>) {
  const click = (event: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(event)
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey ||
      !href ||
      /^(https?:|mailto:)/.test(href) ||
      href.startsWith("/examples/")
    )
      return
    event.preventDefault()
    navigate(href)
  }
  return <a href={href} onClick={click} {...rest} />
}
