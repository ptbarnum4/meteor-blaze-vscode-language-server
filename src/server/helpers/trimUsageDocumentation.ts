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
