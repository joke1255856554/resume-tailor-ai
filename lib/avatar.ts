const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const MAX_SOURCE_BYTES = 15 * 1024 * 1024
const MAX_LONG_EDGE = 700
const TARGET_BYTES = 300 * 1024

export class AvatarProcessingError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AvatarProcessingError'
  }
}

export function isSupportedAvatarFile(file: File): boolean {
  return ACCEPTED_IMAGE_TYPES.includes(file.type.toLowerCase())
}

function dataUrlBytes(dataUrl: string): number {
  const base64 = dataUrl.split(',')[1] || ''
  return Math.ceil(base64.length * 0.75)
}

async function loadImage(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if ('createImageBitmap' in window) {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' })
    } catch {
      // Older browsers may reject imageOrientation; use the HTMLImageElement fallback.
    }
  }

  return await new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => {
      URL.revokeObjectURL(url)
      resolve(image)
    }
    image.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new AvatarProcessingError('图片读取失败，请重新选择。'))
    }
    image.src = url
  })
}

function imageDimensions(image: ImageBitmap | HTMLImageElement) {
  if (typeof ImageBitmap !== 'undefined' && image instanceof ImageBitmap) {
    return { width: image.width, height: image.height }
  }
  const htmlImage = image as HTMLImageElement
  return {
    width: htmlImage.naturalWidth,
    height: htmlImage.naturalHeight,
  }
}

export async function compressAvatar(file: File): Promise<string> {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    throw new AvatarProcessingError('头像只能在浏览器中处理。')
  }
  if (!isSupportedAvatarFile(file)) {
    throw new AvatarProcessingError('请选择 JPG、PNG 或 WebP 图片。')
  }
  if (file.size > MAX_SOURCE_BYTES) {
    throw new AvatarProcessingError('图片文件过大，请选择小于 15MB 的照片。')
  }

  let image: ImageBitmap | HTMLImageElement | null = null
  try {
    image = await loadImage(file)
    const source = imageDimensions(image)
    if (!source.width || !source.height) {
      throw new AvatarProcessingError('无法识别图片尺寸，请重新选择。')
    }

    let scale = Math.min(1, MAX_LONG_EDGE / Math.max(source.width, source.height))
    let quality = 0.84
    let result = ''

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.round(source.width * scale))
      canvas.height = Math.max(1, Math.round(source.height * scale))
      const context = canvas.getContext('2d', { alpha: false })
      if (!context) throw new AvatarProcessingError('图片处理失败，请重新选择。')

      context.fillStyle = '#ffffff'
      context.fillRect(0, 0, canvas.width, canvas.height)
      context.imageSmoothingEnabled = true
      context.imageSmoothingQuality = 'high'
      context.drawImage(image, 0, 0, canvas.width, canvas.height)
      result = canvas.toDataURL('image/jpeg', quality)

      if (dataUrlBytes(result) <= TARGET_BYTES) return result
      scale *= 0.82
      quality = Math.max(0.68, quality - 0.04)
    }

    if (!result || dataUrlBytes(result) > 500 * 1024) {
      throw new AvatarProcessingError('图片压缩后仍然过大，请选择尺寸更小的照片。')
    }
    return result
  } catch (error) {
    if (error instanceof AvatarProcessingError) throw error
    throw new AvatarProcessingError('图片处理失败，请重新选择。')
  } finally {
    if (typeof ImageBitmap !== 'undefined' && image instanceof ImageBitmap) image.close()
  }
}
