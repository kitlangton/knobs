/**
 * Layout reads that follow writes, gathered while a batch runs: a preset that moves fifty rows
 * would otherwise force a style and layout pass for each pill it places. Inside `batchMeasures`,
 * `measure` queues its read and write; when the batch ends every read runs, then every write.
 * Outside one it runs at once.
 */
interface Measure {
  read(): unknown
  write(value: unknown): void
}
let queue: Measure[] | null = null

export function measure<T>(read: () => T, write: (value: T) => void) {
  if (queue) queue.push({ read, write: write as (value: unknown) => void })
  else write(read())
}

export function batchMeasures(run: () => void) {
  if (queue) return run()
  const list: Measure[] = []
  queue = list
  try {
    run()
  } finally {
    queue = null
    const values = list.map((m) => m.read())
    list.forEach((m, i) => m.write(values[i]))
  }
}
