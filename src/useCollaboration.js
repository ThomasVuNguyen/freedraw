import { useCallback, useEffect, useRef, useState } from 'react'
import { get, onDisconnect, onValue, push, ref, serverTimestamp, set, update } from 'firebase/database'
import { database } from './firebase'
import { getOrCreateUserIdentity, updateStoredUserIdentity } from './userIdentity'

const CANVAS_PATH = 'canvas/scene'
const PRESENCE_PATH = 'presence/users'
const SESSIONS_PATH = 'sessions'
const ADMIN_PATH = 'roles/admins'
const HEARTBEAT_INTERVAL = 20000
const CANVAS_POLL_INTERVAL = 2000

const cloneElement = (element) => {
  if (typeof structuredClone === 'function') {
    return structuredClone(element)
  }
  return JSON.parse(JSON.stringify(element))
}

const cloneElements = (elements = []) => elements.map((el) => cloneElement(el))

export function useCollaboration(excalidrawAPI, pendingFilesRef) {
  const [isLoaded, setIsLoaded] = useState(false)
  const [userIdentity, setUserIdentity] = useState(null)
  const [onlineUsers, setOnlineUsers] = useState([])
  const [isAdmin, setIsAdmin] = useState(false)
  const [hasPendingChanges, setHasPendingChanges] = useState(false)
  const [isSavingScene, setIsSavingScene] = useState(false)
  const [lastSavedAt, setLastSavedAt] = useState(null)
  const [lastSyncInfo, setLastSyncInfo] = useState(null)
  const presenceRefRef = useRef(null)
  const userIdRef = useRef(null)
  const isSyncingRef = useRef(false)
  const hasLoadedInitialDataRef = useRef(false)
  const previousSceneRef = useRef(null)
  const sessionRefRef = useRef(null)
  const heartbeatRef = useRef(null)
  const isAdminRef = useRef(false)
  const adminMapRef = useRef({})
  const hasPendingSaveRef = useRef(false)
  const lastAppStateRef = useRef(null)
  const isApplyingSceneUpdateRef = useRef(false)
  const isSavingRef = useRef(false)
  const lastSaveStartedAtRef = useRef(0)
  const needsResaveRef = useRef(false)
  const flushPendingSaveRef = useRef(null)
  const canvasPollRef = useRef(null)
  const isFetchingCanvasRef = useRef(false)
  const debounceSaveTimerRef = useRef(null)

  useEffect(() => {
    const presenceListRef = ref(database, PRESENCE_PATH)
    const unsubscribePresence = onValue(presenceListRef, (snapshot) => {
      const presenceData = snapshot.val() || {}
      const now = Date.now()
      const users = Object.values(presenceData)
        .filter(Boolean)
        .map((user) => {
          if (user.cursor) {
            return {
              ...user,
              cursor: {
                ...user.cursor,
                syncedAt: now,
              },
            }
          }
          return user
        })
      users.sort((a, b) => {
        const aJoined = a.joinedAt || 0
        const bJoined = b.joinedAt || 0
        return bJoined - aJoined
      })
      setOnlineUsers(users)
    })

    return () => {
      unsubscribePresence()
    }
  }, [])

  useEffect(() => {
    const adminsRef = ref(database, ADMIN_PATH)
    const unsubscribeAdmins = onValue(adminsRef, (snapshot) => {
      const adminMap = snapshot.val() || {}
      adminMapRef.current = adminMap
      const userId = userIdRef.current
      const hasAdminRights = Boolean(userId && adminMap[userId])
      if (isAdminRef.current !== hasAdminRights) {
        isAdminRef.current = hasAdminRights
        setIsAdmin(hasAdminRights)
      }
    })

    return () => {
      unsubscribeAdmins()
    }
  }, [])

  useEffect(() => {
    const userId = userIdentity?.browserId
    const hasAdminRights = Boolean(userId && adminMapRef.current[userId])
    if (isAdminRef.current !== hasAdminRights) {
      isAdminRef.current = hasAdminRights
      setIsAdmin(hasAdminRights)
    }
  }, [userIdentity])

  useEffect(() => {
    if (!excalidrawAPI) return

    // Initialize user identity
    const initializeIdentity = async () => {
      // Get or create user identity with username and color from API
      const identity = await getOrCreateUserIdentity()
      userIdRef.current = identity.browserId
      setUserIdentity(identity)

      return identity
    }

    // Main initialization function
    const initialize = async () => {
      const identity = await initializeIdentity()
      const userId = identity.browserId
      const canvasRef = ref(database, CANVAS_PATH)
      const presenceRef = ref(database, `${PRESENCE_PATH}/${userId}`)
      const sessionsListRef = ref(database, `${SESSIONS_PATH}/${userId}`)

      const assignOwnerMetadata = (element, ownerId = userId) => {
        const existingCustomData = { ...(element.customData || {}) }
        const metadata = {
          ...existingCustomData,
          createdBy: ownerId,
        }

        if (ownerId === userId) {
          metadata.createdByUsername = identity.username
          metadata.createdByColor = identity.color
        } else {
          if (existingCustomData.createdByUsername) {
            metadata.createdByUsername = existingCustomData.createdByUsername
          }
          if (existingCustomData.createdByColor) {
            metadata.createdByColor = existingCustomData.createdByColor
          }
        }

        element.customData = metadata
        return element
      }

      const decorateElementWithOwner = (element, ownerId = userId) =>
        assignOwnerMetadata(cloneElement(element), ownerId)

      const setupPresence = () => {
        const userPresence = {
          id: userId,
          username: identity.username,
          color: identity.color,
          avatarUrl: identity.avatarUrl || null,
          joinedAt: Date.now(),
          lastActiveAt: serverTimestamp(),
          cursor: null,
        }

        set(presenceRef, userPresence)
        onDisconnect(presenceRef).remove()
        presenceRefRef.current = presenceRef
      }

      const startSession = async () => {
        const newSessionRef = push(sessionsListRef)
        sessionRefRef.current = newSessionRef

        await set(newSessionRef, {
          id: newSessionRef.key,
          userId,
          username: identity.username,
          color: identity.color,
          avatarUrl: identity.avatarUrl || null,
          startedAt: serverTimestamp(),
          lastActiveAt: serverTimestamp(),
          endedAt: null,
        })

        onDisconnect(newSessionRef).update({
          endedAt: serverTimestamp(),
          lastActiveAt: serverTimestamp(),
        })
      }

      const sendHeartbeat = () => {
        update(presenceRef, {
          lastActiveAt: serverTimestamp(),
        }).catch((error) => {
          console.error('Error updating presence heartbeat:', error)
        })

        if (sessionRefRef.current) {
          update(sessionRefRef.current, {
            lastActiveAt: serverTimestamp(),
            endedAt: null,
          }).catch((error) => {
            console.error('Error updating session heartbeat:', error)
          })
        }
      }

      setupPresence()
      await startSession()
      sendHeartbeat()
      heartbeatRef.current = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL)

      const markSyncComplete = (reason = 'poll', hadRemoteUpdates = false) => {
        setLastSyncInfo({
          reason,
          hadRemoteUpdates,
          timestamp: Date.now(),
        })
      }

      const fetchCanvasState = async (reason = 'poll') => {
        if (!excalidrawAPI) {
          return
        }

        if (isFetchingCanvasRef.current) {
          return
        }

        // Skip polling if user has pending changes (actively working)
        // This prevents interrupting the user's workflow
        if (reason === 'poll' && hasPendingSaveRef.current) {
          console.log('Skipping poll: user has pending changes')
          return
        }

        isFetchingCanvasRef.current = true

        try {
          const snapshot = await get(canvasRef)
          const data = snapshot.exists() ? snapshot.val() : null

          if (data && !isSyncingRef.current) {
            try {
              const sceneData = JSON.parse(data.sceneJSON)

              console.log('Loading from Firebase:', {
                elementCount: sceneData.elements?.length || 0,
                fileCount: data.files ? Object.keys(JSON.parse(data.files)).length : 0,
                reason,
              })

              isSyncingRef.current = true
              isApplyingSceneUpdateRef.current = true

              let filesToLoad = null
              if (data.files) {
                try {
                  const files = JSON.parse(data.files)
                  if (Object.keys(files).length > 0) {
                    filesToLoad = files
                    if (pendingFilesRef) {
                      pendingFilesRef.current = {
                        ...pendingFilesRef.current,
                        ...files,
                      }
                    }
                    console.log('Files loaded from Firebase:', Object.keys(files).length)
                  }
                } catch (error) {
                  console.error('Error parsing files:', error)
                }
              }

              // If there's a pending save, intelligently merge Firebase and local elements
              let elementsToRender = sceneData.elements
              if (hasPendingSaveRef.current) {
                const currentCanvasElements = excalidrawAPI.getSceneElements()
                const firebaseMap = new Map(sceneData.elements.map(el => [el.id, el]))
                const mergedElements = []

                // First, add all Firebase elements, but prefer local version if newer
                for (const fbElement of sceneData.elements) {
                  const localElement = currentCanvasElements.find(el => el.id === fbElement.id)
                  if (localElement && localElement.version > fbElement.version) {
                    // Local version is newer, keep it
                    mergedElements.push(localElement)
                  } else {
                    // Firebase version is newer or same, use it
                    mergedElements.push(fbElement)
                  }
                }

                // Then add any local-only elements (new elements not yet in Firebase)
                const localOnlyElements = currentCanvasElements.filter(el => !firebaseMap.has(el.id))
                if (localOnlyElements.length > 0) {
                  console.log(`Preserving ${localOnlyElements.length} local-only element(s) during sync`)
                  const taggedLocalElements = localOnlyElements.map(el => decorateElementWithOwner(el))
                  mergedElements.push(...taggedLocalElements)
                }

                elementsToRender = mergedElements
              }

              const updateData = filesToLoad
                ? { elements: elementsToRender, appState: sceneData.appState, files: filesToLoad }
                : { elements: elementsToRender, appState: sceneData.appState }

              excalidrawAPI.updateScene(updateData)

              previousSceneRef.current = cloneElements(elementsToRender)

              markSyncComplete(reason, true)

              setTimeout(() => {
                isSyncingRef.current = false
                isApplyingSceneUpdateRef.current = false
              }, 500)

              if (!isLoaded) {
                setIsLoaded(true)
              }

              hasLoadedInitialDataRef.current = true
            } catch (error) {
              console.error('Error loading canvas from Firebase:', error)
              hasLoadedInitialDataRef.current = true
              isSyncingRef.current = false
              isApplyingSceneUpdateRef.current = false
            }
          } else if (!data) {
            if (!isLoaded) {
              setIsLoaded(true)
            }
            markSyncComplete(reason, false)
            hasLoadedInitialDataRef.current = true
          }
        } catch (error) {
          console.error('Error fetching canvas from Firebase:', error)
        } finally {
          isFetchingCanvasRef.current = false
        }
      }

      // Load canvas immediately, then poll every 10 seconds
      await fetchCanvasState('initial')

      if (!canvasPollRef.current) {
        canvasPollRef.current = setInterval(() => {
          fetchCanvasState('poll').catch((error) => {
            console.error('Canvas poll failed:', error)
          })
        }, CANVAS_POLL_INTERVAL)
      }

      const flushPendingSave = (options = {}) => {
        const { reason = 'manual', allowRetry = true } = options
        const hasPending = hasPendingSaveRef.current || needsResaveRef.current

        if (import.meta.env?.DEV) {
          console.log('flushPendingSave invoked', { reason, allowRetry, hasPending })
        }

        if (!excalidrawAPI) {
          console.warn('flushPendingSave aborted: excalidrawAPI not ready')
          return null
        }

        if (!hasPending) {
          if (!allowRetry) {
            if (import.meta.env?.DEV) {
              console.log('flushPendingSave skipped: nothing to save', { reason })
            }
            return null
          }
        }

        if (isSavingRef.current || isApplyingSceneUpdateRef.current) {
          if (isSavingRef.current) {
            const now = Date.now()
            const lastStarted = lastSaveStartedAtRef.current || 0
            const elapsed = now - lastStarted
            const isStuck = elapsed > 5000

            if (isStuck) {
              console.warn('Previous Firebase save appears stuck; releasing lock')
              isSavingRef.current = false
              setIsSavingScene(false)
              hasPendingSaveRef.current = true
              setHasPendingChanges(true)
            } else {
              needsResaveRef.current = true
              return null
            }
          } else {
            needsResaveRef.current = true
            return null
          }
        }

        if (!hasPendingSaveRef.current && !needsResaveRef.current) {
          if (import.meta.env?.DEV) {
            console.log('flushPendingSave skipped after lock release', { reason })
          }
          return null
        }

        // Clear any pending debounced save timer since we're saving now
        if (debounceSaveTimerRef.current) {
          clearTimeout(debounceSaveTimerRef.current)
          debounceSaveTimerRef.current = null
        }

        isSavingRef.current = true
        setIsSavingScene(true)
        lastSaveStartedAtRef.current = Date.now()
        hasPendingSaveRef.current = false
        setHasPendingChanges(false)
        needsResaveRef.current = false

        const sceneElements =
          (previousSceneRef.current && cloneElements(previousSceneRef.current)) ||
          cloneElements(excalidrawAPI.getSceneElements())

        const latestAppState =
          lastAppStateRef.current ||
          excalidrawAPI.getAppState() ||
          {}

        const sceneData = {
          elements: sceneElements,
          appState: {
            viewBackgroundColor: latestAppState.viewBackgroundColor,
            gridSize: latestAppState.gridSize,
          },
        }

        const files = excalidrawAPI.getFiles()
        const allFiles = {
          ...files,
          ...(pendingFilesRef?.current || {}),
        }

        const sceneJSON = JSON.stringify(sceneData)
        const filesJSON = JSON.stringify(allFiles)

        const canvasData = {
          sceneJSON,
          files: filesJSON,
          updatedBy: userId,
          updatedAt: Date.now(),
        }

        console.log('Saving to Firebase:', {
          elementCount: sceneData.elements.length,
          fileCount: Object.keys(allFiles).length,
          sizeKB: (sceneJSON.length / 1024).toFixed(2),
          reason,
        })

        const savePromise = set(canvasRef, canvasData)
          .then(() => {
            console.log('Firebase save succeeded', { reason })
            setLastSavedAt(Date.now())

            // After save completes, if no more pending changes, fetch latest from others
            setTimeout(() => {
              if (!hasPendingSaveRef.current && !isSavingRef.current) {
                console.log('Save complete and idle - fetching latest updates')
                fetchCanvasState('post-save').catch((error) => {
                  console.error('Post-save fetch failed:', error)
                })
              }
            }, 100)
          })
          .catch((error) => {
            console.error('Error syncing to Firebase:', error)
            hasPendingSaveRef.current = true
            setHasPendingChanges(true)
            throw error
          })
          .finally(() => {
            isSavingRef.current = false
            setIsSavingScene(false)
            const shouldResave = needsResaveRef.current
            needsResaveRef.current = false
            if (shouldResave) {
              flushPendingSave({ reason: 'post-save', allowRetry: false })
            }
          })

        // Add a watchdog in case the promise gets hung (rare browser networking issues)
        setTimeout(() => {
          if (isSavingRef.current && Date.now() - lastSaveStartedAtRef.current > 8000) {
            console.warn('Firebase save watchdog releasing lock after timeout')
            isSavingRef.current = false
            setIsSavingScene(false)
            hasPendingSaveRef.current = true
            setHasPendingChanges(true)
            const shouldResave = needsResaveRef.current
            needsResaveRef.current = false
            if (shouldResave) {
              flushPendingSave({ reason: 'watchdog', allowRetry: false })
            }
          }
        }, 8000)

        return savePromise
      }

      const handleVisibilityChange = () => {
        if (document.visibilityState === 'hidden' && hasPendingSaveRef.current) {
          flushPendingSave({ reason: 'visibilitychange', allowRetry: false })
        }
      }

      const handlePageHide = () => {
        if (hasPendingSaveRef.current) {
          flushPendingSave({ reason: 'pagehide', allowRetry: false })
        }
      }

      window.addEventListener('visibilitychange', handleVisibilityChange)
      window.addEventListener('pagehide', handlePageHide)
      window.addEventListener('beforeunload', handlePageHide)

      const handleChange = (elements, appState) => {
        if (!hasLoadedInitialDataRef.current) {
          console.log('handleChange ignored: initial data not loaded')
          return
        }

        if (isApplyingSceneUpdateRef.current) {
          console.log('handleChange ignored: applying remote scene')
          return
        }

        const previousElements = previousSceneRef.current || []
        const previousMap = new Map()
        previousElements.forEach((el, index) => {
          previousMap.set(el.id, { element: el, index })
        })

        const authorizedElements = []
        const userIsAdmin = isAdminRef.current

        for (let index = 0; index < elements.length; index += 1) {
          const element = elements[index]
          const clonedElement = cloneElement(element)

          const prevEntry = previousMap.get(element.id)

          if (!prevEntry) {
            // User is creating a new element
            assignOwnerMetadata(clonedElement, userId)
            authorizedElements[index] = clonedElement
            continue
          }

          const previousElement = prevEntry.element
          const owner = previousElement.customData?.createdBy

          if (userIsAdmin || !owner || owner === userId) {
            // User can edit their own elements or admin can edit anything
            assignOwnerMetadata(clonedElement, owner ?? userId)
            authorizedElements[index] = clonedElement
          } else {
            // User tried to modify someone else's element
            // Don't save the modification - use previous version in save
            // Let it show locally, the next poll (2s) will restore correct version
            console.log(`User ${userId} attempted to modify element ${element.id} owned by ${owner} - blocking save`)
            assignOwnerMetadata(previousElement, owner)
            authorizedElements[index] = previousElement  // Use old version for save
          }
        }

        // Check for deleted elements - prevent saving the deletion if not owned
        const currentElementIds = new Set(elements.map(el => el.id))
        for (const prevElement of previousElements) {
          if (!currentElementIds.has(prevElement.id) && !prevElement.isDeleted) {
            const owner = prevElement.customData?.createdBy
            // If element was deleted and user doesn't own it, include it in save
            if (owner && owner !== userId && !userIsAdmin) {
              console.log(`User ${userId} attempted to delete element ${prevElement.id} owned by ${owner} - blocking deletion from save`)
              authorizedElements.push(prevElement)  // Keep in save
              // Locally it will appear deleted, but poll will restore it in 2s
            }
          }
        }

        previousSceneRef.current = cloneElements(authorizedElements)

        lastAppStateRef.current = {
          viewBackgroundColor: appState.viewBackgroundColor,
          gridSize: appState.gridSize,
        }

        hasPendingSaveRef.current = true
        setHasPendingChanges(true)
        if (isSavingRef.current) {
          needsResaveRef.current = true
        }

        // Debounced save: trigger save 500ms after user stops editing
        if (debounceSaveTimerRef.current) {
          clearTimeout(debounceSaveTimerRef.current)
        }
        debounceSaveTimerRef.current = setTimeout(() => {
          debounceSaveTimerRef.current = null // Clear timer so polling can resume
          // Only trigger save if not already saving (prevents race with post-save)
          if (flushPendingSaveRef.current && hasPendingSaveRef.current && !isSavingRef.current) {
            console.log('Triggering debounced save')
            flushPendingSaveRef.current({ reason: 'debounced', allowRetry: true })
          }
        }, 500)
      }

      const unsubscribeChange = excalidrawAPI.onChange(handleChange)

      flushPendingSaveRef.current = flushPendingSave

      return () => {
        if (heartbeatRef.current) {
          clearInterval(heartbeatRef.current)
          heartbeatRef.current = null
        }

        if (debounceSaveTimerRef.current) {
          clearTimeout(debounceSaveTimerRef.current)
          debounceSaveTimerRef.current = null
        }

        if (sessionRefRef.current) {
          update(sessionRefRef.current, {
            lastActiveAt: serverTimestamp(),
            endedAt: serverTimestamp(),
          }).catch((error) => {
            console.error('Error closing session:', error)
          })
          sessionRefRef.current = null
        }

        if (hasPendingSaveRef.current) {
          flushPendingSave({ reason: 'cleanup' })
        }

        window.removeEventListener('visibilitychange', handleVisibilityChange)
        window.removeEventListener('pagehide', handlePageHide)
        window.removeEventListener('beforeunload', handlePageHide)

        presenceRefRef.current = null

        if (canvasPollRef.current) {
          clearInterval(canvasPollRef.current)
          canvasPollRef.current = null
        }

        if (unsubscribeChange) {
          unsubscribeChange()
        }

        set(presenceRef, null)

        flushPendingSaveRef.current = null
      }
    }

    // Call the initialize function and handle cleanup
    let cleanup
    initialize().then((cleanupFn) => {
      cleanup = cleanupFn
    })

    return () => {
      if (cleanup) cleanup()
    }
  }, [excalidrawAPI, isLoaded, pendingFilesRef])

  const updateCursorPosition = useCallback((cursor) => {
    const presenceRef = presenceRefRef.current
    if (!presenceRef) {
      return
    }

    const payload = cursor
      ? {
          cursor: {
            ...cursor,
            updatedAt: Date.now(),
          },
        }
      : {
          cursor: null,
        }

    update(presenceRef, payload).catch((error) => {
      console.error('Error updating cursor position:', error)
    })
  }, [])

  const updateUserProfile = useCallback(async (updates) => {
    if (!updates || typeof updates !== 'object') {
      return null
    }

    let nextIdentity = null

    setUserIdentity((previous) => {
      if (!previous) {
        const stored = updateStoredUserIdentity(updates)
        nextIdentity = stored
        return stored
      }

      const merged = {
        ...previous,
        ...updates,
        avatarUrl:
          updates.avatarUrl !== undefined
            ? updates.avatarUrl
            : previous.avatarUrl ?? null,
      }

      updateStoredUserIdentity(merged)
      nextIdentity = merged
      return merged
    })

    const presenceRef = presenceRefRef.current
    const presenceUpdates = {}
    if (updates.username !== undefined) {
      presenceUpdates.username = updates.username
    }
    if (updates.color !== undefined) {
      presenceUpdates.color = updates.color
    }
    if (updates.avatarUrl !== undefined) {
      presenceUpdates.avatarUrl = updates.avatarUrl
    }

    if (presenceRef && Object.keys(presenceUpdates).length > 0) {
      try {
        await update(presenceRef, {
          ...presenceUpdates,
          lastActiveAt: serverTimestamp(),
        })
      } catch (error) {
        console.error('Error updating presence profile:', error)
      }
    }

    if (sessionRefRef.current && Object.keys(presenceUpdates).length > 0) {
      try {
        await update(sessionRefRef.current, {
          ...presenceUpdates,
          lastActiveAt: serverTimestamp(),
        })
      } catch (error) {
        console.error('Error updating session profile:', error)
      }
    }

    return nextIdentity
  }, [])

  const saveChanges = useCallback((reason = 'manual') => {
    const flush = flushPendingSaveRef.current
    if (!flush) {
      if (import.meta.env?.DEV) {
        console.warn('saveChanges invoked before collaboration initialized', { reason })
      }
      return null
    }
    return flush({ reason, allowRetry: false })
  }, [])

  const [isRefreshing, setIsRefreshing] = useState(false)

  const refreshCanvas = useCallback(async () => {
    if (isRefreshing) {
      console.log('Refresh already in progress')
      return
    }

    setIsRefreshing(true)
    try {
      // Access fetchCanvasState through the ref we'll need to set up
      const canvasRef = ref(database, CANVAS_PATH)
      const snapshot = await get(canvasRef)

      if (!excalidrawAPI) {
        console.warn('Cannot refresh: Excalidraw API not initialized')
        return
      }

      const data = snapshot.exists() ? snapshot.val() : null
      if (!data?.sceneJSON) {
        console.log('No canvas data to refresh')
        return
      }

      console.log('Manual refresh: pulling latest from database')

      const sceneData = JSON.parse(data.sceneJSON)
      const filesData = data.files ? JSON.parse(data.files) : {}

      // Force update scene with latest data
      excalidrawAPI.updateScene({
        elements: sceneData.elements || [],
        appState: sceneData.appState || {},
        files: filesData,
      })

      console.log('Manual refresh complete', {
        elementCount: sceneData.elements?.length || 0,
        fileCount: Object.keys(filesData).length,
      })
    } catch (error) {
      console.error('Manual refresh failed:', error)
    } finally {
      setIsRefreshing(false)
    }
  }, [excalidrawAPI, isRefreshing])

  return {
    isLoaded,
    userIdentity,
    onlineUsers,
    isAdmin,
    updateCursorPosition,
    updateUserProfile,
    saveChanges,
    refreshCanvas,
    isSaving: isSavingScene,
    isRefreshing,
    hasPendingChanges,
    lastSavedAt,
    lastSyncInfo,
  }
}
