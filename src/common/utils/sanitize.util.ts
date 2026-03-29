import sanitize from 'sanitize-html';

/**
 * Strips all HTML tags from user-generated text and returns plain text.
 *
 * sanitize-html strips tags but also HTML-encodes special characters
 * (& → &amp;, < → &lt;). We decode those entities afterward so the stored
 * value is raw plain text, not HTML-escaped text. This avoids double-encoding
 * if a frontend later escapes the value again for display.
 *
 * We use sanitize-html instead of regex because regex misses edge cases
 * like nested tags (<scr<script>ipt>) and encoded entities that decode
 * into dangerous markup.
 */
export function stripHtmlTags(input: string): string {
  const stripped = sanitize(input, { allowedTags: [], allowedAttributes: {} });

  return stripped
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, '/');
}
