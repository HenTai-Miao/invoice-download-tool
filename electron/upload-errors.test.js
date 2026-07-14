import assert from 'node:assert/strict'
import test from 'node:test'

import {
  UploadBusinessError,
  normalizeUploadError
} from './upload-errors.js'

test('business error preserves safe server code and message', () => {
  // Given
  const error = new UploadBusinessError({
    code: 400,
    message: 'ZIP文件名编码不兼容',
    data: null
  })

  // When
  const normalized = normalizeUploadError(error)

  // Then
  assert.deepEqual(normalized, {
    message: 'ZIP文件名编码不兼容',
    httpStatus: 200,
    businessCode: 400,
    retryable: false
  })
})

test('connection refusal becomes a retryable transport error', () => {
  // Given
  const error = {
    isAxiosError: true,
    code: 'ECONNREFUSED',
    message: 'connect ECONNREFUSED',
    response: undefined
  }

  // When
  const normalized = normalizeUploadError(error)

  // Then
  assert.deepEqual(normalized, {
    message: '无法连接上传服务器',
    httpStatus: null,
    businessCode: null,
    retryable: true
  })
})

test('watchdog cancellation becomes a retryable timeout', () => {
  // Given
  const error = {
    isAxiosError: true,
    code: 'ERR_CANCELED',
    message: 'canceled'
  }

  // When
  const normalized = normalizeUploadError(error)

  // Then
  assert.deepEqual(normalized, {
    message: '上传超时',
    httpStatus: null,
    businessCode: null,
    retryable: true
  })
})

test('generic local error does not expose a filesystem path', () => {
  // Given
  const error = new Error(
    "ENOENT: rename 'C:\\Users\\admin\\AppData\\Local\\Temp\\invoice\\a.zip'"
  )

  // When
  const normalized = normalizeUploadError(error)

  // Then
  assert.deepEqual(normalized, {
    message: '上传处理失败',
    httpStatus: null,
    businessCode: null,
    retryable: false
  })
})

test('unknown server message is replaced instead of leaking details', () => {
  // Given
  const error = new UploadBusinessError({
    code: 400,
    message: "java.lang.IllegalStateException at C:\\server\\invoice\\secret.xml"
  })

  // When
  const normalized = normalizeUploadError(error)

  // Then
  assert.deepEqual(normalized, {
    message: '服务器拒绝上传（业务码：400）',
    httpStatus: 200,
    businessCode: 400,
    retryable: false
  })
})

test('malformed business code is not persisted', () => {
  // Given
  const error = new UploadBusinessError({
    code: { detail: 'C:\\server\\invoice\\secret.xml' },
    message: '处理ZIP文件时出错'
  })

  // When
  const normalized = normalizeUploadError(error)

  // Then
  assert.deepEqual(normalized, {
    message: '处理ZIP文件时出错',
    httpStatus: 200,
    businessCode: null,
    retryable: false
  })
})

test('numeric-looking string business code is not persisted', () => {
  // Given
  const error = new UploadBusinessError({
    code: '400',
    message: '处理ZIP文件时出错'
  })

  // When
  const normalized = normalizeUploadError(error)

  // Then
  assert.equal(normalized.businessCode, null)
  assert.equal(normalized.retryable, false)
})
