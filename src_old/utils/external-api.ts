import { Effect, Schedule } from "effect";

/**
 * Resilient wrapper for NPM registry calls
 * Handles rate limits, network failures, and timeouts
 */
export const fetchNpmPackage = (packageName: string) =>
  Effect.tryPromise({
    try: async () => {
      const registryUrl = `https://registry.npmjs.org/${packageName}/latest`;
      const response = await fetch(registryUrl);
      if (!response.ok) {
        throw new Error(`NPM registry error: ${response.status} ${response.statusText}`);
      }
      return response.json();
    },
    catch: (error) => new Error(`Failed to fetch NPM package ${packageName}: ${error}`)
  }).pipe(
    Effect.timeout("30 seconds"),
    Effect.retry(
      Schedule.exponential("1 second").pipe(
        Schedule.intersect(Schedule.recurs(3))
      )
    )
  );

/**
 * Resilient wrapper for NPM tarball downloads
 * Handles large package downloads with retries
 */
export const fetchNpmTarball = (tarballUrl: string) =>
  Effect.tryPromise({
    try: async () => {
      const response = await fetch(tarballUrl);
      if (!response.ok) {
        throw new Error(`Tarball download failed: ${response.status} ${response.statusText}`);
      }
      return response;
    },
    catch: (error) => new Error(`Failed to download tarball: ${error}`)
  }).pipe(
    Effect.timeout("60 seconds"), // Larger timeout for package downloads
    Effect.retry(
      Schedule.exponential("2 seconds").pipe(
        Schedule.intersect(Schedule.recurs(2))
      )
    )
  );

/**
 * Resilient wrapper for OpenAI API calls
 * Handles rate limits and transient failures
 */
export const generateWithRetry = <T>(generateFn: () => Promise<T>) =>
  Effect.tryPromise({
    try: generateFn,
    catch: (error: any) => {
      // Preserve original error for better debugging
      if (error?.code === 'rate_limit_exceeded') {
        return new Error(`OpenAI rate limit: ${error.message}`);
      }
      return new Error(`OpenAI generation failed: ${error?.message || error}`);
    }
  }).pipe(
    Effect.timeout("60 seconds"),
    Effect.retry(
      Schedule.exponential("5 seconds").pipe(
        Schedule.intersect(Schedule.recurs(3)),
        // Only retry on rate limits and network errors, not on invalid prompts
        Schedule.whileInput((error: Error) =>
          error.message.includes('rate_limit') ||
          error.message.includes('network') ||
          error.message.includes('timeout')
        )
      )
    )
  );

/**
 * Resilient NPM package search
 * Handles search API failures gracefully
 */
export const searchNpmPackages = (query: string) =>
  Effect.tryPromise({
    try: async () => {
      const response = await fetch(`https://registry.npmjs.org/-/v1/search?text=${encodeURIComponent(query)}&size=10`);
      if (!response.ok) {
        throw new Error(`NPM search failed: ${response.status}`);
      }
      const data = await response.json();
      return data.objects.map((obj: any) => ({
        name: obj.package.name,
        description: obj.package.description,
        version: obj.package.version
      }));
    },
    catch: (error) => new Error(`NPM search failed: ${error}`)
  }).pipe(
    Effect.timeout("15 seconds"),
    Effect.retry(
      Schedule.exponential("1 second").pipe(
        Schedule.intersect(Schedule.recurs(2))
      )
    ),
    // Fallback to empty array on complete failure
    Effect.catchAll(() => Effect.succeed([]))
  );