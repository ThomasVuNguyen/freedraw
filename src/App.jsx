import { useCallback, useRef, useState } from 'react'
import { Excalidraw } from '@excalidraw/excalidraw'
import '@excalidraw/excalidraw/index.css'

import './App.css'
import { useCollaboration } from './useCollaboration'
import { handleImageUpload } from './imageHandler'

const APP_NAME = 'Infinite Canvas Studio'

function App() {
  const excalidrawRef = useRef(null)
  const [excalidrawAPI, setExcalidrawAPI] = useState(null)
  const [theme, setTheme] = useState('light')
  const [gridMode, setGridMode] = useState(false)
  const [viewMode, setViewMode] = useState(false)
  const [zenMode, setZenMode] = useState(false)
  const pendingFilesRef = useRef({})

  // Enable real-time collaboration
  const { isLoaded, userIdentity } = useCollaboration(excalidrawAPI, pendingFilesRef)

  const handleResetScene = useCallback(() => {
    if (!excalidrawAPI || !userIdentity) {
      return
    }

    const currentElements = excalidrawAPI.getSceneElements()
    if (!currentElements.length) {
      return
    }

    const retainedElements = currentElements.filter((element) => {
      const owner = element.customData?.createdBy
      if (!owner) {
        return true
      }
      return owner !== userIdentity.browserId
    })

    if (retainedElements.length === currentElements.length) {
      return
    }

    excalidrawAPI.updateScene({ elements: retainedElements })
  }, [excalidrawAPI, userIdentity])

  const handleThemeToggle = useCallback(() => {
    setTheme((current) => (current === 'light' ? 'dark' : 'light'))
  }, [])

  const handleGridToggle = useCallback(() => {
    setGridMode((current) => !current)
  }, [])

  const handleViewToggle = useCallback(() => {
    setViewMode((current) => !current)
  }, [])

  const handleZenToggle = useCallback(() => {
    setZenMode((current) => !current)
  }, [])

  // Handle image paste/upload - upload to Firebase Storage
  const handlePaste = useCallback(
    async (data, event) => {
      // Check if clipboard contains files (images)
      const items = event?.clipboardData?.items
      if (!items || !userIdentity) return false

      for (let i = 0; i < items.length; i++) {
        const item = items[i]

        // Check if the item is an image
        if (item.type.indexOf('image') !== -1) {
          event.preventDefault()

          const file = item.getAsFile()
          if (!file) continue

          try {
            // Upload image to Firebase Storage
            console.log('Uploading pasted image...')
            const uploadedImage = await handleImageUpload(file, userIdentity.browserId)
            console.log('Image uploaded successfully:', uploadedImage.dataURL)

            // Create an image element directly without using Excalidraw's addFiles
            // This bypasses the Pica resizing that causes fingerprinting issues
            if (excalidrawAPI) {
              // Get viewport center to place image at cursor/center
              const appState = excalidrawAPI.getAppState()
              const viewportX = appState.scrollX || 0
              const viewportY = appState.scrollY || 0

              const imageElement = {
                type: 'image',
                id: uploadedImage.id,
                x: -viewportX + 100,
                y: -viewportY + 100,
                width: uploadedImage.width,
                height: uploadedImage.height,
                angle: 0,
                strokeColor: 'transparent',
                backgroundColor: 'transparent',
                fillStyle: 'hachure',
                strokeWidth: 1,
                strokeStyle: 'solid',
                roughness: 0,
                opacity: 100,
                groupIds: [],
                roundness: null,
                seed: Math.floor(Math.random() * 2 ** 31),
                version: 1,
                versionNonce: Math.floor(Math.random() * 2 ** 31),
                isDeleted: false,
                boundElements: null,
                updated: Date.now(),
                link: null,
                locked: false,
                fileId: uploadedImage.id,
                scale: [1, 1],
                status: 'saved',
              }

              // Store the file in pending files ref for collaboration sync
              pendingFilesRef.current[uploadedImage.id] = {
                id: uploadedImage.id,
                dataURL: uploadedImage.dataURL,
                mimeType: uploadedImage.mimeType,
                created: uploadedImage.created,
              }

              // Get current scene
              const currentElements = excalidrawAPI.getSceneElements()

              // Add the element to the scene
              // The file will be synced via Firebase collaboration using pendingFilesRef
              excalidrawAPI.updateScene({
                elements: [...currentElements, imageElement],
              })

              console.log('Image element added to canvas, file stored for sync')
            }

            return true
          } catch (error) {
            console.error('Failed to upload image:', error)
            return false
          }
        }
      }

      return false
    },
    [excalidrawAPI, userIdentity]
  )

  return (
    <div className={`app app-${theme}`}>
      <header className="toolbar">
        <h1>{APP_NAME}</h1>

        <div className="toolbar-controls">
          <button type="button" onClick={handleThemeToggle}>
            Toggle {theme === 'light' ? 'Dark' : 'Light'}
          </button>
          <button type="button" onClick={handleGridToggle}>
            {gridMode ? 'Hide Grid' : 'Show Grid'}
          </button>
          <button type="button" onClick={handleViewToggle}>
            {viewMode ? 'Edit Mode' : 'View Mode'}
          </button>
          <button type="button" onClick={handleZenToggle}>
            {zenMode ? 'Exit Zen' : 'Enter Zen'}
          </button>
          <button
            type="button"
            onClick={handleResetScene}
            disabled={!userIdentity || !excalidrawAPI}
          >
            Clear My Items
          </button>
        </div>
      </header>

      <main className="canvas-area">
        {!isLoaded && (
          <div className="loading-overlay">
            <div className="loading-message">Loading shared canvas...</div>
          </div>
        )}
        {userIdentity && (
          <div className="user-id-display">
            <span className="user-id-label">You are:</span>
            <span
              className="user-id-value"
              style={{ color: userIdentity.color, fontWeight: 'bold' }}
            >
              {userIdentity.username}
            </span>
          </div>
        )}
        <Excalidraw
          ref={excalidrawRef}
          excalidrawAPI={setExcalidrawAPI}
          theme={theme}
          viewModeEnabled={viewMode}
          zenModeEnabled={zenMode}
          gridModeEnabled={gridMode}
          onPaste={handlePaste}
          UIOptions={{
            canvasActions: {
              toggleTheme: false,
              viewBackgroundColor: false,
            },
          }}
          initialData={{
            appState: {
              name: APP_NAME,
            },
          }}
        />
      </main>
    </div>
  )
}

export default App
