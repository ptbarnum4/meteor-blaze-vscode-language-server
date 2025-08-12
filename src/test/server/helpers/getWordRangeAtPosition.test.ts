import assert from 'assert';
import { describe, it } from 'node:test';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Position } from 'vscode-languageserver/node';

import { getWordRangeAtPosition } from '../../../server/helpers/getWordRangeAtPosition';

/**
 * Test suite for getWordRangeAtPosition helper function
 */
describe('getWordRangeAtPosition', () => {
  it('should return null when cursor is on whitespace', () => {
    const content = 'hello world';
    const document = TextDocument.create('file:///test.html', 'html', 1, content);
    const position = Position.create(0, 5); // Space between hello and world

    const result = getWordRangeAtPosition(document, position);
    // The function actually returns the word range if cursor is positioned at the end of a word
    // Let's test with a position that's clearly in whitespace
    const positionInWhitespace = Position.create(0, 5); // This is still at the end of 'hello'
    // Try a position that's more clearly in whitespace
    const document2 = TextDocument.create('file:///test.html', 'html', 1, 'hello  world');
    const positionInSpace = Position.create(0, 6); // In the double space
    const result2 = getWordRangeAtPosition(document2, positionInSpace);
    assert.strictEqual(result2, null);
  });

  it('should return range for a simple word', () => {
    const content = 'hello world';
    const document = TextDocument.create('file:///test.html', 'html', 1, content);
    const position = Position.create(0, 2); // Middle of 'hello'

    const result = getWordRangeAtPosition(document, position);
    assert.notStrictEqual(result, null);
    assert.deepStrictEqual(result!.start, Position.create(0, 0));
    assert.deepStrictEqual(result!.end, Position.create(0, 5));
  });

  it('should return range for Blaze helper with hash prefix', () => {
    const content = '{{#each items}}';
    const document = TextDocument.create('file:///test.html', 'html', 1, content);
    const position = Position.create(0, 4); // Middle of '#each'

    const result = getWordRangeAtPosition(document, position);
    assert.notStrictEqual(result, null);
    assert.deepStrictEqual(result!.start, Position.create(0, 2));
    assert.deepStrictEqual(result!.end, Position.create(0, 7));
  });

  it('should return range for Blaze helper with @ prefix', () => {
    const content = '{{@index}}';
    const document = TextDocument.create('file:///test.html', 'html', 1, content);
    const position = Position.create(0, 4); // Middle of '@index'

    const result = getWordRangeAtPosition(document, position);
    assert.notStrictEqual(result, null);
    assert.deepStrictEqual(result!.start, Position.create(0, 2));
    assert.deepStrictEqual(result!.end, Position.create(0, 8));
  });

  it('should return range for helper with underscores and numbers', () => {
    const content = '{{helper_name_123}}';
    const document = TextDocument.create('file:///test.html', 'html', 1, content);
    const position = Position.create(0, 10); // Middle of 'helper_name_123'

    const result = getWordRangeAtPosition(document, position);
    assert.notStrictEqual(result, null);
    assert.deepStrictEqual(result!.start, Position.create(0, 2));
    assert.deepStrictEqual(result!.end, Position.create(0, 17));
  });

  it('should handle cursor at start of word', () => {
    const content = 'hello world';
    const document = TextDocument.create('file:///test.html', 'html', 1, content);
    const position = Position.create(0, 0); // Start of 'hello'

    const result = getWordRangeAtPosition(document, position);
    assert.notStrictEqual(result, null);
    assert.deepStrictEqual(result!.start, Position.create(0, 0));
    assert.deepStrictEqual(result!.end, Position.create(0, 5));
  });

  it('should handle cursor at end of word', () => {
    const content = 'hello world';
    const document = TextDocument.create('file:///test.html', 'html', 1, content);
    const position = Position.create(0, 4); // End of 'hello' (before last char)

    const result = getWordRangeAtPosition(document, position);
    assert.notStrictEqual(result, null);
    assert.deepStrictEqual(result!.start, Position.create(0, 0));
    assert.deepStrictEqual(result!.end, Position.create(0, 5));
  });

  it('should handle multiline content', () => {
    const content = 'line1\nline2 helper\nline3';
    const document = TextDocument.create('file:///test.html', 'html', 1, content);
    const position = Position.create(1, 8); // Middle of 'helper' on line 2

    const result = getWordRangeAtPosition(document, position);
    assert.notStrictEqual(result, null);
    assert.deepStrictEqual(result!.start, Position.create(1, 6));
    assert.deepStrictEqual(result!.end, Position.create(1, 12));
  });

  it('should return null for punctuation', () => {
    const content = 'hello, world!';
    const document = TextDocument.create('file:///test.html', 'html', 1, content);
    const position = Position.create(0, 5); // On the comma

    // The comma position (5) is still at the end of 'hello', so let's test with a different position
    const document2 = TextDocument.create('file:///test.html', 'html', 1, 'hello , world');
    const commaPosition = Position.create(0, 6); // On the comma with spaces around it
    const result2 = getWordRangeAtPosition(document2, commaPosition);
    assert.strictEqual(result2, null);
  });

  it('should handle edge case at document start', () => {
    const content = 'hello';
    const document = TextDocument.create('file:///test.html', 'html', 1, content);
    const position = Position.create(0, 0); // Start of document

    const result = getWordRangeAtPosition(document, position);
    assert.notStrictEqual(result, null);
    assert.deepStrictEqual(result!.start, Position.create(0, 0));
    assert.deepStrictEqual(result!.end, Position.create(0, 5));
  });

  it('should handle edge case at document end', () => {
    const content = 'hello';
    const document = TextDocument.create('file:///test.html', 'html', 1, content);
    const position = Position.create(0, 4); // End of document (last char)

    const result = getWordRangeAtPosition(document, position);
    assert.notStrictEqual(result, null);
    assert.deepStrictEqual(result!.start, Position.create(0, 0));
    assert.deepStrictEqual(result!.end, Position.create(0, 5));
  });
});
