import { stripHtmlTags } from './sanitize.util';

describe('stripHtmlTags', () => {
  it('should pass plain text through unchanged', () => {
    expect(stripHtmlTags('Hello world')).toBe('Hello world');
  });

  it('should preserve numbers and special characters', () => {
    expect(stripHtmlTags('Price: $99.99 (50% off!)')).toBe('Price: $99.99 (50% off!)');
  });

  it('should strip script tags and their content', () => {
    expect(stripHtmlTags('<script>alert("xss")</script>')).toBe('');
  });

  it('should strip inline event handlers', () => {
    expect(stripHtmlTags('<img onerror="alert(1)" src="x">')).toBe('');
  });

  it('should strip simple HTML tags but keep text content', () => {
    expect(stripHtmlTags('<b>Bold</b> and <i>italic</i>')).toBe('Bold and italic');
  });

  it('should strip nested tags', () => {
    expect(stripHtmlTags('<div><p>Nested <strong>content</strong></p></div>')).toBe(
      'Nested content',
    );
  });

  it('should handle malformed/unclosed tags', () => {
    expect(stripHtmlTags('<div>Unclosed')).toBe('Unclosed');
  });

  it('should strip anchor tags but keep text', () => {
    expect(stripHtmlTags('<a href="https://evil.com">Click me</a>')).toBe('Click me');
  });

  it('should preserve Unicode content', () => {
    expect(stripHtmlTags('Cześć! 日本語 emoji 🎉')).toBe('Cześć! 日本語 emoji 🎉');
  });

  it('should handle empty string', () => {
    expect(stripHtmlTags('')).toBe('');
  });

  it('should handle string with only HTML tags', () => {
    expect(stripHtmlTags('<div><span></span></div>')).toBe('');
  });

  it('should preserve ampersands and angle brackets as raw plain text', () => {
    expect(stripHtmlTags('A & B < C > D')).toBe('A & B < C > D');
  });

  it('should decode HTML entities back to plain text', () => {
    expect(stripHtmlTags('Tom &amp; Jerry')).toBe('Tom & Jerry');
  });
});
