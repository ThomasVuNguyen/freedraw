import { useCallback, useRef, useState } from 'react'
import { Excalidraw } from '@excalidraw/excalidraw'
import '@excalidraw/excalidraw/index.css'

import './App.css'

const APP_NAME = 'Infinite Canvas Studio'

function App() {
  const excalidrawRef = useRef(null)
  const [theme, setTheme] = useState('light')
  const [gridMode, setGridMode] = useState(false)
  const [viewMode, setViewMode] = useState(false)
  const [zenMode, setZenMode] = useState(false)

  const handleResetScene = useCallback(() => {
    excalidrawRef.current?.resetScene()
  }, [])

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
          <button type="button" onClick={handleResetScene}>
            Clear Canvas
          </button>
        </div>
      </header>

      <main className="canvas-area">
        <Excalidraw
          ref={excalidrawRef}
          theme={theme}
          viewModeEnabled={viewMode}
          zenModeEnabled={zenMode}
          gridModeEnabled={gridMode}
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
