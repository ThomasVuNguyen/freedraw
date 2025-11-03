/* global __APP_VERSION__ */

import { useCallback, useEffect, useRef, useState } from 'react'
import { Excalidraw } from '@excalidraw/excalidraw'
import '@excalidraw/excalidraw/index.css'

import './App.css'
import { useCollaboration } from './useCollaboration'
import { handleImageUpload } from './imageHandler'

const APP_NAME = 'Arcadia'

// Version info injected at build time
const APP_VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev'

function App() {
  const excalidrawRef = useRef(null)
  const [excalidrawAPI, setExcalidrawAPI] = useState(null)
  const [theme, setTheme] = useState('dark')
  const [gridMode, setGridMode] = useState(false)
  const [viewMode, setViewMode] = useState(false)
  const [zenMode, setZenMode] = useState(false)
  const pendingFilesRef = useRef({})
  const hoverInfoRef = useRef(null)
  const [hoveredOwner, setHoveredOwner] = useState(null)

  // Enable real-time collaboration
  const { isLoaded, userIdentity, onlineUsers, isAdmin } = useCollaboration(
    excalidrawAPI,
    pendingFilesRef
  )

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

  useEffect(() => {
    if (!excalidrawAPI || !userIdentity?.color) {
      return
    }

    const currentAppState = excalidrawAPI.getAppState()

    if (currentAppState?.currentItemStrokeColor === userIdentity.color) {
      return
    }

    const nextAppState = {
      ...currentAppState,
      currentItemStrokeColor: userIdentity.color,
    }

    excalidrawAPI.updateScene({ appState: nextAppState })
  }, [excalidrawAPI, userIdentity])

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
                customData: {
                  createdBy: userIdentity.browserId,
                  createdByUsername: userIdentity.username,
                  createdByColor: userIdentity.color,
                },
              }

              // Store the file in pending files ref for collaboration sync
              pendingFilesRef.current[uploadedImage.id] = {
                id: uploadedImage.id,
                dataURL: uploadedImage.dataURL,
                mimeType: uploadedImage.mimeType,
                created: uploadedImage.created,
              }

              // Register the uploaded asset with Excalidraw so it can render immediately
              const newFile = {
                id: uploadedImage.id,
                dataURL: uploadedImage.dataURL,
                mimeType: uploadedImage.mimeType,
                created: uploadedImage.created,
                lastRetrieved: Date.now(),
              }

              excalidrawAPI.addFiles([newFile])

              const currentElements = excalidrawAPI.getSceneElements()

              // Inject the uploaded file and new element into the scene
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

  const visibleOnlineUsers = onlineUsers.slice(0, 5)
  const overflowCount = Math.max(onlineUsers.length - visibleOnlineUsers.length, 0)

  useEffect(() => {
    if (!excalidrawAPI || typeof window === 'undefined') {
      return
    }

    const clearHoverInfo = () => {
      hoverInfoRef.current = null
      setHoveredOwner(null)
    }

    const handlePointerMove = (event) => {
      const appState = excalidrawAPI.getAppState()
      if (!appState) {
        clearHoverInfo()
        return
      }

      if (appState.cursorButton === 'down') {
        clearHoverInfo()
        return
      }

      const { offsetLeft = 0, offsetTop = 0, width = 0, height = 0 } = appState
      const viewportX = event.clientX - offsetLeft
      const viewportY = event.clientY - offsetTop

      if (viewportX < 0 || viewportY < 0 || viewportX > width || viewportY > height) {
        clearHoverInfo()
        return
      }

      const zoom = appState.zoom?.value ?? 1
      const sceneX = viewportX / zoom - (appState.scrollX ?? 0)
      const sceneY = viewportY / zoom - (appState.scrollY ?? 0)

      const elements = excalidrawAPI.getSceneElements().filter(
        (element) => !element.isDeleted && element.type !== 'selection'
      )

      const getElementBounds = (element) => {
        const angle = element.angle || 0

        const calculateRotatedPoint = (pointX, pointY, centerX, centerY) => {
          const cosAngle = Math.cos(angle)
          const sinAngle = Math.sin(angle)
          const translatedX = pointX - centerX
          const translatedY = pointY - centerY

          return {
            x: translatedX * cosAngle - translatedY * sinAngle + centerX,
            y: translatedX * sinAngle + translatedY * cosAngle + centerY,
          }
        }

        const corners = [
          { x: element.x, y: element.y },
          { x: element.x + element.width, y: element.y },
          { x: element.x + element.width, y: element.y + element.height },
          { x: element.x, y: element.y + element.height },
        ]

        const centerX = element.x + element.width / 2
        const centerY = element.y + element.height / 2

        const rotatedCorners =
          angle === 0
            ? corners
            : corners.map(({ x, y }) => calculateRotatedPoint(x, y, centerX, centerY))

        const xs = rotatedCorners.map((corner) => corner.x)
        const ys = rotatedCorners.map((corner) => corner.y)

        const margin =
          Math.max(8 / zoom, (element.strokeWidth || 1) / zoom) +
          (element.type === 'arrow' || element.type === 'line' ? 4 / zoom : 0)

        return {
          minX: Math.min(...xs) - margin,
          maxX: Math.max(...xs) + margin,
          minY: Math.min(...ys) - margin,
          maxY: Math.max(...ys) + margin,
        }
      }

      let hoveredElement = null
      for (let index = elements.length - 1; index >= 0; index -= 1) {
        const element = elements[index]

        if (!element) {
          continue
        }

        const bounds = getElementBounds(element)

        if (
          sceneX >= bounds.minX &&
          sceneX <= bounds.maxX &&
          sceneY >= bounds.minY &&
          sceneY <= bounds.maxY
        ) {
          hoveredElement = element
          break
        }
      }

      if (!hoveredElement) {
        clearHoverInfo()
        return
      }

      const customData = hoveredElement.customData || {}
      const ownerId = customData.createdBy
      const presenceOwner = onlineUsers.find((user) => user.id === ownerId)
      const ownerName =
        customData.createdByUsername ||
        presenceOwner?.username ||
        (ownerId ? `User ${ownerId.substring(0, 6)}` : 'Unknown owner')
      const ownerColor =
        customData.createdByColor || presenceOwner?.color || '#4ECDC4'

      const offset = 16
      const maxWidth = 220
      const maxHeight = 72
      const targetX = Math.min(event.clientX + offset, window.innerWidth - maxWidth)
      const targetY = Math.min(event.clientY + offset, window.innerHeight - maxHeight)

      const nextHoverInfo = {
        elementId: hoveredElement.id,
        ownerId,
        ownerName,
        ownerColor,
        position: { x: targetX, y: targetY },
      }

      hoverInfoRef.current = nextHoverInfo
      setHoveredOwner((prev) => {
        if (
          prev &&
          prev.elementId === nextHoverInfo.elementId &&
          prev.ownerName === nextHoverInfo.ownerName &&
          prev.ownerColor === nextHoverInfo.ownerColor &&
          Math.abs(prev.position.x - nextHoverInfo.position.x) < 1 &&
          Math.abs(prev.position.y - nextHoverInfo.position.y) < 1
        ) {
          return prev
        }
        return nextHoverInfo
      })
    }

    const handlePointerDown = () => {
      clearHoverInfo()
    }

    window.addEventListener('pointermove', handlePointerMove, { passive: true })
    window.addEventListener('pointerdown', handlePointerDown, { passive: true })
    window.addEventListener('pointerleave', clearHoverInfo, { passive: true })

    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerdown', handlePointerDown)
      window.removeEventListener('pointerleave', clearHoverInfo)
    }
  }, [excalidrawAPI, onlineUsers])

  return (
    <div className={`app app-${theme}`}>
      <header className="toolbar">
        <h1>
          {APP_NAME}
          <span className="version-info">
            v{APP_VERSION}
          </span>
        </h1>

        <div className="online-indicator" aria-live="polite">
          <span className="online-dot" />
          <span className="online-count">
            {onlineUsers.length} {onlineUsers.length === 1 ? 'person online' : 'people online'}
          </span>
          <div className="online-avatars" role="list">
            {visibleOnlineUsers.map((user) => (
              <span
                role="listitem"
                key={user.id}
                className="online-avatar"
                style={{ backgroundColor: user.color }}
                title={user.username}
              >
                {user.username?.charAt(0)?.toUpperCase() ?? '?'}
              </span>
            ))}
            {overflowCount > 0 && <span className="online-more">+{overflowCount}</span>}
          </div>
        </div>

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
          <a href="/analytics" className="analytics-link">
            📊 Analytics
          </a>
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
            {isAdmin && <span className="user-role-badge">Admin</span>}
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
          validateEmbeddable={() => true}
          UIOptions={{
            canvasActions: {
              toggleTheme: false,
              viewBackgroundColor: false,
            },
          }}
          initialData={{
            appState: {
              name: APP_NAME,
              currentItemStrokeColor: userIdentity?.color || '#4ECDC4',
              currentItemBackgroundColor: 'transparent',
            },
          }}
        />
      </main>
      {hoveredOwner && (
        <div
          className="element-owner-tooltip"
          style={{
            top: hoveredOwner.position.y,
            left: hoveredOwner.position.x,
          }}
        >
          <span
            className="owner-tooltip-dot"
            style={{ backgroundColor: hoveredOwner.ownerColor }}
          />
          <div className="owner-tooltip-text">
            <span className="owner-tooltip-label">Owned by</span>
            <span className="owner-tooltip-value">{hoveredOwner.ownerName}</span>
          </div>
        </div>
      )}
    </div>
  )
}

export default App
