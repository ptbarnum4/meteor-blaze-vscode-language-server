import fs from 'fs';
import path from 'path';

export function run(): Promise<void> {
  return new Promise((c, e) => {
    const testsRoot = path.resolve(__dirname, '..');

    try {
      // Recursively find test files
      const findTestFiles = (dir: string): string[] => {
        const files: string[] = [];
        const items = fs.readdirSync(dir);

        for (const item of items) {
          const fullPath = path.join(dir, item);
          const stat = fs.statSync(fullPath);

          if (stat.isDirectory()) {
            files.push(...findTestFiles(fullPath));
          } else if (item.endsWith('.test.js')) {
            files.push(fullPath);
          }
        }

        return files;
      };

      const testFiles = findTestFiles(testsRoot);

      // Import and run each test file
      testFiles.forEach((testFile: string) => {
        try {
          require(testFile);
        } catch (err) {
          console.error(`Failed to load test file: ${testFile}`, err);
        }
      });

      c();
    } catch (err) {
      e(err as Error);
    }
  });
}
