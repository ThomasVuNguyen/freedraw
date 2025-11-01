const API_URL = 'https://get-or-create-user-fynpolbbma-uc.a.run.app'
const BROWSER_ID_KEY = 'freedraw_browser_id'
const USER_IDENTITY_KEY = 'freedraw_user_identity'

/**
 * Generate and persist a per-browser ID using localStorage and crypto.randomUUID()
 * @returns {string} The browser ID
 */
export function getBrowserId() {
  let id = localStorage.getItem(BROWSER_ID_KEY)
  if (!id) {
    // Try to use crypto.randomUUID() if available, otherwise fallback to UUID v4 implementation
    if (crypto && crypto.randomUUID) {
      id = crypto.randomUUID()
    } else {
      // Fallback UUID v4 implementation
      id = ([1e7] + -1e3 + -4e3 + -8e3 + -1e11).replace(/[018]/g, (c) =>
        (c ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (c / 4)))).toString(16)
      )
    }
    localStorage.setItem(BROWSER_ID_KEY, id)
  }
  return id
}

/**
 * Get or create user identity (username and color) from the API
 * @returns {Promise<{browserId: string, username: string, color: string}>}
 */
export async function getOrCreateUserIdentity() {
  // Check if we have a cached identity
  const cachedIdentity = localStorage.getItem(USER_IDENTITY_KEY)
  if (cachedIdentity) {
    try {
      return JSON.parse(cachedIdentity)
    } catch (error) {
      console.error('Error parsing cached identity:', error)
    }
  }

  // Get or create browser ID
  const browserId = getBrowserId()

  try {
    // Call the API to get username and color
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ browser_id: browserId }),
    })

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }

    const data = await response.json() // { username, color }

    // Create the complete identity object
    const identity = {
      browserId,
      username: data.username,
      color: data.color,
    }

    // Cache the identity
    localStorage.setItem(USER_IDENTITY_KEY, JSON.stringify(identity))

    return identity
  } catch (error) {
    console.error('Error fetching user identity from API:', error)

    // Fallback: return browser ID with generated values
    const fallbackIdentity = {
      browserId,
      username: `user_${browserId.substring(0, 8)}`,
      color: generateFallbackColor(),
    }

    return fallbackIdentity
  }
}

/**
 * Generate a fallback color in case API fails
 * @returns {string} A hex color code
 */
function generateFallbackColor() {
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

/**
 * Clear the user identity cache (useful for testing)
 */
export function clearUserIdentity() {
  localStorage.removeItem(USER_IDENTITY_KEY)
  localStorage.removeItem(BROWSER_ID_KEY)
  // Also remove old user ID key if it exists
  localStorage.removeItem('freedraw_userId')
}
