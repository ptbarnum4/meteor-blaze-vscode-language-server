/**
 * Parse TSDoc-style comments within Meteor/Blaze templates
 */

export interface TemplateCommentInfo {
  commentText: string;
  start: number;
  end: number;
  templateName: string;
}

export interface TemplateDocTag {
  tag: 'param' | 'template' | 'description' | string; // Allow custom tags
  name?: string; // For @param: the parameter name
  type?: string; // For @param: the type (e.g., "string", "UserType")
  description?: string; // Description text
  optional?: boolean; // For @param: whether param is optional
  line: number; // Line number in comment
  rawText?: string; // Original line text
}

export interface ValidationIssue {
  line: number;
  message: string;
  severity: 'error' | 'warning' | 'info';
}

export interface TemplateDocumentation {
  templateName: string;
  description?: string;
  parameters: Map<
    string,
    {
      type: string;
      description?: string;
      optional: boolean;
      source: 'tsdoc' | 'controller' | 'inferred';
    }
  >;
  validationIssues: ValidationIssue[];
  customTags?: Map<string, TemplateDocTag[]>; // Store custom tags
}

/**
 * Extract the first Handlebars comment within a template
 * Supports both {{!-- ... --}} and {{! ... }} formats
 */
export function extractTemplateComment(
  templateContent: string,
  templateName: string
): TemplateCommentInfo | null {
  // Find the template tag
  const templateTagRegex = new RegExp(
    `<template\\s+name=["']${templateName}["'][^>]*>`,
    'i'
  );
  const templateMatch = templateTagRegex.exec(templateContent);

  if (!templateMatch) {
    return null;
  }

  const templateStartPos = templateMatch.index + templateMatch[0].length;

  // Look for the first Handlebars comment after the template tag
  // Match both block comments {{!-- ... --}} and {{! ... }}
  const blockCommentRegex = /\{\{!--([\s\S]*?)--\}\}/;
  const inlineCommentRegex = /\{\{!((?:(?!\}\}).)*)\}\}/;

  const remainingContent = templateContent.substring(templateStartPos);

  // Try block comment first (preferred for TSDoc)
  const blockMatch = blockCommentRegex.exec(remainingContent);
  const inlineMatch = inlineCommentRegex.exec(remainingContent);

  let match: RegExpExecArray | null = null;
  let commentText = '';

  if (blockMatch && (!inlineMatch || blockMatch.index < inlineMatch.index)) {
    match = blockMatch;
    commentText = blockMatch[1];
  } else if (inlineMatch) {
    match = inlineMatch;
    commentText = inlineMatch[1];
  }

  if (!match) {
    return null;
  }

  // Remove any leading/trailing hyphens from the comment text
  // This handles cases where the regex captures part of the delimiters
  let cleanedComment = commentText.trim();
  // Remove leading hyphens and spaces
  cleanedComment = cleanedComment.replace(/^-+\s*/, '');
  // Remove trailing hyphens and spaces
  cleanedComment = cleanedComment.replace(/\s*-+$/, '');

  return {
    commentText: cleanedComment,
    start: templateStartPos + match.index,
    end: templateStartPos + match.index + match[0].length,
    templateName,
  };
}

/**
 * Parse TSDoc-style tags from template comment
 * Supports: @param, @template, @description, and custom tags
 */
