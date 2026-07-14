import assert from 'node:assert/strict'
import test from 'node:test'

import {
  FileStatus,
  mergeUploadStatus,
  selectUploadCandidates
} from './upload-state.js'

test('failed update overrides previous pending status', () => {
  // Given
  const previous = {
    name: 'failed.zip',
    status: FileStatus.PENDING,
    progress: 0,
    size: 100,
    lastUpdate: 1000
  }

  // When
  const result = mergeUploadStatus(previous, {
    name: 'failed.zip',
    status: FileStatus.FAILED,
    progress: 0,
    size: 100,
    now: 2000,
    extra: { lastFailedTime: 2000 }
  })

  // Then
  assert.equal(result.status, FileStatus.FAILED)
  assert.equal(result.lastUpdate, 2000)
})

test('extra metadata cannot override authoritative transition fields', () => {
  // Given / When
  const result = mergeUploadStatus(
    { name: 'failed.zip', status: FileStatus.PENDING },
    {
      name: 'failed.zip',
      status: FileStatus.FAILED,
      progress: 0,
      size: 100,
      now: 2000,
      extra: {
        status: FileStatus.PENDING,
        lastUpdate: 1000
      }
    }
  )

  // Then
  assert.equal(result.status, FileStatus.FAILED)
  assert.equal(result.lastUpdate, 2000)
})

test('cooling failed file does not block a later pending file', () => {
  // Given
  const failed = mergeUploadStatus(
    { name: 'failed.zip', status: FileStatus.PENDING },
    {
      name: 'failed.zip',
      status: FileStatus.FAILED,
      now: 2000,
      extra: { lastFailedTime: 2000 }
    }
  )
  const files = ['failed.zip', 'later.zip']
  const statusMap = new Map([
    ['failed.zip', failed],
    ['later.zip', { name: 'later.zip', status: FileStatus.PENDING }]
  ])

  // When
  const selected = selectUploadCandidates(
    files,
    statusMap,
    new Set(),
    1,
    3000,
    60000
  )

  // Then
  assert.deepEqual(selected, ['later.zip'])
})

test('persisted next retry time is the retry scheduling authority', () => {
  // Given
  const statusMap = new Map([
    ['failed.zip', {
      name: 'failed.zip',
      status: FileStatus.FAILED,
      lastFailedTime: 0,
      nextRetryAt: 120000
    }]
  ])

  // When
  const selected = selectUploadCandidates(
    ['failed.zip'],
    statusMap,
    new Set(),
    1,
    61000,
    60000
  )

  // Then
  assert.deepEqual(selected, [])
})

test('non-retryable failure is never selected automatically', () => {
  // Given
  const statusMap = new Map([
    ['rejected.zip', {
      name: 'rejected.zip',
      status: FileStatus.FAILED,
      retryable: false,
      lastFailedTime: 0,
      nextRetryAt: 1000
    }]
  ])

  // When
  const selected = selectUploadCandidates(
    ['rejected.zip'],
    statusMap,
    new Set(),
    1,
    2000,
    1000
  )

  // Then
  assert.deepEqual(selected, [])
})
