import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import { storage } from './firebase'

/**
 * Upload an image file to Firebase Storage and return its public URL
 * @param {File|Blob} file - The image file to upload
 * @param {string} userId - The user ID for organizing uploaded files
 * @returns {Promise<{id: string, dataURL: string, mimeType: string, created: number}>}
 */
export async function uploadImageToStorage(file, userId) {
  try {
    // Generate a unique file name
    const timestamp = Date.now()
    const randomId = Math.random().toString(36).substring(2, 15)
    const fileName = `${userId}/${timestamp}_${randomId}`

    // Create a storage reference
    const storageRef = ref(storage, `images/${fileName}`)

    // Upload the file
    console.log('Uploading image to Firebase Storage...', {
      fileName,
      fileSize: file.size,
      fileType: file.type,
      storagePath: `images/${fileName}`,
    })

    const snapshot = await uploadBytes(storageRef, file, {
      contentType: file.type,
    })

    console.log('Upload complete! Getting download URL...')

    // Get the download URL
    const downloadURL = await getDownloadURL(snapshot.ref)

    console.log('✅ Image uploaded successfully to Firebase Storage!')
    console.log('Download URL:', downloadURL)

    // Return in the format Excalidraw expects
    return {
      id: randomId,
      dataURL: downloadURL,
      mimeType: file.type,
      created: timestamp,
    }
  } catch (error) {
    console.error('❌ Error uploading image to Firebase Storage:', error)
    console.error('Error code:', error.code)
    console.error('Error message:', error.message)

    // Check for specific Firebase Storage errors
    if (error.code === 'storage/unauthorized') {
      throw new Error('Firebase Storage: Permission denied. Make sure Storage is enabled in Firebase Console.')
    } else if (error.code === 'storage/quota-exceeded') {
      throw new Error('Firebase Storage: Quota exceeded.')
    } else {
      throw new Error(`Firebase Storage upload failed: ${error.message}`)
    }
  }
}

/**
 * Convert a base64 data URL to a Blob
 * @param {string} dataURL - The base64 data URL
 * @returns {Blob}
 */
export function dataURLToBlob(dataURL) {
  const arr = dataURL.split(',')
  const mime = arr[0].match(/:(.*?);/)[1]
  const bstr = atob(arr[1])
  let n = bstr.length
  const u8arr = new Uint8Array(n)
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n)
  }
  return new Blob([u8arr], { type: mime })
}

/**
 * Load an image and get its dimensions
 * @param {string} dataURL - The image URL
 * @returns {Promise<{width: number, height: number}>}
 */
export function loadImageDimensions(dataURL) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      resolve({ width: img.width, height: img.height })
    }
    img.onerror = reject
    img.crossOrigin = 'anonymous'
    img.src = dataURL
  })
}

/**
 * Handle image uploads for Excalidraw
 * This function is called when images are pasted or inserted
 * @param {File|Blob} file - The image file
 * @param {string} userId - The user ID
 * @returns {Promise<{id: string, dataURL: string, mimeType: string, created: number, width: number, height: number}>}
 */
export async function handleImageUpload(file, userId) {
  // If the file is already a File or Blob, upload it directly
  if (file instanceof File || file instanceof Blob) {
    const uploadedImage = await uploadImageToStorage(file, userId)

    // Load the image to get its dimensions
    const { width, height } = await loadImageDimensions(uploadedImage.dataURL)

    return {
      ...uploadedImage,
      width,
      height,
    }
  }

  throw new Error('Invalid file type for upload')
}
