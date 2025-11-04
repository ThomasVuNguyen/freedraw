import { useCallback } from 'react'
import './ColorPalette.css'

const THEME_COLORS = [
  { name: 'Coral', hex: '#F86F54' },
  { name: 'Paper', hex: '#F3F1E4' },
  { name: 'Charcoal', hex: '#212121' },
  { name: 'Royal Blue', hex: '#537CF7' },
]

function ColorPalette({ selectedColor, onColorSelect, colorMode, onModeToggle, isDarkTheme }) {
  const handleColorClick = useCallback(
    (color) => {
      onColorSelect(color)
    },
    [onColorSelect]
  )

  const colors = colorMode === 'background'
    ? [{ name: 'Transparent', hex: 'transparent' }, ...THEME_COLORS]
    : THEME_COLORS

  return (
    <div className={`color-palette${isDarkTheme ? ' color-palette--dark' : ''}`}>
      <div className="color-palette__header">
        <button
          type="button"
          className={`color-mode-toggle${colorMode === 'stroke' ? ' color-mode-toggle--active' : ''}`}
          onClick={onModeToggle}
          aria-label="Toggle between stroke and background color"
          title="Click to toggle between stroke and background color"
        >
          <span className="color-mode-toggle__label">
            {colorMode === 'stroke' ? 'Stroke' : 'Fill'}
          </span>
        </button>
      </div>
      <div className="color-palette__swatches">
        {colors.map((color) => (
          <button
            key={color.hex}
            type="button"
            className={`color-swatch${selectedColor === color.hex ? ' color-swatch--active' : ''}${color.hex === 'transparent' ? ' color-swatch--transparent' : ''}`}
            style={{ backgroundColor: color.hex === 'transparent' ? 'transparent' : color.hex }}
            onClick={() => handleColorClick(color.hex)}
            aria-label={`Select ${color.name} color`}
            title={color.name}
          />
        ))}
      </div>
    </div>
  )
}

export default ColorPalette
