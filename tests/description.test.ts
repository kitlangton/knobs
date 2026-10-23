import { describe, expect, it } from "vitest"
import { createRemoteControls, defineControls, flatSpring, knob, toggle } from "../src/index.js"

describe("field descriptions", () => {
  it("rides on a field, a flat spring's halves and a descriptor", () => {
    const local = defineControls(
      "described",
      {
        speed: knob(1, { min: 0, max: 4, description: "How fast the square moves" }),
        trail: toggle(true),
        ...flatSpring(
          { duration: 0.3, bounce: 0 },
          { label: "Ease", description: "Camera catch-up" },
        ),
      },
      { enabled: true, storage: null },
    )
    const schema = local.schema as Record<string, { description?: string }>
    expect(schema.speed!.description).toBe("How fast the square moves")
    expect(schema.trail!.description).toBeUndefined()
    expect(schema.duration!.description).toBe("Camera catch-up")
    expect(schema.bounce!.description).toBe("Camera catch-up")

    const remote = createRemoteControls(
      "described-remote",
      [{ key: "gain", kind: "number", default: 0.5, description: "Output level" }],
      { storage: null },
    )
    expect((remote.schema as Record<string, { description?: string }>).gain!.description).toBe(
      "Output level",
    )
  })
})
