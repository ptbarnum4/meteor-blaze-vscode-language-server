import fs from 'fs/promises';

export const safeReadDir = async (dirPath: string): Promise<string[]> => {
  try {
    const files = await fs.readdir(dirPath);
    return files;
  } catch {
    return [];
  }
};

type StatsFS = Awaited<ReturnType<typeof fs.stat>>;
export const safeReadStats = async (
  filePath: string
): Promise<StatsFS | null> => {
  try {
    const files = await fs.stat(filePath);
    return files;
  } catch {
    return null;
  }
};
