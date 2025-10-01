export interface CompilerResult {
  mainCode: string;
  additionalModules: Record<string, string>;
  packages: string[];
}

export async function compileWithBun(code: string, env: any): Promise<CompilerResult> {
  // Use Cloudflare Container for Bun compilation
  // For testing: use localhost, for production: use service binding
  const useLocalhost = env.BUN_COMPILER_LOCALHOST || false;

  let response;
  if (useLocalhost) {
    response = await fetch('http://localhost:3000/compile', {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code })
    });
  } else {
    if (!env.BUN_COMPILER) {
      throw new Error('BUN_COMPILER service binding not available');
    }
    response = await env.BUN_COMPILER.fetch('/compile', {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code })
    });
  }

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || `Compilation failed: ${response.status}`);
  }

  return await response.json();
}