export function parseTemplateDocTags(
  commentText: string,
  supportedTags: string[] = ['param', 'template', 'description']
): TemplateDocTag[] {
  const tags: TemplateDocTag[] = [];
  const lines = commentText.split('\n');

  let currentTag: TemplateDocTag | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const lineNumber = i + 1;

    // Check for @ tag
    const tagMatch = line.match(/^@(\w+)\b/);

    if (tagMatch) {
      // Save previous tag if exists
      if (currentTag) {
        tags.push(currentTag);
      }

      const tagName = tagMatch[1];

      // Handle @param tag
      if (tagName === 'param') {
        const paramTag = parseParamTag(line, lineNumber);
        if (paramTag) {
          currentTag = paramTag;
        }
      }
      // Handle @template tag
      else if (tagName === 'template') {
        const templateMatch = line.match(/^@template\s+(\S+)/);
        currentTag = {
          tag: 'template',
          name: templateMatch ? templateMatch[1] : undefined,
          line: lineNumber,
          rawText: line,
        };
      }
      // Handle @description tag
      else if (tagName === 'description') {
        const descMatch = line.match(/^@description\s+(.*)$/);
        currentTag = {
          tag: 'description',
          description: descMatch ? descMatch[1].trim() : '',
          line: lineNumber,
          rawText: line,
        };
      }
      // Handle custom tags if in supported list
      else if (supportedTags.includes(tagName)) {
        const customMatch = line.match(/^@\w+\s+(.*)$/);
        currentTag = {
          tag: tagName,
          description: customMatch ? customMatch[1].trim() : '',
          line: lineNumber,
          rawText: line,
        };
      } else {
        currentTag = null;
      }
    } else if (currentTag && line.length > 0) {
      // Continuation of previous tag's description
      if (currentTag.description) {
        currentTag.description += ' ' + line;
      } else {
        currentTag.description = line;
      }
    }
  }

  // Don't forget the last tag
  if (currentTag) {
    tags.push(currentTag);
  }

  return tags;
}

/**
 * Parse a @param tag line
 * Supports formats:
 * - @param {Type} name - Description
 * - @param {Type} name? - Description (optional)
 * - @param {Type} [name] - Description (optional)
 * - @param {Complex<Type>} name - Description
 * - @param {{ key: string }} name - Description (object type)
 */
