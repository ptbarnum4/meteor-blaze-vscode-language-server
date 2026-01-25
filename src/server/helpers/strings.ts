export const safeParse = <T>(
  jsonString: string,
  defaultValue?: T
): T | null => {
  try {
    const json = JSON.parse(jsonString) as T;
    if (!json || typeof json !== 'object') {
      return (defaultValue !== undefined ? defaultValue : null) as T;
    }
    return json || (defaultValue !== undefined ? defaultValue : null);
  } catch {
    return defaultValue !== undefined ? defaultValue : null;
  }
};

export const codeInline = (text: string): string => {
  return `\`${text}\``;
};
export function codeBlock(text: string): string;
export function codeBlock(lang: string, text: string): string;
export function codeBlock(
  textOrLang: string,
  textOrUndefined?: string
): string {
  let lang: string = 'markdown';
  let text: string = textOrLang ?? textOrUndefined ?? '';

  if (textOrUndefined !== undefined) {
    lang = textOrLang;
    text = textOrUndefined ?? '';
  }

  const backticks = '```';
  return `${backticks}${lang}\n${text}\n${backticks}`;
}
/**
 * Convert a string to Start Case (e.g., "helloWorld" -> "Hello world")
 * @param str - Input string
 * @returns Start cased string
 */
export const startCase = (str?: string): string => {
  if (!str || typeof str !== 'string') {
    return '';
  }
  return str
    .replace(/([A-Z])/g, ' $1') // Add space before capital letters
    .replace(/[_-]+/g, ' ') // Replace underscores and hyphens with spaces
    .replace(/\s+/g, ' ') // Collapse multiple spaces
    .trim() // Trim leading/trailing spaces
    .toLowerCase() // Convert to lowercase
    .replace(/^\w/, (c) => c.toUpperCase()); // Capitalize first letter
};
