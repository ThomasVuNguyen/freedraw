import { useEffect, useRef, useState } from 'react'
import { onDisconnect, onValue, push, ref, serverTimestamp, set, update } from 'firebase/database'
import { database } from './firebase'
import { getOrCreateUserIdentity } from './userIdentity'

const CANVAS_PATH = 'canvas/scene'
const PRESENCE_PATH = 'presence/users'
const SESSIONS_PATH = 'sessions'
const HEARTBEAT_INTERVAL = 20000

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
  const userIdRef = useRef(null)
  const isSyncingRef = useRef(false)
  const lastUpdateRef = useRef(null)
  const hasLoadedInitialDataRef = useRef(false)
  const previousSceneRef = useRef(null)
  const sessionRefRef = useRef(null)
  const heartbeatRef = useRef(null)

  useEffect(() => {
    const presenceListRef = ref(database, PRESENCE_PATH)
    const unsubscribePresence = onValue(presenceListRef, (snapshot) => {
      const presenceData = snapshot.val() || {}
      const users = Object.values(presenceData).filter(Boolean)
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

      const setupPresence = () => {
        const userPresence = {
          id: userId,
          username: identity.username,
          color: identity.color,
          joinedAt: Date.now(),
          lastActiveAt: serverTimestamp(),
        }

        set(presenceRef, userPresence)
        onDisconnect(presenceRef).remove()
      }

      const startSession = async () => {
        const newSessionRef = push(sessionsListRef)
        sessionRefRef.current = newSessionRef

        await set(newSessionRef, {
          id: newSessionRef.key,
          userId,
          username: identity.username,
          color: identity.color,
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

      const unsubscribeCanvas = onValue(canvasRef, (snapshot) => {
        const data = snapshot.val()

        if (data && !isSyncingRef.current) {
          try {
            const sceneData = JSON.parse(data.sceneJSON)

            console.log('Loading from Firebase:', {
              elementCount: sceneData.elements?.length || 0,
              fileCount: data.files ? Object.keys(JSON.parse(data.files)).length : 0,
            })

            isSyncingRef.current = true

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

            const updateData = filesToLoad
              ? { ...sceneData, files: filesToLoad }
              : sceneData

            excalidrawAPI.updateScene(updateData)

            previousSceneRef.current = cloneElements(sceneData.elements)

            setTimeout(() => {
              isSyncingRef.current = false
            }, 500)

            if (!isLoaded) {
              setIsLoaded(true)
            }

            hasLoadedInitialDataRef.current = true
          } catch (error) {
            console.error('Error loading canvas from Firebase:', error)
            hasLoadedInitialDataRef.current = true
            isSyncingRef.current = false
          }
        } else if (!data) {
          console.log('No data in Firebase, starting fresh')
          if (!isLoaded) {
            setIsLoaded(true)
          }
          hasLoadedInitialDataRef.current = true
        }
      })

      const handleChange = (elements, appState) => {
        if (!hasLoadedInitialDataRef.current) {
          return
        }

        if (isSyncingRef.current) {
          return
        }

        const previousElements = previousSceneRef.current || []
        const previousMap = new Map()
        previousElements.forEach((el, index) => {
          previousMap.set(el.id, { element: el, index })
        })

        const authorizedElements = []
        const seenIds = new Set()
        let hasUnauthorizedChange = false

        for (let index = 0; index < elements.length; index += 1) {
          const element = elements[index]
          const clonedElement = cloneElement(element)
          seenIds.add(element.id)

          const prevEntry = previousMap.get(element.id)

          if (!prevEntry) {
            clonedElement.customData = {
              ...clonedElement.customData,
              createdBy: userId,
            }
            authorizedElements[index] = clonedElement
            continue
          }

          const previousElement = prevEntry.element
          const owner = previousElement.customData?.createdBy

          if (!owner || owner === userId) {
            clonedElement.customData = {
              ...clonedElement.customData,
              createdBy: owner ?? userId,
            }
            authorizedElements[index] = clonedElement
            continue
          }

          const wasModified = JSON.stringify(previousElement) !== JSON.stringify(element)

          if (wasModified) {
            console.log(`Blocked modification to element ${element.id} owned by ${owner}`)
            authorizedElements[index] = cloneElement(previousElement)
            hasUnauthorizedChange = true
          } else {
            authorizedElements[index] = cloneElement(previousElement)
          }
        }

        for (const previousElement of previousElements) {
          if (seenIds.has(previousElement.id)) {
            continue
          }

          const owner = previousElement.customData?.createdBy
          if (owner && owner !== userId) {
            console.log(`Blocked deletion of element ${previousElement.id} owned by ${owner}`)
            const insertIndex = previousMap.get(previousElement.id)?.index ?? authorizedElements.length
            authorizedElements.splice(insertIndex, 0, cloneElement(previousElement))
            hasUnauthorizedChange = true
          }
        }

        previousSceneRef.current = cloneElements(authorizedElements)

        if (hasUnauthorizedChange) {
          isSyncingRef.current = true
          excalidrawAPI.updateScene({ elements: authorizedElements })
          const releaseSyncFlag = () => {
            isSyncingRef.current = false
          }
          if (typeof requestAnimationFrame === 'function') {
            requestAnimationFrame(releaseSyncFlag)
          } else {
            setTimeout(releaseSyncFlag, 0)
          }
        }

        if (lastUpdateRef.current) {
          clearTimeout(lastUpdateRef.current)
        }

        lastUpdateRef.current = setTimeout(() => {
          isSyncingRef.current = true

          const sceneElements =
            (previousSceneRef.current && cloneElements(previousSceneRef.current)) ||
            cloneElements(excalidrawAPI.getSceneElements())
          const sceneData = {
            elements: sceneElements,
            appState: {
              viewBackgroundColor: appState.viewBackgroundColor,
              gridSize: appState.gridSize,
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
          })

          set(canvasRef, canvasData)
            .then(() => {
              setTimeout(() => {
                isSyncingRef.current = false
              }, 100)
            })
            .catch((error) => {
              console.error('Error syncing to Firebase:', error)
              isSyncingRef.current = false
            })
        }, 300)
      }

      const unsubscribeChange = excalidrawAPI.onChange(handleChange)

      return () => {
        if (heartbeatRef.current) {
          clearInterval(heartbeatRef.current)
          heartbeatRef.current = null
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

        if (lastUpdateRef.current) {
          clearTimeout(lastUpdateRef.current)
        }

        unsubscribeCanvas()
        if (unsubscribeChange) {
          unsubscribeChange()
        }

        set(presenceRef, null)
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
  }, [excalidrawAPI, isLoaded])

  return { isLoaded, userIdentity, onlineUsers }
}