function parseParamTag(
  line: string,
  lineNumber: number
): TemplateDocTag | null {
  // Extract type by matching balanced braces
  const typeMatch = line.match(/^@param\s+\{/);
  if (!typeMatch) {
    return null;
  }

  // Find the closing brace for the type, accounting for nested braces
  let braceCount = 0;
  let typeEnd = -1;
  const startPos = typeMatch[0].length - 1; // Position of opening {

  for (let i = startPos; i < line.length; i++) {
    if (line[i] === '{') {
      braceCount++;
    } else if (line[i] === '}') {
      braceCount--;
      if (braceCount === 0) {
        typeEnd = i;
        break;
      }
    }
  }

  if (typeEnd === -1) {
    return null;
  }

  const type = line.substring(startPos + 1, typeEnd).trim();
  const remainder = line.substring(typeEnd + 1).trim();

  // Parse the remainder for name, optional indicator, and description
  const remainderPattern = /^(\[)?([a-zA-Z_$][\w$]*)(]|\?)?\s*(-\s*(.*))?$/;
  const match = remainderPattern.exec(remainder);

  if (!match) {
    return null;
  }

  const isOptional = !!(match[1] || match[3]);

  return {
    tag: 'param',
    type: type,
    name: match[2],
    description: match[5] ? match[5].trim() : undefined,
    optional: isOptional,
    line: lineNumber,
    rawText: line,
  };
}

/**
 * Validate template comment syntax
 * Checks for:
 * - @template tag matches actual template name
 * - @param syntax is valid
 * - No duplicate parameter names
 * - Types are properly formatted
 */
export function validateTemplateDoc(
  tags: TemplateDocTag[],
  templateName: string,
  validationLevel: 'off' | 'info' | 'warning' | 'error' = 'info'
): ValidationIssue[] {
  if (validationLevel === 'off') {
    return [];
  }

  const issues: ValidationIssue[] = [];
  const paramNames = new Set<string>();

  for (const tag of tags) {
    // Validate @template tag matches template name
    if (tag.tag === 'template' && tag.name && tag.name !== templateName) {
      issues.push({
        line: tag.line,
        message: `@template name "${tag.name}" does not match template name "${templateName}"`,
        severity: validationLevel === 'error' ? 'error' : 'warning',
      });
    }

    // Validate @param tags
    if (tag.tag === 'param') {
      // Check for duplicate parameter names
      if (tag.name) {
        if (paramNames.has(tag.name)) {
          issues.push({
            line: tag.line,
            message: `Duplicate @param "${tag.name}"`,
            severity: validationLevel === 'error' ? 'error' : 'warning',
          });
        }
        paramNames.add(tag.name);
      }

      // Check if type is provided
      if (!tag.type) {
        issues.push({
          line: tag.line,
          message: `@param "${tag.name || 'unknown'}" missing type annotation`,
          severity: validationLevel === 'info' ? 'info' : 'warning',
        });
      }

      // Check if name is provided
      if (!tag.name) {
        issues.push({
          line: tag.line,
          message: `@param missing parameter name`,
          severity: validationLevel === 'error' ? 'error' : 'warning',
        });
      }

      // Validate type syntax (basic check)
      if (tag.type && !isValidTypeString(tag.type)) {
        issues.push({
          line: tag.line,
          message: `@param "${tag.name}" has invalid type syntax: "${tag.type}"`,
          severity: 'info',
        });
      }
    }
  }

  return issues;
}

/**
 * Basic validation of TypeScript type string
 * Checks for balanced braces, brackets, and angle brackets
 */
function isValidTypeString(typeStr: string): boolean {
  let braceCount = 0;
  let bracketCount = 0;
  let angleCount = 0;

  for (const char of typeStr) {
    switch (char) {
      case '{':
        braceCount++;
        break;
      case '}':
        braceCount--;
        if (braceCount < 0) {
          return false;
        }
        break;
      case '[':
        bracketCount++;
        break;
      case ']':
        bracketCount--;
        if (bracketCount < 0) {
          return false;
        }
        break;
      case '<':
        angleCount++;
        break;
      case '>':
        angleCount--;
        if (angleCount < 0) {
          return false;
        }
        break;
    }
  }

  return braceCount === 0 && bracketCount === 0 && angleCount === 0;
}

/**
 * Find all templates in HTML content and extract their TSDoc comments
 */
export function extractAllTemplateComments(
  htmlContent: string,
  supportedTags: string[] = ['param', 'template', 'description']
): Map<string, TemplateDocumentation> {
  const documentation = new Map<string, TemplateDocumentation>();

  // Find all template tags
  const templateRegex = /<template\s+name=["']([^"']+)["'][^>]*>/gi;
  let match;

  while ((match = templateRegex.exec(htmlContent)) !== null) {
    const templateName = match[1];

    // Extract comment for this template
    const commentInfo = extractTemplateComment(htmlContent, templateName);

    if (!commentInfo) {
      continue;
    }

    // Parse tags
    const tags = parseTemplateDocTags(commentInfo.commentText, supportedTags);

    // Validate
    const validationIssues = validateTemplateDoc(tags, templateName, 'info');

    // Extract description
    const descriptionTag = tags.find((t) => t.tag === 'description');
    const description = descriptionTag?.description;

    // Extract parameters
    const parameters = new Map<
      string,
      {
        type: string;
        description?: string;
        optional: boolean;
        source: 'tsdoc' | 'controller' | 'inferred';
      }
    >();

    const customTags = new Map<string, TemplateDocTag[]>();

    for (const tag of tags) {
      if (tag.tag === 'param' && tag.name) {
        parameters.set(tag.name, {
          type: tag.type || 'any',
          description: tag.description,
          optional: tag.optional || false,
          source: 'tsdoc',
        });
      } else if (
        tag.tag !== 'param' &&
        tag.tag !== 'template' &&
        tag.tag !== 'description'
      ) {
        // Store custom tags
        if (!customTags.has(tag.tag)) {
          customTags.set(tag.tag, []);
        }
        customTags.get(tag.tag)!.push(tag);
      }
    }

    documentation.set(templateName, {
      templateName,
      description,
      parameters,
      validationIssues,
      customTags: customTags.size > 0 ? customTags : undefined,
    });
  }

  return documentation;
}
