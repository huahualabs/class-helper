function cloneSchedule(schedule) {
  return JSON.parse(JSON.stringify(schedule))
}

export function createLatestScheduleSaveQueue(saveSchedule) {
  let pending = null
  let running = null

  async function drain() {
    let lastError = null
    while (pending) {
      const snapshot = pending
      pending = null
      try {
        await saveSchedule(snapshot)
        lastError = null
      } catch (error) {
        lastError = error
      }
    }
    if (lastError) throw lastError
  }

  function enqueue(schedule) {
    pending = cloneSchedule(schedule)
    if (!running) {
      running = drain().finally(() => {
        running = null
      })
    }
    return running
  }

  return { enqueue, isSaving: () => Boolean(running) }
}
