/**
 * Slug Utility
 *
 * Provides reusable functions for generating URL-friendly slugs
 * and ensuring their uniqueness across database tables.
 */

/**
 * Generates a URL-friendly slug from a string.
 *
 * @param text - The text to convert (e.g., product name)
 * @returns A lowercase, hyphenated slug
 *
 * @example
 * generateSlug("iPhone 15 Pro Max!") // "iphone-15-pro-max"
 * generateSlug("  Café Latte  ")     // "caf-latte"
 */
export function generateSlug(text: string): string {
  return text
    .toLowerCase() // Convert to lowercase
    .trim() // Remove leading/trailing whitespace
    .replace(/[^a-z0-9\s-]/g, '') // Remove special characters (keep letters, numbers, spaces, hyphens)
    .replace(/\s+/g, '-') // Replace spaces with hyphens
    .replace(/-+/g, '-') // Collapse multiple hyphens into one
    .replace(/^-|-$/g, ''); // Remove leading/trailing hyphens
}

/**
 * Callback type for checking if a slug exists in the database.
 * Returns the ID if found, null/undefined if not found.
 */
type SlugExistsChecker = (slug: string) => Promise<{ id: string } | null>;

/**
 * Configuration for ensureUniqueSlug function.
 */
interface EnsureUniqueSlugOptions {
  /** The base slug to make unique */
  slug: string;
  /** Function that checks if slug exists and returns { id } or null */
  exists: SlugExistsChecker;
  /** ID to exclude from uniqueness check (for updates) */
  excludeId?: string;
}

/**
 * Ensures a slug is unique by appending a counter suffix if needed.
 *
 * @param options - Configuration object
 * @returns A guaranteed unique slug
 *
 * @example
 * // In ProductsService:
 * const slug = await ensureUniqueSlug({
 *   slug: 'iphone-15',
 *   exists: (s) => this.prisma.product.findUnique({ where: { slug: s }, select: { id: true } }),
 *   excludeId: productId, // Optional: for updates
 * });
 */
export async function ensureUniqueSlug(options: EnsureUniqueSlugOptions): Promise<string> {
  const { slug, exists, excludeId } = options;
  const MAX_ATTEMPTS = 100;

  let uniqueSlug = slug;
  let counter = 1;

  while (counter <= MAX_ATTEMPTS) {
    const existing = await exists(uniqueSlug);

    // Slug is available if it doesn't exist OR belongs to the record we're updating
    if (!existing || existing.id === excludeId) {
      return uniqueSlug;
    }

    counter++;
    uniqueSlug = `${slug}-${counter}`;
  }

  // Fallback: append timestamp for guaranteed uniqueness
  return `${slug}-${Date.now()}`;
}
