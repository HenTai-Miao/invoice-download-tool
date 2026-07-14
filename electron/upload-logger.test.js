import assert from 'node:assert/strict'
import {
  mkdtemp,
  readFile,
  readdir,
  rm,
  utimes,
  writeFile
} from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { createUploadLogger } from './upload-logger.js'

test('writes one safe JSON record to the daily upload log', async (context) => {
  // Given
  const directory = await mkdtemp(path.join(os.tmpdir(), 'upload-log-test-'))
  context.after(() => rm(directory, { recursive: true, force: true }))
  const logger = createUploadLogger({
    directory,
    now: () => new Date('2026-07-14T03:00:00.000Z')
  })

  // When
  await logger.log('upload_failed', {
    fileName: 'batch.zip',
    businessCode: 400,
    message: 'ZIP文件名编码不兼容'
  })

  // Then
  const files = await readdir(directory)
  assert.deepEqual(files, ['upload-2026-07-14.log'])
  const record = JSON.parse(await readFile(path.join(directory, files[0]), 'utf8'))
  assert.deepEqual(record, {
    timestamp: '2026-07-14T03:00:00.000Z',
    event: 'upload_failed',
    fileName: 'batch.zip',
    businessCode: 400,
    message: 'ZIP文件名编码不兼容'
  })
})

test('prunes only expired upload logs', async (context) => {
  // Given
  const directory = await mkdtemp(path.join(os.tmpdir(), 'upload-log-prune-'))
  context.after(() => rm(directory, { recursive: true, force: true }))
  const oldLog = path.join(directory, 'upload-2026-06-01.log')
  const recentLog = path.join(directory, 'upload-2026-07-10.log')
  const unrelatedFile = path.join(directory, 'notes.log')
  await Promise.all([
    writeFile(oldLog, ''),
    writeFile(recentLog, ''),
    writeFile(unrelatedFile, '')
  ])
  const oldTimestamp = new Date('2026-06-01T00:00:00.000Z')
  await utimes(oldLog, oldTimestamp, oldTimestamp)
  const logger = createUploadLogger({
    directory,
    retentionDays: 14,
    now: () => new Date('2026-07-14T03:00:00.000Z')
  })

  // When
  await logger.prune()

  // Then
  assert.deepEqual(
    (await readdir(directory)).sort(),
    ['notes.log', 'upload-2026-07-10.log']
  )
})
