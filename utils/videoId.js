/**
 * Extract YouTube video ID from various URL formats
 * Supports: youtube.com, youtu.be, short URLs, etc.
 */
export function extractVideoId(url) {
  if (!url || typeof url !== 'string') {
    throw new Error('Invalid URL: must be a non-empty string');
  }

  // Remove whitespace
  url = url.trim();

  // youtu.be format: https://youtu.be/dQw4w9WgXcQ
  const shortMatch = url.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/);
  if (shortMatch) {
    return shortMatch[1];
  }

  // youtube.com with v parameter: https://www.youtube.com/watch?v=dQw4w9WgXcQ
  const longMatch = url.match(/(?:youtube\.com\/watch\?.*v=|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/);
  if (longMatch) {
    return longMatch[1];
  }

  // youtube.com/v/ format: https://www.youtube.com/v/dQw4w9WgXcQ
  const vMatch = url.match(/youtube\.com\/v\/([a-zA-Z0-9_-]{11})/);
  if (vMatch) {
    return vMatch[1];
  }

  // If already a video ID (11 alphanumeric characters)
  if (url.match(/^[a-zA-Z0-9_-]{11}$/)) {
    return url;
  }

  throw new Error(`Could not extract video ID from URL: ${url}`);
}

/**
 * Validate that a string is a valid YouTube video ID
 */
export function isValidVideoId(videoId) {
  return typeof videoId === 'string' && /^[a-zA-Z0-9_-]{11}$/.test(videoId);
}

export default { extractVideoId, isValidVideoId };
