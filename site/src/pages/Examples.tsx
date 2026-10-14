import { Section } from "../section"

const page = "Examples"

const examples = [
  {
    href: "/examples/studies.html",
    title: "Studies",
    body: "Four illustrations, each with its own chip: a seeded ink splatter, a halftone, a type specimen with a variant switcher, and a motion study. Below them, a remote workbench with Swift output.",
  },
  {
    href: "/examples/meta.html",
    title: "Meta",
    body: "A panel that tunes every panel token live, beside a synth-voice specimen. Copy CSS gives the tokens.",
  },
  {
    href: "/examples/die.html",
    title: "Die",
    body: "The Random die at icon size and large, in the DOM and WebGPU renderers side by side, with its spin, shape and light on knobs. Click a die or press Space to roll.",
  },
]

export default function Examples() {
  return (
    <>
      <Section
        page={page}
        title="Examples"
        level={1}
        lede="The original demo pages, built from the repository's examples folder."
      >
        <ul className="examples">
          {examples.map((e) => (
            <li key={e.href}>
              <a href={e.href}>
                <strong>{e.title}</strong>
                <span>{e.body}</span>
              </a>
            </li>
          ))}
        </ul>
        <p>
          Add <code className="ic">?gpu</code> to any of them to use the WebGPU renderer.
        </p>
      </Section>
    </>
  )
}
