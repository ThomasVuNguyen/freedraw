import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Excalidraw, exportToBlob } from '@excalidraw/excalidraw'

import './AvatarSetup.css'

function AvatarSetup({ isOpen, onSave, onSkip, accentColor, initialAvatarUrl }) {
  const excalidrawAPIRef = useRef(null)
  const [isSaving, setIsSaving] = useState(false)
  const [errorMessage, setErrorMessage] = useState(null)

  const AVATAR_WIDTH = 300
  const AVATAR_HEIGHT = 400

  const initializeCanvas = useCallback(() => {
    if (!isOpen) {
      return
    }

    const api = excalidrawAPIRef.current
    if (!api) {
      return
    }

    api.updateScene({
      elements: [],
      files: {},
      appState: {
        ...api.getAppState(),
        selectedElementIds: {},
      },
    })

    if (api.history && typeof api.history.clear === 'function') {
      api.history.clear()
    }
  }, [isOpen])

  useEffect(() => {
    if (isOpen) {
      setErrorMessage(null)
      initializeCanvas()
    }
  }, [isOpen, initializeCanvas])

  const centerElements = useCallback((sourceElements) => {
    if (!sourceElements.length) {
      return sourceElements
    }

    const getElementBounds = (element) => {
      const angle = element.angle || 0
      const { x, y, width, height } = element
      const cx = x + width / 2
      const cy = y + height / 2

      const corners = [
        { x, y },
        { x: x + width, y },
        { x: x + width, y: y + height },
        { x, y: y + height },
      ]

      if (!angle) {
        const xs = corners.map((point) => point.x)
        const ys = corners.map((point) => point.y)
        return {
          minX: Math.min(...xs),
          maxX: Math.max(...xs),
          minY: Math.min(...ys),
          maxY: Math.max(...ys),
        }
      }

      const rotatePoint = (pointX, pointY) => {
        const cos = Math.cos(angle)
        const sin = Math.sin(angle)
        const dx = pointX - cx
        const dy = pointY - cy
        return {
          x: cx + dx * cos - dy * sin,
          y: cy + dx * sin + dy * cos,
        }
      }

      const rotated = corners.map(({ x: px, y: py }) => rotatePoint(px, py))
      const xs = rotated.map((point) => point.x)
      const ys = rotated.map((point) => point.y)

      return {
        minX: Math.min(...xs),
        maxX: Math.max(...xs),
        minY: Math.min(...ys),
        maxY: Math.max(...ys),
      }
    }

    const bounds = sourceElements.reduce(
      (acc, element) => {
        const elementBounds = getElementBounds(element)
        return {
          minX: Math.min(acc.minX, elementBounds.minX),
          maxX: Math.max(acc.maxX, elementBounds.maxX),
          minY: Math.min(acc.minY, elementBounds.minY),
          maxY: Math.max(acc.maxY, elementBounds.maxY),
        }
      },
      { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity }
    )

    const contentCenterX = (bounds.minX + bounds.maxX) / 2
    const contentCenterY = (bounds.minY + bounds.maxY) / 2
    const targetCenterX = AVATAR_WIDTH / 2
    const targetCenterY = AVATAR_HEIGHT / 2
    const offsetX = targetCenterX - contentCenterX
    const offsetY = targetCenterY - contentCenterY

    return sourceElements.map((element) => ({
      ...element,
      x: element.x + offsetX,
      y: element.y + offsetY,
    }))
  }, [])

  const handleExport = useCallback(async () => {
    if (!excalidrawAPIRef.current || isSaving) {
      return
    }

    const api = excalidrawAPIRef.current
    const elements = api.getSceneElements().filter((element) => !element.isDeleted)

    if (!elements.length) {
      setErrorMessage('Draw something first to create your avatar.')
      return
    }

    setIsSaving(true)
    setErrorMessage(null)

    try {
      const appState = api.getAppState()
      const files = api.getFiles()
      const centeredElements = centerElements(elements)
      const blob = await exportToBlob({
        elements: centeredElements,
        appState: {
          ...appState,
          exportBackground: true,
          exportEmbedScene: false,
          exportWithDarkMode: false,
        },
        files,
        mimeType: 'image/png',
        getDimensions: () => ({
          width: AVATAR_WIDTH,
          height: AVATAR_HEIGHT,
        }),
      })

      await onSave(blob)
    } catch (error) {
      console.error('Error exporting avatar:', error)
      setErrorMessage('Could not save avatar. Please try again.')
    } finally {
      setIsSaving(false)
    }
  }, [centerElements, isSaving, onSave])

  const handleAPIChange = useCallback(
    (api) => {
      excalidrawAPIRef.current = api
      if (isOpen) {
        initializeCanvas()
      }
    },
    [initializeCanvas, isOpen]
  )

  const initialData = useMemo(
    () => ({
      appState: {
        name: 'Avatar Canvas',
        currentItemStrokeColor: accentColor || '#4ECDC4',
        currentItemBackgroundColor: 'transparent',
        gridSize: null,
        zenModeEnabled: false,
        viewBackgroundColor: '#ffffff',
      },
    }),
    [accentColor]
  )

  if (!isOpen) {
    return null
  }

  return (
    <div className="avatar-setup-overlay">
      <div className="avatar-setup-modal" role="dialog" aria-modal="true" aria-label="Create your avatar">
        <header className="avatar-setup-header">
          <h2>Create Your Avatar</h2>
          <p>Add a quick sketch so collaborators can spot you instantly.</p>
        </header>

        <div className="avatar-setup-canvas">
          <Excalidraw
            excalidrawAPI={handleAPIChange}
            initialData={initialData}
            zenModeEnabled={false}
            viewModeEnabled={false}
            gridModeEnabled={false}
            UIOptions={{
              canvasActions: {
                changeViewBackgroundColor: false,
                loadScene: false,
                saveToActiveFile: false,
                export: false,
                toggleTheme: false,
                saveAsImage: false,
                openLibrary: false,
              },
            }}
          />
        </div>

        {initialAvatarUrl && (
          <div className="avatar-setup-preview">
            <span className="avatar-setup-preview-label">Current avatar</span>
            <img src={initialAvatarUrl} alt="Current avatar preview" />
          </div>
        )}

        {errorMessage && <div className="avatar-setup-error">{errorMessage}</div>}

        <div className="avatar-setup-actions">
          <button type="button" className="avatar-setup-button avatar-setup-button--secondary" onClick={onSkip} disabled={isSaving}>
            Skip for now
          </button>
          <button type="button" className="avatar-setup-button avatar-setup-button--primary" onClick={handleExport} disabled={isSaving}>
            {isSaving ? 'Saving…' : 'Save avatar'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default AvatarSetup
