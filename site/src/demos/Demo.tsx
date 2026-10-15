import {
  defineControls,
  type Controls,
  type ControlsOptions,
  type DensityMode,
  type Schema,
} from "knobs"
import { KnobsPanel } from "knobs/react"
import type { CSSProperties, ReactNode } from "react"
import { registerStore } from "../site"

/**
 * Controls for a live example: always enabled, following the site theme, and shareable. The site
 * is a showcase, so chips show on hover even in its production build.
 */
export function demoControls<const S extends Schema>(
  id: string,
  schema: S,
  options: ControlsOptions<S> = {},
): Controls<S> {
  const controls = defineControls(id, schema, {
    enabled: true,
    theme: "auto",
    chip: { reveal: "hover" },
    ...options,
  })
  registerStore(controls as unknown as Controls<Schema>)
  return controls
}

/** A live example: a stage on the left and its inline panel on the right (stacked on phones). */
export function Demo<S extends Schema>({
  controls,
  children,
  caption,
  title,
  density,
  variants = false,
  stageStyle,
  className,
}: {
  controls: Controls<S>
  children: ReactNode
  caption?: ReactNode
  title?: string
  density?: DensityMode
  variants?: boolean
  stageStyle?: CSSProperties
  className?: string
}) {
  return (
    <div className={`demo${className ? ` ${className}` : ""}`}>
      <div className="demo-stage" style={stageStyle}>
        {children}
        {caption && <span className="demo-caption">{caption}</span>}
      </div>
      <div className="demo-panel">
        <KnobsPanel
          controls={controls}
          title={title}
          theme="auto"
          density={density}
          variants={variants}
        />
      </div>
    </div>
  )
}
