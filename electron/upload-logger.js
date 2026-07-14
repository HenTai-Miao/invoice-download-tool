import { appendFile, mkdir, readdir, stat, unlink } from 'node:fs/promises'
import path from 'node:path'

const UPLOAD_LOG_PATTERN = /^upload-\d{4}-\d{2}-\d{2}\.log$/
const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000

export function createUploadLogger({
  directory,
  retentionDays = 14,
  now = () => new Date()
}) {
  return {
    async log(event, details = {}) {
      const timestamp = now()
      const fileName = `upload-${timestamp.toISOString().slice(0, 10)}.log`
      const record = {
        timestamp: timestamp.toISOString(),
        event,
        ...details
      }
      await mkdir(directory, { recursive: true })
      await appendFile(
        path.join(directory, fileName),
        `${JSON.stringify(record)}\n`,
        'utf8'
      )
    },

    async prune() {
      await mkdir(directory, { recursive: true })
      const cutoff = now().getTime() - retentionDays * MILLISECONDS_PER_DAY
      const fileNames = await readdir(directory)
      for (const fileName of fileNames) {
        if (!UPLOAD_LOG_PATTERN.test(fileName)) continue
        const filePath = path.join(directory, fileName)
        const metadata = await stat(filePath)
        if (metadata.mtimeMs < cutoff) await unlink(filePath)
      }
    }
  }
}
