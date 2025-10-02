export interface CompilerResult {
  mainCode: string;
  additionalModules: Record<string, string>;
  packages: string[];
}

export async function compileWithBun(code: string, env: any): Promise<CompilerResult> {
  // Use Cloudflare Container for Bun compilation
  // For testing: use localhost, for production: use service binding
  console.log("env:", env);
  const useLocalhost = env.ENV === "development";

  let response;
  if (useLocalhost) {
    response = await fetch('http://localhost:3000/compile', {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code })
    });
  } else {
    if (!env.BUN_COMPILER_DO) {
      throw new Error('BUN_COMPILER_DO durable object binding not available');
    }
    console.log("Using container for compilation...");
    // Use getContainer pattern from docs (same as ping endpoint)
    const container = env.BUN_COMPILER_DO.getByName('compiler');
    console.log("Fetching from container /compile endpoint...");
    response = await container.fetch('http://container/compile', {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code })
    });
    console.log("Container response status:", response.status);
  }

  if (!response.ok) {
    const errorText = await response.text();
    console.error("Compilation failed:", response.status, errorText);
    try {
      const error = JSON.parse(errorText);
      throw new Error(error.error || `Compilation failed: ${response.status}`);
    } catch (jsonError) {
      throw new Error(`Compilation failed: ${response.status} - ${errorText}`);
    }
  }

  const responseText = await response.text();
  console.log("Compilation response:", responseText.substring(0, 200));

  try {
    return JSON.parse(responseText);
  } catch (jsonError) {
    console.error("Failed to parse compilation response as JSON:", responseText.substring(0, 200));
    throw new Error(`Invalid JSON response from compiler: ${responseText.substring(0, 100)}`);
  }
}