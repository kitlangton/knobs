import { lazy, Suspense, useEffect, useRef, useState, type ComponentType } from "react"

/**
 * Mounts an example once it comes within a screen or so of the viewport, loading its chunk then.
 * Until then a placeholder holds its height so the page doesn't shift.
 */
export function lazyExample(load: () => Promise<{ default: ComponentType }>, height: number) {
  const Example = lazy(load)
  return function LazyExample() {
    const ref = useRef<HTMLDivElement>(null)
    const [near, setNear] = useState(false)
    useEffect(() => {
      const node = ref.current
      if (!node || near) return
      const io = new IntersectionObserver(
        (entries) => {
          if (entries.some((e) => e.isIntersecting)) setNear(true)
        },
        { rootMargin: "900px 0px" },
      )
      io.observe(node)
      return () => io.disconnect()
    }, [near])
    const placeholder = <div className="example-placeholder" style={{ minHeight: height }} />
    if (!near)
      return <div ref={ref} className="example-placeholder" style={{ minHeight: height }} />
    return (
      <Suspense fallback={placeholder}>
        <Example />
      </Suspense>
    )
  }
}
