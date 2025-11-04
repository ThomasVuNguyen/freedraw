/* global __APP_VERSION__ */

import { useCallback, useEffect, useRef, useState } from 'react'
import { Excalidraw } from '@excalidraw/excalidraw'
import {
  MoonStars,
  Sun,
  GridFour,
  Eye,
  EyeSlash,
  ChartLineUp,
  MagnifyingGlass,
} from '@phosphor-icons/react'
import '@excalidraw/excalidraw/index.css'

import './App.css'
import { useCollaboration } from './useCollaboration'
import { handleImageUpload, uploadAvatarToStorage } from './imageHandler'
import AvatarSetup from './AvatarSetup'

const APP_NAME = 'Arcadia'

// Version info injected at build time
const APP_VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev'

function App() {
  const excalidrawRef = useRef(null)
  const [excalidrawAPI, setExcalidrawAPI] = useState(null)
  const [theme, setTheme] = useState('dark')
  const [gridMode, setGridMode] = useState(false)
  const [viewMode, setViewMode] = useState(false)
  const [zenMode] = useState(true)
  const pendingFilesRef = useRef({})
  const hoverInfoRef = useRef(null)
  const lastCursorUpdateRef = useRef(0)
  const lastSentCursorRef = useRef({ x: null, y: null })
  const [hoveredOwner, setHoveredOwner] = useState(null)
  const [viewportState, setViewportState] = useState({
    scrollX: 0,
    scrollY: 0,
    zoom: 1,
    offsetLeft: 0,
    offsetTop: 0,
  })
  const [isSearchOpen, setIsSearchOpen] = useState(false)
  const [isAvatarSetupOpen, setIsAvatarSetupOpen] = useState(false)
  const [hasDismissedAvatarPrompt, setHasDismissedAvatarPrompt] = useState(false)
  const [isManualAvatarEdit, setIsManualAvatarEdit] = useState(false)

  // Enable real-time collaboration
  const {
    isLoaded,
    userIdentity,
    onlineUsers,
    isAdmin,
    updateCursorPosition,
    updateUserProfile,
  } = useCollaboration(
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

  useEffect(() => {
    if (!userIdentity) {
      return
    }

    if (!userIdentity.avatarUrl && !hasDismissedAvatarPrompt) {
      setIsAvatarSetupOpen(true)
    } else if (!isManualAvatarEdit) {
      setIsAvatarSetupOpen(false)
    }
  }, [userIdentity, hasDismissedAvatarPrompt, isManualAvatarEdit])

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

  const onlineCount = onlineUsers.length
  const visibleOnlineUsers = onlineUsers.slice(0, 5)
  const overflowCount = Math.max(onlineCount - visibleOnlineUsers.length, 0)

  const handleSearchToggle = useCallback(() => {
    if (!excalidrawAPI) {
      return
    }
    const open = excalidrawAPI.getAppState()?.openSidebar?.tab === 'search'
    excalidrawAPI.updateScene({
      appState: {
        openSidebar: open ? null : { name: 'default', tab: 'search' },
      },
    })
  }, [excalidrawAPI])

  const handleAvatarSave = useCallback(
    async (blob) => {
      if (!userIdentity?.browserId) {
        throw new Error('User identity not ready')
      }
      try {
        const avatarUrl = await uploadAvatarToStorage(blob, userIdentity.browserId)
        await updateUserProfile({ avatarUrl })
        setHasDismissedAvatarPrompt(true)
        setIsAvatarSetupOpen(false)
        setIsManualAvatarEdit(false)
      } catch (error) {
        console.error('Error saving avatar:', error)
        throw error
      }
    },
    [updateUserProfile, userIdentity]
  )

  const handleAvatarSkip = useCallback(() => {
    if (!userIdentity?.avatarUrl) {
      setHasDismissedAvatarPrompt(true)
    }
    setIsAvatarSetupOpen(false)
    setIsManualAvatarEdit(false)
  }, [userIdentity])

  const handleAvatarEdit = useCallback(() => {
    setIsManualAvatarEdit(true)
    setIsAvatarSetupOpen(true)
  }, [])

  useEffect(() => {
    if (!excalidrawAPI) {
      return undefined
    }

    const initialState = excalidrawAPI.getAppState()
    if (initialState) {
      setViewportState((prev) => ({
        ...prev,
        scrollX: initialState.scrollX ?? 0,
        scrollY: initialState.scrollY ?? 0,
        zoom: initialState.zoom?.value ?? initialState.zoom ?? 1,
        offsetLeft: initialState.offsetLeft ?? 0,
        offsetTop: initialState.offsetTop ?? 0,
      }))
    }

    const unsubscribe = excalidrawAPI.onScrollChange((scrollX, scrollY, zoom) => {
      const zoomValue =
        typeof zoom === 'number' ? zoom : typeof zoom?.value === 'number' ? zoom.value : 1

      setViewportState((prev) => {
        if (prev.scrollX === scrollX && prev.scrollY === scrollY && prev.zoom === zoomValue) {
          return prev
        }
        return {
          ...prev,
          scrollX,
          scrollY,
          zoom: zoomValue,
        }
      })
    })

    return () => {
      if (typeof unsubscribe === 'function') {
        unsubscribe()
      }
    }
  }, [excalidrawAPI])

  useEffect(() => {
    if (!excalidrawAPI) {
      return undefined
    }

    const unsubscribe = excalidrawAPI.onChange((_, appState) => {
      const open = appState.openSidebar?.tab === 'search'
      setIsSearchOpen((prev) => (prev === open ? prev : open))
    })

    return () => {
      if (typeof unsubscribe === 'function') {
        unsubscribe()
      }
    }
  }, [excalidrawAPI])

  useEffect(() => {
    if (!excalidrawAPI) {
      return undefined
    }

    const updateOffsets = () => {
      const appState = excalidrawAPI.getAppState()
      if (!appState) {
        return
      }

      setViewportState((prev) => {
        const offsetLeft = appState.offsetLeft ?? 0
        const offsetTop = appState.offsetTop ?? 0
        if (prev.offsetLeft === offsetLeft && prev.offsetTop === offsetTop) {
          return prev
        }
        return {
          ...prev,
          offsetLeft,
          offsetTop,
        }
      })
    }

    updateOffsets()
    window.addEventListener('resize', updateOffsets)

    return () => {
      window.removeEventListener('resize', updateOffsets)
    }
  }, [excalidrawAPI])

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

      setViewportState((prev) => {
        const offsetLeftValue = appState.offsetLeft ?? 0
        const offsetTopValue = appState.offsetTop ?? 0
        if (prev.offsetLeft === offsetLeftValue && prev.offsetTop === offsetTopValue) {
          return prev
        }
        return {
          ...prev,
          offsetLeft: offsetLeftValue,
          offsetTop: offsetTopValue,
        }
      })

      if (userIdentity && updateCursorPosition) {
        const now = performance.now()
        if (now - lastCursorUpdateRef.current > 50) {
          lastCursorUpdateRef.current = now
          const lastSent = lastSentCursorRef.current
          if (
            lastSent.x === null ||
            Math.abs(sceneX - lastSent.x) > 0.5 ||
            Math.abs(sceneY - lastSent.y) > 0.5
          ) {
            lastSentCursorRef.current = { x: sceneX, y: sceneY }
            updateCursorPosition({
              x: sceneX,
              y: sceneY,
              color: userIdentity.color,
              username: userIdentity.username,
            })
          }
        }
      }

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
    const handlePointerLeave = () => {
      clearHoverInfo()
      if (updateCursorPosition) {
        updateCursorPosition(null)
      }
      lastSentCursorRef.current = { x: null, y: null }
    }

    window.addEventListener('pointermove', handlePointerMove, { passive: true })
    window.addEventListener('pointerdown', handlePointerDown, { passive: true })
    window.addEventListener('pointerleave', handlePointerLeave, { passive: true })

    return () => {
      if (updateCursorPosition) {
        updateCursorPosition(null)
      }
      lastSentCursorRef.current = { x: null, y: null }
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerdown', handlePointerDown)
      window.removeEventListener('pointerleave', handlePointerLeave)
    }
  }, [excalidrawAPI, onlineUsers, updateCursorPosition, userIdentity])

  const now = Date.now()

  const remoteCursorElements = onlineUsers
    .filter((user) => user.id !== userIdentity?.browserId)
    .map((user) => {
      const cursor = user.cursor
      if (!cursor) {
        return null
      }

      if (!Number.isFinite(cursor.x) || !Number.isFinite(cursor.y)) {
        return null
      }

      const updatedAt = cursor.syncedAt ?? cursor.updatedAt ?? 0
      if (now - updatedAt > 15000) {
        return null
      }

      const screenX = (cursor.x + viewportState.scrollX) * viewportState.zoom + viewportState.offsetLeft
      const screenY = (cursor.y + viewportState.scrollY) * viewportState.zoom + viewportState.offsetTop

      if (!Number.isFinite(screenX) || !Number.isFinite(screenY)) {
        return null
      }

      const label = cursor.username || user.username || 'Guest'
      const color = cursor.color || user.color || '#4ECDC4'

      return (
        <div
          key={`cursor-${user.id}`}
          className="remote-cursor"
          style={{ top: screenY, left: screenX }}
        >
          <span className="remote-cursor__icon" style={{ backgroundColor: color }} />
          <span className="remote-cursor__label" style={{ borderColor: color }}>
            {label}
          </span>
        </div>
      )
    })
    .filter(Boolean)

  return (
    <div className={`app app-${theme}`}>
      <header className="toolbar">
        <h1>
          {APP_NAME}
          <span className="version-info">
            v{APP_VERSION}
          </span>
        </h1>

        <div
          className="online-indicator"
          aria-live="polite"
          aria-label={`${onlineCount} ${onlineCount === 1 ? 'person online' : 'people online'}`}
        >
          <span className="online-dot" />
          <span className="online-count">
            <span className="online-count-number">{onlineCount}</span>
            <span className="online-count-label">online</span>
          </span>
          <div className="online-avatars" role="list">
            {visibleOnlineUsers.map((user) => (
              <span
                role="listitem"
                key={user.id}
                className={`online-avatar${user.avatarUrl ? ' online-avatar--image' : ''}`}
                style={{ backgroundColor: user.color }}
                title={user.username}
              >
                {user.avatarUrl ? (
                  <img src={user.avatarUrl} alt={`${user.username ?? 'Guest'} avatar`} />
                ) : (
                  user.username?.charAt(0)?.toUpperCase() ?? '?'
                )}
              </span>
            ))}
            {overflowCount > 0 && <span className="online-more">+{overflowCount}</span>}
          </div>
        </div>

        <div className="toolbar-controls">
          <button
            type="button"
            className={`icon-button ${isSearchOpen ? 'icon-button--active' : ''}`}
            onClick={handleSearchToggle}
            aria-label={isSearchOpen ? 'Close Search' : 'Search Canvas'}
            title={isSearchOpen ? 'Close Search' : 'Search Canvas'}
          >
            <MagnifyingGlass size={20} weight={isSearchOpen ? 'fill' : 'regular'} />
          </button>
          <button
            type="button"
            className="icon-button"
            onClick={handleThemeToggle}
            aria-label={`Toggle ${theme === 'light' ? 'Dark' : 'Light'} Mode`}
            title={`Toggle ${theme === 'light' ? 'Dark' : 'Light'} Mode`}
          >
            {theme === 'light' ? <MoonStars size={20} weight="fill" /> : <Sun size={20} weight="fill" />}
          </button>
          <button
            type="button"
            className="icon-button"
            onClick={handleGridToggle}
            aria-label={gridMode ? 'Hide Grid' : 'Show Grid'}
            title={gridMode ? 'Hide Grid' : 'Show Grid'}
          >
            <GridFour size={20} weight={gridMode ? 'fill' : 'regular'} />
          </button>
          <button
            type="button"
            className="icon-button"
            onClick={handleViewToggle}
            aria-label={viewMode ? 'Exit View Mode' : 'Enter View Mode'}
            title={viewMode ? 'Exit View Mode' : 'Enter View Mode'}
          >
            {viewMode ? <EyeSlash size={20} weight="fill" /> : <Eye size={20} weight="regular" />}
          </button>
          {/*
          <button
            type="button"
            className="icon-button"
            onClick={handleZenToggle}
            aria-label={zenMode ? 'Exit Zen Mode' : 'Enter Zen Mode'}
            title={zenMode ? 'Exit Zen Mode' : 'Enter Zen Mode'}
          >
            {zenMode ? <ArrowsOutSimple size={20} weight="fill" /> : <ArrowsInSimple size={20} weight="regular" />}
          </button>
          */}
          {/*
          <button
            type="button"
            className="icon-button"
            onClick={handleResetScene}
            disabled={!userIdentity || !excalidrawAPI}
            aria-label="Clear My Items"
            title="Clear My Items"
          >
            <Broom size={20} weight="regular" />
          </button>
          */}
          <a
            href="/analytics"
            className="analytics-link icon-link"
            aria-label="Analytics"
            title="Analytics"
          >
            <ChartLineUp size={20} weight="regular" />
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
          <div className="user-card">
            <button
              type="button"
              className={`user-card__portrait${userIdentity.avatarUrl ? ' user-card__portrait--image' : ''}`}
              onClick={handleAvatarEdit}
              aria-label={userIdentity.avatarUrl ? 'Edit avatar' : 'Add avatar'}
            >
              {userIdentity.avatarUrl ? (
                <img src={userIdentity.avatarUrl} alt={`${userIdentity.username} avatar`} />
              ) : (
                <span className="user-card__initial">
                  {userIdentity.username?.charAt(0)?.toUpperCase() ?? '?'}
                </span>
              )}
            </button>
            <div className="user-card__footer">
              <span className="user-card__label">You are</span>
              <span
                className="user-card__name"
                style={{ color: userIdentity.color }}
              >
                {userIdentity.username}
              </span>
              <div className="user-card__meta">
                {isAdmin && <span className="user-role-badge">Admin</span>}
                <button type="button" className="user-card__edit" onClick={handleAvatarEdit}>
                  {userIdentity.avatarUrl ? 'Edit avatar' : 'Add avatar'}
                </button>
              </div>
            </div>
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
      {remoteCursorElements}
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
      <AvatarSetup
        isOpen={isAvatarSetupOpen}
        onSave={handleAvatarSave}
        onSkip={handleAvatarSkip}
        accentColor={userIdentity?.color}
        initialAvatarUrl={userIdentity?.avatarUrl || null}
      />
    </div>
  )
}

export default App
