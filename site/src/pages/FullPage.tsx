import { Section } from "../section"

// Placeholder: full-page mode is being built on the gpu-renderer branch.
export default function FullPage() {
  return (
    <Section
      title="Full page"
      level={1}
      lede="A full-page mode is in progress. This page will document it when it lands."
    >
      <p className="note">
        Until then, mount inline panels with <code className="ic">{"<KnobsPanel>"}</code> or{" "}
        <code className="ic">controls.mount()</code> to build a dedicated tuning page.
      </p>
    </Section>
  )
}
