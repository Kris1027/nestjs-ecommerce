import sanitize from 'sanitize-html';

/**
 * Strips all HTML tags from user-generated text content.
 *
 * Sanitizing at write-time prevents stored XSS regardless of how frontend
 * clients render the data. We use sanitize-html instead of regex because
 * regex misses edge cases like nested tags (<scr<script>ipt>) and encoded
 * entities that decode into dangerous markup.
 *
 * All user content in this app (review titles, comments, product names,
 * descriptions) is plain text — no HTML formatting is needed.
 */
export function stripHtmlTags(input: string): string {
  return sanitize(input, { allowedTags: [], allowedAttributes: {} });
}
