const ALLOWED_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp'])
const MAX_SIZE_BYTES = 5 * 1024 * 1024 // 5 MB

export interface PendingPhoto {
  filename: string
  data: string // base64-encoded (no data-URL prefix)
}

export interface PhotoValidationError {
  type: 'type' | 'size'
  message: string
}

export function validatePhotoFile(file: File): PhotoValidationError | null {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    return {
      type: 'type',
      message: `Invalid file type: .${ext}. Allowed types: jpg, jpeg, png, webp`
    }
  }
  if (file.size > MAX_SIZE_BYTES) {
    const sizeMB = (file.size / (1024 * 1024)).toFixed(1)
    return {
      type: 'size',
      message: `File size ${sizeMB}MB exceeds maximum of 5MB`
    }
  }
  return null
}

export function readFileAsBase64(file: File): Promise<PendingPhoto> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      // Strip data-URL prefix (e.g. "data:image/jpeg;base64,")
      const base64 = result.split(',')[1] ?? result
      resolve({ filename: file.name, data: base64 })
    }
    reader.onerror = () => reject(new Error('Failed to read file'))
    reader.readAsDataURL(file)
  })
}
