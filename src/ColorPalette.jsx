import { useCallback } from 'react'
import './ColorPalette.css'

const THEME_COLORS = [
  { name: 'Coral', hex: '#F86F54' },
  { name: 'Paper', hex: '#F3F1E4' },
  { name: 'Charcoal', hex: '#212121' },
  { name: 'Royal Blue', hex: '#537CF7' },
]

function ColorPalette({ selectedColor, onColorSelect, isDarkTheme }) {
  const handleColorClick = useCallback(
    (color) => {
      onColorSelect(color)
    },
    [onColorSelect]
  )

  return (
    <div className={`color-palette${isDarkTheme ? ' color-palette--dark' : ''}`}>
      <div className="color-palette__label">Color</div>
      <div className="color-palette__swatches">
        {THEME_COLORS.map((color) => (
          <button
            key={color.hex}
            type="button"
            className={`color-swatch${selectedColor === color.hex ? ' color-swatch--active' : ''}`}
            style={{ backgroundColor: color.hex }}
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
