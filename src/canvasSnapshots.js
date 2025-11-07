import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage'
import { push, ref, serverTimestamp, set } from 'firebase/database'
import { storage, database } from './firebase'

const SNAPSHOTS_DB_PATH = 'snapshots'

const ensureBlob = (blob) => {
  if (!(blob instanceof Blob)) {
    throw new Error('Canvas snapshot upload requires a Blob')
  }
}

export async function saveCanvasSnapshot(blob, options = {}) {
  ensureBlob(blob)

  const {
    user = null,
    appVersion = null,
    theme = 'light',
    elementsCount = null,
    note = null,
  } = options

  const timestamp = Date.now()
  const randomId = Math.random().toString(36).slice(2)
  const userId = user?.browserId || 'anonymous'
  const storagePath = `snapshots/${userId}/${timestamp}_${randomId}.png`

  const fileRef = storageRef(storage, storagePath)
  const uploadResult = await uploadBytes(fileRef, blob, {
    contentType: blob.type || 'image/png',
  })
  const downloadURL = await getDownloadURL(uploadResult.ref)

  const snapshotsRef = ref(database, SNAPSHOTS_DB_PATH)
  const nextSnapshotRef = push(snapshotsRef)

  const record = {
    id: nextSnapshotRef.key,
    imageUrl: downloadURL,
    storagePath,
    createdAt: timestamp,
    createdAtServer: serverTimestamp(),
    userId,
    username: user?.username || 'Anonymous',
    userColor: user?.color || '#4ECDC4',
    avatarUrl: user?.avatarUrl || null,
    appVersion,
    theme,
    elementsCount,
    note,
  }

  await set(nextSnapshotRef, record)

  return record
}
