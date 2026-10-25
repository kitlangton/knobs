// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest"

// Node resolves solid-js to its server build, which runs no effects; use the browser's.
vi.mock("solid-js", () => import("../node_modules/solid-js/dist/solid.js" as string))

// happy-dom draws no canvas; the group die paints its faces into one.
HTMLCanvasElement.prototype.getContext = (() => ({
  createImageData: (w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4) }),
  putImageData() {},
})) as never

const { createRoot, createSignal } = await import("solid-js")
const { KnobsPanel } = await import("../src/solid/index.js")
const { createRemoteControls } = await import("../src/index.js")
const panel = await import("../src/panel/index.js")
const React = await import("react")
const { act } = React
const { createRoot: createReactRoot } = await import("react-dom/client")
const { KnobsPanel: ReactKnobsPanel } = await import("../src/react/index.js")

const stack = (id: string) =>
  createRemoteControls(
    id,
    [
      { key: "a", label: "A", kind: "number", default: 1, min: 0, max: 2, group: "One" },
      { key: "b", label: "B", kind: "number", default: 1, min: 0, max: 2, group: "Two" },
    ],
    { ship: async () => panel },
  )

describe("Solid KnobsPanel", () => {
  it("rebuilds when embed or the groups' ids change, not for a new array of the same ids", async () => {
    const remote = stack("solid-stack")
    const mount = vi.spyOn(panel, "mountPanel")
    const [groups, setGroups] = createSignal<readonly string[] | undefined>(["One"])
    const [embed, setEmbed] = createSignal(true)
    const dispose = createRoot((dispose) => {
      const host = KnobsPanel({
        controls: remote,
        get embed() {
          return embed()
        },
        get groups() {
          return groups()
        },
      }) as unknown as HTMLElement
      document.body.append(host)
      return dispose
    })
    await vi.waitFor(() => expect(mount).toHaveBeenCalledTimes(1))
    setGroups(["One"])
    await new Promise((done) => setTimeout(done, 50))
    expect(mount).toHaveBeenCalledTimes(1)
    setGroups(["Two"])
    await vi.waitFor(() => expect(mount).toHaveBeenCalledTimes(2))
    setEmbed(false)
    await vi.waitFor(() => expect(mount).toHaveBeenCalledTimes(3))
    // No groups and an empty list are different panels.
    setGroups([])
    await vi.waitFor(() => expect(mount).toHaveBeenCalledTimes(4))
    setGroups(undefined)
    await vi.waitFor(() => expect(mount).toHaveBeenCalledTimes(5))
    dispose()
  })
})

describe("React KnobsPanel", () => {
  it("rebuilds for new ids or embed, not for a new array of the same ids", async () => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    const remote = stack("react-stack")
    const mount = vi.spyOn(panel, "mountPanel")
    mount.mockClear()
    const node = document.createElement("div")
    document.body.append(node)
    const root = createReactRoot(node)
    const show = (props: { embed?: boolean; groups?: readonly string[] }) =>
      act(() => root.render(React.createElement(ReactKnobsPanel, { controls: remote, ...props })))
    const settle = () => act(() => new Promise((done) => setTimeout(done, 50)))
    await show({ embed: true, groups: ["One"] })
    await settle()
    expect(mount).toHaveBeenCalledTimes(1)
    await show({ embed: true, groups: ["One"] })
    await settle()
    expect(mount).toHaveBeenCalledTimes(1)
    await show({ embed: true, groups: [] })
    await settle()
    expect(mount).toHaveBeenCalledTimes(2)
    await show({ embed: true })
    await settle()
    expect(mount).toHaveBeenCalledTimes(3)
    await show({ embed: false })
    await settle()
    expect(mount).toHaveBeenCalledTimes(4)
    await act(() => root.unmount())
  })
})
