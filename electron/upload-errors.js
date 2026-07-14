const SAFE_BUSINESS_MESSAGES = new Set([
  '文件为空',
  '文件后缀不被允许',
  '处理ZIP文件时出错',
  'ZIP文件名编码不兼容',
  'ZIP文件名编码不兼容（仅支持UTF-8或GBK）'
])

function normalizeBusinessCode(value) {
  return Number.isSafeInteger(value) && value >= 0 && value <= 999999
    ? value
    : null
}

function safeBusinessMessage(message, businessCode) {
  if (typeof message === 'string' && SAFE_BUSINESS_MESSAGES.has(message)) {
    return message
  }
  return typeof businessCode === 'number'
    ? `服务器拒绝上传（业务码：${businessCode}）`
    : '服务器拒绝上传'
}

export class UploadBusinessError extends Error {
  constructor(responseData, httpStatus = 200) {
    const businessCode = normalizeBusinessCode(responseData?.code)
    super(safeBusinessMessage(responseData?.message, businessCode))
    this.name = 'UploadBusinessError'
    this.businessCode = businessCode
    this.httpStatus = httpStatus
  }
}

export function normalizeUploadError(error) {
  if (error instanceof UploadBusinessError) {
    const businessCode = error.businessCode
    return {
      message: error.message,
      httpStatus: error.httpStatus,
      businessCode,
      retryable: typeof businessCode === 'number' && businessCode >= 500
    }
  }

  if (error?.isAxiosError) {
    const httpStatus = error.response?.status ?? null
    const businessCode = normalizeBusinessCode(error.response?.data?.code)
    let message = httpStatus === null
      ? '上传失败'
      : safeBusinessMessage(error.response?.data?.message, businessCode)
    if (error.code === 'ECONNREFUSED') message = '无法连接上传服务器'
    if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
      message = '连接上传服务器超时'
    }
    if (error.code === 'ERR_CANCELED') message = '上传超时'
    return {
      message,
      httpStatus,
      businessCode,
      retryable: httpStatus === null || httpStatus >= 500
    }
  }

  return {
    message: '上传处理失败',
    httpStatus: null,
    businessCode: null,
    retryable: false
  }
}
