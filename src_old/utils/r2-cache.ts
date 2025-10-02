export interface CachedTool {
  hash: string;
  code: string;
  nodeModules: Record<string, string>;
  metadata: {
    createdAt: number;
    packages: string[];
  };
}

export class R2ToolCache {
  constructor(private r2: R2Bucket) {}

  async get(hash: string): Promise<CachedTool | null> {
    try {
      const key = `tools/${hash}/compiled.json`;
      const object = await this.r2.get(key);

      if (!object) {
        return null;
      }

      const data = await object.json() as CachedTool;
      return data;
    } catch (error) {
      console.error('Failed to get cached tool:', error);
      return null;
    }
  }

  async set(hash: string, tool: Omit<CachedTool, 'hash'>): Promise<void> {
    try {
      const key = `tools/${hash}/compiled.json`;
      const data: CachedTool = { hash, ...tool };

      await this.r2.put(key, JSON.stringify(data), {
        httpMetadata: {
          contentType: 'application/json',
        },
        customMetadata: {
          hash,
          createdAt: tool.metadata.createdAt.toString(),
          packages: tool.metadata.packages.join(','),
        },
      });
    } catch (error) {
      console.error('Failed to cache tool:', error);
      throw error;
    }
  }

  async exists(hash: string): Promise<boolean> {
    try {
      const key = `tools/${hash}/compiled.json`;
      const head = await this.r2.head(key);
      return head !== null;
    } catch (error) {
      return false;
    }
  }

  async delete(hash: string): Promise<void> {
    try {
      const key = `tools/${hash}/compiled.json`;
      await this.r2.delete(key);
    } catch (error) {
      console.error('Failed to delete cached tool:', error);
    }
  }
}