import { useEffect, useRef, useState } from 'react'
import { ref, set, onValue, onDisconnect } from 'firebase/database'
import { database } from './firebase'

const CANVAS_PATH = 'canvas/scene'
const PRESENCE_PATH = 'presence/users'

export function useCollaboration(excalidrawAPI) {
  const [isLoaded, setIsLoaded] = useState(false)
  const userIdRef = useRef(null)
  const isSyncingRef = useRef(false)
  const lastUpdateRef = useRef(null)
  const hasLoadedInitialDataRef = useRef(false)

  useEffect(() => {
    if (!excalidrawAPI) return

    // Generate unique user ID
    if (!userIdRef.current) {
      userIdRef.current = `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    }

    const userId = userIdRef.current
    const canvasRef = ref(database, CANVAS_PATH)
    const presenceRef = ref(database, `${PRESENCE_PATH}/${userId}`)

    // Set up presence
    const setupPresence = () => {
      const userPresence = {
        id: userId,
        joinedAt: Date.now(),
        color: generateUserColor(),
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
        const sceneElements = excalidrawAPI.getSceneElements()

        // Create scene object
        const sceneData = {
          elements: sceneElements,
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
  }, [excalidrawAPI, isLoaded])

  return { isLoaded }
}

// Generate a random color for each user
function generateUserColor() {
  const colors = [
    '#FF6B6B',
    '#4ECDC4',
    '#45B7D1',
    '#FFA07A',
    '#98D8C8',
    '#F7B731',
    '#5F27CD',
    '#00D2D3',
    '#FF9FF3',
    '#54A0FF',
    '#48DBFB',
    '#1DD1A1',
    '#F368E0',
    '#FF9F43',
  ]
  return colors[Math.floor(Math.random() * colors.length)]
}
