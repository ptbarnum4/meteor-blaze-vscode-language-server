/**
 * Merge template parameter data from multiple sources:
 * 1. Controller/TypeScript (TemplateStaticTyped) - Type information (highest priority)
 * 2. TSDoc comments - Descriptions and additional params
 * 3. Template inference - Fallback
 */

import { ExtractedParameter } from './extractTemplateParameters.js';

export interface MergedParameterInfo {
  name: string;
  type: string; // From controller (primary) or TSDoc (fallback)
  description?: string; // From TSDoc (primary) or inferred
  optional: boolean;
  sources: Array<'controller' | 'tsdoc' | 'inferred'>;
}

/**
 * Merge parameter data from multiple sources with priority:
 * 1. Controller/TypeScript (TemplateStaticTyped) - Type information
 * 2. TSDoc comments - Descriptions
 * 3. Template inference - Fallback
 */
export function mergeTemplateParameters(
  templateName: string,
  controllerParams: Map<string, { type: string; doc?: string }>,
  tsDocParams: Map<
    string,
    { type: string; description?: string; optional: boolean }
  >,
  inferredParams: ExtractedParameter[]
): Map<string, MergedParameterInfo> {
  const merged = new Map<string, MergedParameterInfo>();

  // Step 1: Add all controller params (highest priority for types)
  for (const [name, info] of controllerParams.entries()) {
    merged.set(name, {
      name,
      type: info.type, // Use controller type
      description: info.doc, // Controller may have JSDoc
      optional: false,
      sources: ['controller'],
    });
  }

  // Step 2: Enhance with TSDoc data (add descriptions, additional params)
  for (const [name, info] of tsDocParams.entries()) {
    if (merged.has(name)) {
      // Enhance existing controller param with TSDoc description
      const existing = merged.get(name)!;
      merged.set(name, {
        ...existing,
        description: info.description || existing.description, // TSDoc description preferred
        optional: info.optional,
        sources: [...existing.sources, 'tsdoc'],
      });
    } else {
      // Add new param from TSDoc (no controller definition)
      merged.set(name, {
        name,
        type: info.type, // Use TSDoc type
        description: info.description,
        optional: info.optional,
        sources: ['tsdoc'],
      });
    }
  }

  // Step 3: Add inferred params (lowest priority)
  for (const param of inferredParams) {
    if (!merged.has(param.name)) {
      merged.set(param.name, {
        name: param.name,
        type: param.inferredType || 'unknown',
        description: undefined,
        optional: param.isOptional,
        sources: ['inferred'],
      });
    } else {
      // Add 'inferred' to sources if not already present
      const existing = merged.get(param.name)!;
      if (!existing.sources.includes('inferred')) {
        existing.sources.push('inferred');
      }
    }
  }

  return merged;
}

/**
 * Convert merged parameters to simple array format for backward compatibility
 */
export function mergedParametersToArray(
  merged: Map<string, MergedParameterInfo>
): string[] {
  return Array.from(merged.keys());
}

/**
 * Convert merged parameters to enhanced format for sidebar
 */
export function mergedParametersToEnhanced(
  merged: Map<string, MergedParameterInfo>
): Array<{
  name: string;
  type: string;
  description?: string;
  optional: boolean;
  sources: Array<'controller' | 'tsdoc' | 'inferred'>;
}> {
  return Array.from(merged.values());
}
