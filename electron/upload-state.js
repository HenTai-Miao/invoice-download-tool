export const FileStatus = Object.freeze({
  PENDING: 'pending',
  UPLOADING: 'uploading',
  SUCCESS: 'success',
  FAILED: 'failed'
})

export function mergeUploadStatus(previous, update) {
  return {
    ...previous,
    ...update.extra,
    name: update.name,
    status: update.status,
    progress: update.progress ?? 0,
    size: update.size ?? 0,
    lastUpdate: update.now
  }
}

export function selectUploadCandidates(
  files,
  statusMap,
  processingFiles,
  maxConcurrent,
  now,
  retryInterval
) {
  const availableSlots = Math.max(0, maxConcurrent - processingFiles.size)
  return files
    .filter((fileName) => {
      const metadata = statusMap.get(fileName)
      if (!metadata || processingFiles.has(fileName)) return false
      if (metadata.status === FileStatus.PENDING) return true
      if (metadata.status !== FileStatus.FAILED) return false
      if (metadata.retryable === false) return false
      const retryAt = metadata.nextRetryAt ??
        (metadata.lastFailedTime ?? 0) + retryInterval
      return now >= retryAt
    })
    .slice(0, availableSlots)
}
