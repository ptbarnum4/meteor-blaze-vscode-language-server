/**
 * Calculates percentage from a fraction
 * @param numerator - The numerator value
 * @param denominator - The denominator value
 * @returns Percentage as string with % symbol
 */
Template.registerHelper('percentage', (numerator: number, denominator: number): string => {
  if (!denominator || denominator === 0) {
    return '0%';
  }
  const percent = Math.round((numerator / denominator) * 100);
  return `${percent}%`;
});

/**
 * Truncates text to specified length with ellipsis
 * @param text - Text to truncate
 * @param maxLength - Maximum length before truncation
 * @returns Truncated text with ellipsis if needed
 */
Template.registerHelper('truncate', function(text: string, maxLength: number = 50): string {
  if (!text || text.length <= maxLength) {
    return text || '';
  }
  return text.substring(0, maxLength) + '...';
});
