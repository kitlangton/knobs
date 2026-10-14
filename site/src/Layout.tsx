import { Suspense, useEffect, useLayoutEffect, useState } from "react"
import { useControls } from "knobs/react"
import { findRoute, Link, routes, useHashScroll, usePath } from "./router"
import { applySite, resolvedTheme, site } from "./site"
import { TuneButton } from "./SitePanel"

const groups = [...new Set(routes.map((r) => r.group))]

function Nav({ path, onNavigate }: { path: string; onNavigate?: () => void }) {
  return (
    <nav aria-label="Documentation">
      {groups.map((group) => (
        <div className="nav-group" key={group}>
          <p>{group}</p>
          <ul>
            {routes
              .filter((r) => r.group === group)
              .map((r) => (
                <li key={r.path}>
                  <Link
                    href={r.path}
                    aria-current={r.path === path ? "page" : undefined}
                    onClick={onNavigate}
                  >
                    {r.title}
                  </Link>
                </li>
              ))}
          </ul>
        </div>
      ))}
    </nav>
  )
}

interface Heading {
  id: string
  text: string
}

/** The on-page contents: every section heading, with the one being read marked. */
function Toc({ path, ready }: { path: string; ready: boolean }) {
  const [headings, setHeadings] = useState<Heading[]>([])
  const [active, setActive] = useState("")
  useEffect(() => {
    if (!ready) return
    const nodes = [...document.querySelectorAll<HTMLElement>("main section[data-toc] > h2[id]")]
    setHeadings(nodes.map((n) => ({ id: n.id, text: n.textContent ?? "" })))
    const visible = new Map<string, boolean>()
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) visible.set(e.target.id, e.isIntersecting)
        const first = nodes.find((n) => visible.get(n.id))
        if (first) setActive(first.id)
      },
      { rootMargin: "-64px 0px -55% 0px" },
    )
    for (const n of nodes) io.observe(n)
    return () => io.disconnect()
  }, [path, ready])
  if (headings.length < 2) return <aside className="toc" aria-hidden="true" />
  return (
    <aside className="toc" aria-label="On this page">
      <p>On this page</p>
      <ul>
        {headings.map((h) => (
          <li key={h.id}>
            <a href={`#${h.id}`} aria-current={h.id === active ? "true" : undefined}>
              {h.text}
            </a>
          </li>
        ))}
      </ul>
    </aside>
  )
}

function ThemeToggle() {
  const v = useControls(site)
  const dark = resolvedTheme(v) === "dark"
  return (
    <button
      type="button"
      className="icon-button"
      aria-label={dark ? "Use the light theme" : "Use the dark theme"}
      onClick={() => site.set({ theme: dark ? "light" : "dark" })}
    >
      <svg viewBox="0 0 16 16" aria-hidden="true">
        {dark ? (
          <>
            <circle cx="8" cy="8" r="3" />
            <path d="M8 1.5v1.5M8 13v1.5M1.5 8H3M13 8h1.5M3.4 3.4l1 1M11.6 11.6l1 1M3.4 12.6l1-1M11.6 4.4l1-1" />
          </>
        ) : (
          <path d="M13.5 9.6A5.6 5.6 0 0 1 6.4 2.5a5.6 5.6 0 1 0 7.1 7.1Z" />
        )}
      </svg>
    </button>
  )
}

function Page({ path, onReady }: { path: string; onReady: () => void }) {
  const route = findRoute(path)
  useEffect(() => {
    document.title = route && route.path !== "/" ? `${route.title} · knobs` : "knobs"
    onReady()
  }, [route, onReady])
  if (!route) return <NotFound />
  return <route.Page />
}

function NotFound() {
  return (
    <section className="sec" data-in="">
      <h1 className="sec-title page-title">Not found</h1>
      <div className="sec-body">
        <p>
          There's no page at this address. The <Link href="/">overview</Link> links to everything.
        </p>
      </div>
    </section>
  )
}

export function Layout() {
  const path = usePath()
  const v = useControls(site)
  const [menu, setMenu] = useState(false)
  const [readyPath, setReadyPath] = useState("")
  const ready = readyPath === path
  useHashScroll(ready)

  useLayoutEffect(() => applySite(v), [v])
  useEffect(() => {
    if (v.theme !== "auto") return
    const media = matchMedia("(prefers-color-scheme: dark)")
    const sync = () => applySite(site.get())
    media.addEventListener("change", sync)
    return () => media.removeEventListener("change", sync)
  }, [v.theme])
  useEffect(() => setMenu(false), [path])

  const index = routes.findIndex((r) => r.path === path)
  const prev = routes[index - 1]
  const next = routes[index + 1]

  return (
    <div className="shell" data-menu={menu ? "open" : "closed"}>
      <header className="topbar">
        <button
          type="button"
          className="icon-button menu-button"
          aria-label="Menu"
          aria-expanded={menu}
          onClick={() => setMenu((m) => !m)}
        >
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path d={menu ? "M4 4l8 8M12 4l-8 8" : "M2.5 5h11M2.5 11h11"} />
          </svg>
        </button>
        <Link href="/" className="wordmark">
          <svg viewBox="0 0 20 20" aria-hidden="true">
            <rect x="1" y="1" width="18" height="18" rx="5.5" />
            <path d="M5.5 7.5h9M5.5 12.5h9" />
            <circle cx="12" cy="7.5" r="2" />
            <circle cx="8" cy="12.5" r="2" />
          </svg>
          knobs
        </Link>
        <span className="topbar-space" />
        <a className="topbar-link" href="https://github.com/kitlangton/knobs">
          GitHub
        </a>
        <ThemeToggle />
        <TuneButton />
      </header>
      <span id="site-panel-anchor" aria-hidden="true" />
      <aside className="sidebar">
        <Nav path={path} onNavigate={() => setMenu(false)} />
      </aside>
      <button
        type="button"
        className="scrim"
        aria-label="Close menu"
        tabIndex={-1}
        onClick={() => setMenu(false)}
      />
      <main id="content" key={path}>
        <Suspense fallback={<div className="page-loading" />}>
          <Page path={path} onReady={() => setReadyPath(path)} />
          {(prev || next) && (
            <footer className="pager">
              {prev ? (
                <Link href={prev.path} className="pager-prev">
                  <small>Previous</small>
                  {prev.title}
                </Link>
              ) : (
                <span />
              )}
              {next && (
                <Link href={next.path} className="pager-next">
                  <small>Next</small>
                  {next.title}
                </Link>
              )}
            </footer>
          )}
        </Suspense>
      </main>
      <Toc path={path} ready={ready} />
    </div>
  )
}
