import { useEffect, useRef, useState } from 'react'
import { ref, set, onValue, onDisconnect } from 'firebase/database'
import { database } from './firebase'
import { getOrCreateUserIdentity } from './userIdentity'

const CANVAS_PATH = 'canvas/scene'
const PRESENCE_PATH = 'presence/users'

export function useCollaboration(excalidrawAPI) {
  const [isLoaded, setIsLoaded] = useState(false)
  const [userIdentity, setUserIdentity] = useState(null)
  const userIdRef = useRef(null)
  const isSyncingRef = useRef(false)
  const lastUpdateRef = useRef(null)
  const hasLoadedInitialDataRef = useRef(false)
  const previousSceneRef = useRef(null)

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

      // Set up presence
      const setupPresence = () => {
        const userPresence = {
          id: userId,
          username: identity.username,
          color: identity.color,
          joinedAt: Date.now(),
        }

        set(presenceRef, userPresence)
        onDisconnect(presenceRef).remove()
      }

    // Listen for canvas changes from Firebase
    const unsubscribeCanvas = onValue(canvasRef, (snapshot) => {
      const data = snapshot.val()

      if (data && !isSyncingRef.current) {
        try {
          // Data is stored as a JSON string, parse it
          const sceneData = JSON.parse(data.sceneJSON)

          console.log('Loading from Firebase:', {
            elementCount: sceneData.elements?.length || 0,
          })

          // Set syncing flag to prevent this update from triggering a save
          isSyncingRef.current = true

          // Load the scene from Firebase
          excalidrawAPI.updateScene(sceneData)

          // Store this as the previous scene for ownership tracking
          previousSceneRef.current = sceneData.elements

          // Reset syncing flag after a brief delay
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
        // No data in Firebase yet, mark as loaded
        console.log('No data in Firebase, starting fresh')
        if (!isLoaded) {
          setIsLoaded(true)
        }
        hasLoadedInitialDataRef.current = true
      }
    })

    // Listen for local changes and sync to Firebase
    const handleChange = (elements, appState) => {
      // Don't sync if we haven't loaded initial data yet
      if (!hasLoadedInitialDataRef.current) {
        return
      }

      // Don't sync if we're currently loading from Firebase
      if (isSyncingRef.current) {
        return
      }

      // Debounce updates
      if (lastUpdateRef.current) {
        clearTimeout(lastUpdateRef.current)
      }

      lastUpdateRef.current = setTimeout(() => {
        isSyncingRef.current = true

        // Get the current scene
        let sceneElements = excalidrawAPI.getSceneElements()
        const previousElements = previousSceneRef.current || []

        // Create a map of previous elements by ID for quick lookup
        const previousMap = new Map(previousElements.map((el) => [el.id, el]))
        const currentMap = new Map(sceneElements.map((el) => [el.id, el]))

        // Check for unauthorized changes and add ownership to new elements
        const authorizedElements = []
        let hasUnauthorizedChange = false

        for (const element of sceneElements) {
          const previousElement = previousMap.get(element.id)

          if (!previousElement) {
            // New element - add ownership
            const ownedElement = {
              ...element,
              customData: {
                ...element.customData,
                createdBy: userId,
              },
            }
            authorizedElements.push(ownedElement)
          } else {
            // Existing element - check if it was modified
            const owner = previousElement.customData?.createdBy

            if (!owner || owner === userId) {
              // User owns this element or no owner (legacy), allow changes
              authorizedElements.push(element)
            } else {
              // Element is owned by someone else
              // Check if it was actually modified
              const wasModified = JSON.stringify(previousElement) !== JSON.stringify(element)

              if (wasModified) {
                // Unauthorized modification - revert to previous state
                console.log(`Blocked modification to element ${element.id} owned by ${owner}`)
                authorizedElements.push(previousElement)
                hasUnauthorizedChange = true
              } else {
                // No change, keep as is
                authorizedElements.push(element)
              }
            }
          }
        }

        // Check for deleted elements - only allow deleting own elements
        for (const previousElement of previousElements) {
          if (!currentMap.has(previousElement.id)) {
            const owner = previousElement.customData?.createdBy

            if (owner && owner !== userId) {
              // Someone else's element was deleted - restore it
              console.log(`Blocked deletion of element ${previousElement.id} owned by ${owner}`)
              authorizedElements.push(previousElement)
              hasUnauthorizedChange = true
            }
          }
        }

        // If there were unauthorized changes, update the local canvas
        if (hasUnauthorizedChange) {
          excalidrawAPI.updateScene({ elements: authorizedElements })
        }

        // Update our tracking of the previous scene
        previousSceneRef.current = authorizedElements

        // Create scene object
        const sceneData = {
          elements: authorizedElements,
          appState: {
            viewBackgroundColor: appState.viewBackgroundColor,
            gridSize: appState.gridSize,
          },
        }

        // Serialize to JSON string to preserve exact structure
        const sceneJSON = JSON.stringify(sceneData)

        const canvasData = {
          sceneJSON,
          updatedBy: userId,
          updatedAt: Date.now(),
        }

        console.log('Saving to Firebase:', {
          elementCount: sceneData.elements.length,
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

      setupPresence()
      const unsubscribeChange = excalidrawAPI.onChange(handleChange)

      // Cleanup
      return () => {
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

  return { isLoaded, userIdentity }
}
