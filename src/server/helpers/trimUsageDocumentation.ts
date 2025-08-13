export const smartTrim = (lines?: string): string => {
  if (!lines) {
    return '';
  }
  const allDocLines = lines.split('\n');
  const docLines = allDocLines.filter((line, i) => {
    if (i === 0 && line.trim() === '') {
      return false; // Skip first empty line
    }

    if (i === allDocLines.length - 1 && line.trim() === '') {
      return false; // Skip last empty line
    }

    return line.trim() !== '';
  });

  const allIndents = docLines.map(line => {
    const match = line.match(/^\s*/);
    return match ? match[0].length : 0;
  });
  if (allIndents.length > 1 && !allIndents[0] && allIndents[allIndents.length - 1]) {
    // If the first line is empty and the last line is not, we can safely ignore the first line
    allIndents.shift();
  }
  const shortestIndent = Math.max(Math.min(...allIndents), 0);

  const trimmedLines = docLines.map(line => {
    const match = line.match(/^\s*/);
    if (match) {
      const indent = match[0].length;
      return line.slice(Math.min(indent, shortestIndent));
    }
    return line;
  });

  return trimmedLines.join('\n').trim();
};

export const trimUsageDocumentation = (name: string, usageDoc?: string): string => {
  if (!usageDoc) {
    return `{{${name}}}`;
  }

  const allDocLines = usageDoc.split('\n');
  const docLines = allDocLines.filter((line, i) => {
    if (i === 0 && line.trim() === '') {
      return false; // Skip first empty line
    }

    if (i === allDocLines.length - 1 && line.trim() === '') {
      return false; // Skip last empty line
    }

    return line.trim() !== '';
  });

  const shortestIndent = Math.max(
    Math.min(
      ...docLines.map(line => {
        const match = line.match(/^\s*/);
        return match ? match[0].length : 0;
      })
    ),
    0
  );

  const trimmedLines = docLines.map(line => {
    const match = line.match(/^\s*/);
    if (match) {
      const indent = match[0].length;
      return line.slice(Math.min(indent, shortestIndent));
    }
    return line;
  });

  return trimmedLines.join('\n').trim();
};

export const trimLanguageDocumentation = (
  doc: string,
  lang?: string,
  maxLines?: number
): string => {
  if (!doc) {
    return '';
  }

  if (!lang) {
    return doc;
  }

  const backticks = '```';

  const trimmed = smartTrim(doc)
    .split('\n')
    .slice(0, maxLines ? maxLines : undefined)
    .join('\n');

  return `\n${backticks}${lang}\n${trimmed}\n${backticks}\n`;
};
