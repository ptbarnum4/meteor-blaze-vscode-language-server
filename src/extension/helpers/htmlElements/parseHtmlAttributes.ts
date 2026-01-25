/**
 * Extract class and id from an HTML opening tag
 * @param tagText - The full opening tag text (e.g., '<div id="main" class="foo bar">')
 * @returns Object with tagName, id, and classes array
 */
export function parseHtmlAttributes(tagText: string): {
  tagName: string;
  id: string | null;
  classes: string[];
} {
  // Extract tag name from the opening tag
  const tagNameMatch = /<(\w+)/i.exec(tagText);
  const tagName = tagNameMatch ? tagNameMatch[1] : '';

  // Extract id attribute (handle single/double quotes and no quotes)
  const idMatch = /\bid\s*=\s*["']([^"']*)["']/i.exec(tagText);
  const id = idMatch ? idMatch[1] : null;

  // Extract class attribute (handle single/double quotes and no quotes)
  const classMatch = /\bclass\s*=\s*["']([^"']*)["']/i.exec(tagText);
  const classAttr = classMatch ? classMatch[1] : '';

  // Split classes by whitespace and filter out empty strings
  const classes = classAttr
    .split(/\s+/)
    .filter((cls) => cls.length > 0)
    .filter((cls) => {
      // Filter out Handlebars expressions (they start with {{ or contain }})
      return !cls.includes('{{') && !cls.includes('}}');
    });

  return {
    tagName,
    id,
    classes,
  };
}

/**
 * Common Bootstrap utility class prefixes and patterns to filter out
 */
const BOOTSTRAP_CLASS_PATTERNS = [
  // Layout
  /^container(-fluid|-sm|-md|-lg|-xl|-xxl)?$/,
  /^row(-cols-\d+)?$/,
  /^col(-\d+)?(-sm|-md|-lg|-xl|-xxl)?(-\d+)?$/,
  /^offset-/,
  /^order-/,
  // Display
  /^d-(none|inline|inline-block|block|grid|table|table-cell|table-row|flex|inline-flex)/,
  // Spacing (margin and padding)
  /^[mp][tblrxy]?-\d+$/,
  /^[mp][tblrxy]?-auto$/,
  /^g[xy]?-\d+$/,
  // Flexbox
  /^flex-(row|column|wrap|nowrap|fill|grow-|shrink-)/,
  /^justify-content-/,
  /^align-(items|content|self)-/,
  // Text
  /^text-(start|end|center|justify|wrap|nowrap|truncate|break|lowercase|uppercase|capitalize)/,
  /^text-(primary|secondary|success|danger|warning|info|light|dark|body|muted|white|black-50|white-50)/,
  /^fs-/,
  /^fw-(bold|bolder|normal|light|lighter)/,
  /^fst-(italic|normal)/,
  /^lh-/,
  // Background
  /^bg-(primary|secondary|success|danger|warning|info|light|dark|body|white|transparent)/,
  /^bg-gradient/,
  /^bg-opacity-/,
  // Borders
  /^border(-top|-end|-bottom|-start)?(-\d+)?$/,
  /^border-(primary|secondary|success|danger|warning|info|light|dark|white)/,
  /^rounded(-top|-end|-bottom|-start|-circle|-pill)?(-\d+)?$/,
  // Sizing
  /^[wh]-(25|50|75|100|auto)/,
  /^m[wh]-/,
  /^v[wh]-/,
  // Position
  /^position-(static|relative|absolute|fixed|sticky)/,
  /^(top|bottom|start|end)-/,
  // Visibility
  /^visible|invisible$/,
  /^overflow-(auto|hidden|visible|scroll)/,
  // Shadow
  /^shadow(-sm|-lg|-none)?$/,
  // Float
  /^float-(start|end|none)/,
  // Common components
  /^btn(-outline)?-(primary|secondary|success|danger|warning|info|light|dark|link)/,
  /^btn-(sm|lg|block)/,
  /^badge/,
  /^alert(-dismissible)?(-\w+)?$/,
  /^card(-body|-header|-footer|-title|-text|-img|-img-overlay)?$/,
  /^nav(-item|-link|-tabs|-pills)?$/,
  /^navbar/,
  /^dropdown/,
  /^modal/,
  /^form-(control|select|check|switch|label|text)/,
  /^input-group/,
  /^list-group(-item)?/,
  /^table/,
  /^pagination/,
  /^breadcrumb/,
];

/**
 * Check if a class name matches Bootstrap patterns
 */
function isBootstrapClass(className: string): boolean {
  return BOOTSTRAP_CLASS_PATTERNS.some((pattern) => pattern.test(className));
}

/**
 * Filter classes, prioritizing non-Bootstrap classes
 * @param classes - Array of class names
 * @param maxToShow - Maximum number of classes to show
 * @returns Filtered array of class names with non-Bootstrap classes first
 */
function filterClasses(classes: string[], maxToShow: number): string[] {
  if (maxToShow === 0 || classes.length <= maxToShow) {
    return classes;
  }

  // Separate Bootstrap and non-Bootstrap classes
  const nonBootstrap: string[] = [];
  const bootstrap: string[] = [];

  classes.forEach((cls) => {
    if (isBootstrapClass(cls)) {
      bootstrap.push(cls);
    } else {
      nonBootstrap.push(cls);
    }
  });

  // Take non-Bootstrap classes first, then Bootstrap if space allows
  const result: string[] = [];

  // Add non-Bootstrap classes (up to limit)
  const nonBootstrapToShow = Math.min(nonBootstrap.length, maxToShow);
  result.push(...nonBootstrap.slice(0, nonBootstrapToShow));

  // If we have room left, add some Bootstrap classes
  const remainingSlots = maxToShow - result.length;
  if (remainingSlots > 0) {
    result.push(...bootstrap.slice(0, remainingSlots));
  }

  return result;
}

/**
 * Format hint text from parsed attributes
 * @param tagName - Element tag name (div, span, etc.)
 * @param id - Element ID or null
 * @param classes - Array of class names
 * @param config - User configuration
 * @returns Formatted hint string (e.g., "div#main.container.active")
 */
export function formatHintText(
  tagName: string,
  id: string | null,
  classes: string[],
  config: {
    showIds: boolean;
    showClasses: boolean;
    maxClassesToShow: number;
  }
): string {
  let hint = tagName;

  // Add ID if enabled and present
  if (config.showIds && id) {
    // Filter out Handlebars expressions
    if (!id.includes('{{') && !id.includes('}}')) {
      hint += `#${id}`;
    }
  }

  // Add classes if enabled and present
  if (config.showClasses && classes.length > 0) {
    const classesToShow =
      config.maxClassesToShow > 0
        ? filterClasses(classes, config.maxClassesToShow)
        : classes;

    classesToShow.forEach((cls) => {
      hint += `.${cls}`;
    });

    // Add ellipsis if there are more classes than shown
    if (
      config.maxClassesToShow > 0 &&
      classes.length > config.maxClassesToShow
    ) {
      hint += '...';
    }
  }

  return hint;
}
