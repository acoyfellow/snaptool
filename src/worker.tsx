import { Hono } from "hono";
import { jsxRenderer } from "hono/jsx-renderer";
import { html } from "hono/html";
import { generateObject } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { z } from "zod";
import { Effect } from "effect";
import { generateWithRetry, searchNpmPackages } from "./utils/external-api";

import type { Cloudflare } from "cloudflare:workers";
import { PromptLog } from "./do";
import { hashPrompt } from "./utils/hash";
import { R2ToolCache } from "./utils/r2-cache";
import { compileWithBun, compileManually } from "./utils/compiler";

export { PromptLog };

const app = new Hono<{ Bindings: Cloudflare.Env }>();

app.use(
  "*",
  jsxRenderer(
    ({ children }) => html`<!doctype html>
      <html lang="en">
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <title>SnapTool</title>
          <script src="https://cdn.tailwindcss.com"></script>
          <link rel="preconnect" href="https://fonts.googleapis.com">
          <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
          <link href="https://fonts.googleapis.com/css2?family=Google+Sans+Code:ital,wght@0,300..800;1,300..800&display=swap" rel="stylesheet">
          <style>
            *{
              font-family: "Google Sans Code", monospace;
            }
          </style>
        </head>
        <body>
          ${children}
        </body>
      </html>`
  )
);

const examples = [
  "Make a UUID generator using the uuid package",
  "Create a markdown to HTML converter using marked",
  "Build a QR code generator that outputs PNG images using qrcode package",
  "Make a JWT token decoder that validates claims using jsonwebtoken",
  "Build a password strength meter using zxcvbn that scores passwords",
  "Create a fake person generator using faker.js with name, email, address",
  "Build a live Bitcoin price API to fetch from CoinGecko",
  "Make a URL slug generator using slugify package",
  "Create a password hash checker using bcryptjs",
  "Build a color palette generator using chroma-js for harmonious colors",
  "Make a JSON validator and formatter using ajv schema validation",
  "Create a text sentiment analyzer using sentiment analysis package"
];

app.get("/", (c) => {
  return c.render(
    <div className="min-h-screen bg-slate-900 text-slate-100">
      <main className="mx-auto max-w-3xl py-10 px-6">

        {/* State 1: Describe */}
        <div id="state-describe" className="transition-all duration-500">
          <h1 className="text-2xl font-semibold mb-4">SnapTool
            <small className="text-sm text-slate-300 block">a Dynamic Tool Generator</small>
          </h1>
          <p className="text-sm text-slate-300 mb-6">
            Describe what you want to build, and AI will generate a custom tool instantly. A simple Worker Loaders (CF) demo.
          </p>

          <details className="mb-6 p-4 bg-slate-800 rounded-lg" open>
            <summary className="cursor-pointer text-emerald-400 font-semibold mb-3">Example prompts</summary>
            <div className="space-y-2 text-sm">
              {examples.map((p) => (
                <button
                  className="block w-full text-left p-2 bg-slate-900 rounded text-xs hover:bg-slate-800 transition-colors"
                  type="button"
                  onclick={`setPrompt('${p}')`}>
                  {p}
                </button>
              ))}
            </div>
          </details>

          <div className="space-y-4">
            <textarea
              id="prompt-input"
              rows={4}
              className="w-full rounded-lg bg-slate-900 border border-slate-800 p-3 text-sm focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-colors"
              placeholder="Create a tool that takes a list of URLs and checks if they're valid..."
            />
            <button onclick="generate()" className="w-full px-4 py-3 bg-emerald-500 text-slate-900 font-semibold rounded-lg hover:bg-emerald-400 transition-colors">
              Generate Tool
            </button>
          </div>

          <div className="flex gap-3 mt-6">
            
            <a href="/recent" className="flex-1 px-4 py-2 bg-slate-600 text-slate-200 font-semibold rounded-lg hover:bg-slate-500 transition-colors text-center">
              History
            </a>
          </div>
        </div>

        {/* State 2: Generate & Test */}
        <div id="state-generate" className="hidden transition-all duration-500">
          <div className="flex justify-start items-center gap-3 mb-6">
            <button onclick="goBack()" className="text-emerald-400 hover:text-emerald-300 transition-colors">← Back</button>
            <h2 className="text-xl font-semibold">Your Tool</h2>
          </div>

          <div className="bg-slate-800 rounded-lg p-4 mb-6">
            <p id="current-prompt" className="text-slate-200"></p>
          </div>

          <div className="grid grid-cols-1 gap-6">
            {/* Code Column */}
            <div>
              <h3 className="text-lg font-semibold mb-3">Generated Code</h3>
              <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden">
                <div className="text-xs text-slate-400 px-3 py-2 border-b border-slate-700 bg-slate-950">
                  TypeScript Worker Code
                </div>
                <pre id="generated-code" className="text-sm text-green-400 whitespace-pre-wrap h-64 p-4 overflow-y-auto">
                  <span className="text-slate-500">Generating code...</span>
                </pre>
              </div>
            </div>

            {/* Test Column */}
            <div>
              <h3 className="text-lg font-semibold mb-3">Test & Results</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-200 mb-2">
                    Test Input:
                  </label>
                  <textarea
                    id="test-input"
                    rows={3}
                    className="w-full rounded-lg bg-slate-900 border border-slate-800 p-3 text-sm focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-colors"
                    placeholder="Test data will auto-populate..."
                  />
                </div>

                <button id="execute-button" onclick="execute()" className="w-full px-4 py-3 bg-emerald-500 text-slate-900 font-semibold rounded-lg hover:bg-emerald-400 transition-colors opacity-50 cursor-not-allowed" disabled>
                  Execute Tool
                </button>

                <div id="result-container" className="hidden">
                  <div className="bg-slate-800 rounded-lg overflow-hidden">
                    <div id="result-header" className="text-xs text-slate-400 px-3 py-2 border-b border-slate-700 bg-slate-950"></div>
                    <pre id="result-content" className="p-4 overflow-x-auto whitespace-pre-wrap text-sm text-slate-100 max-h-32"></pre>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="flex gap-3 mt-6">
            <button onclick="restart()" className="flex-1 px-4 py-2 bg-slate-700 text-slate-200 font-semibold rounded-lg hover:bg-slate-600 transition-colors">
              New Tool
            </button>
            <a href="/recent" className="flex-1 px-4 py-2 bg-slate-600 text-slate-200 font-semibold rounded-lg hover:bg-slate-500 transition-colors text-center">
              History
            </a>
          </div>
        </div>

        <script dangerouslySetInnerHTML={{__html: `
          let currentPrompt = '';
          let generatedCode = '';

          function setPrompt(prompt) {
            document.getElementById('prompt-input').value = prompt;
          }

          function generate() {
            const prompt = document.getElementById('prompt-input').value.trim();
            if (!prompt){
              alert("Please enter a prompt");
              return
            };

            currentPrompt = prompt;
            document.getElementById('current-prompt').textContent = prompt;

            // Clear previous state and show loading
            document.getElementById('generated-code').innerHTML = '<span class="text-slate-500">Generating code...</span>';
            document.getElementById('test-input').value = '';
            document.getElementById('result-container').classList.add('hidden');
            generatedCode = '';

            // Disable all interactive elements during loading
            const generateBtn = document.querySelector('button[onclick="generate()"]');
            const executeBtn = document.getElementById('execute-button');
            const testInput = document.getElementById('test-input');

            generateBtn.disabled = true;
            generateBtn.classList.add('opacity-50', 'cursor-not-allowed');
            executeBtn.disabled = true;
            executeBtn.classList.add('opacity-50', 'cursor-not-allowed');
            testInput.disabled = true;
            testInput.classList.add('opacity-50');

            // Store prompt
            fetch('/api/store-prompt', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ prompt })
            }).catch(() => {});

            // Transition to generate state
            document.getElementById('state-describe').classList.add('hidden');
            document.getElementById('state-generate').classList.remove('hidden');

            // Generate code
            fetch('/api/generate-code', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ prompt })
            })
            .then(response => response.json())
            .then(result => {
              generatedCode = result.typescript;
              document.getElementById('generated-code').textContent = result.typescript;

              // Pre-populate test input with the example
              document.getElementById('test-input').value = result.example;

              // Re-enable all elements
              generateBtn.disabled = false;
              generateBtn.classList.remove('opacity-50', 'cursor-not-allowed');
              executeBtn.disabled = false;
              executeBtn.classList.remove('opacity-50', 'cursor-not-allowed');
              testInput.disabled = false;
              testInput.classList.remove('opacity-50');
            })
            .catch(error => {
              document.getElementById('generated-code').innerHTML = \`<div class="text-red-400">Error: \${error.message}</div><button onclick="generate()" class="mt-3 px-3 py-1 bg-red-500 text-white text-sm rounded hover:bg-red-600">Retry</button>\`;
              document.getElementById('generated-code').className = 'text-sm whitespace-pre-wrap h-64 p-4 overflow-y-auto';

              // Re-enable form elements even on error
              generateBtn.disabled = false;
              generateBtn.classList.remove('opacity-50', 'cursor-not-allowed');
              testInput.disabled = false;
              testInput.classList.remove('opacity-50');
            });
          }

          function execute() {
            const input = document.getElementById('test-input').value || currentPrompt;
            const executeBtn = document.getElementById('execute-button');

            // Disable button during execution
            executeBtn.disabled = true;
            executeBtn.classList.add('opacity-50', 'cursor-not-allowed');
            executeBtn.textContent = 'Executing...';

            fetch('/api/execute-tool', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ code: generatedCode, input, prompt: currentPrompt })
            })
            .then(response => response.json())
            .then(result => {
              document.getElementById('result-header').textContent = 'Content-Type: ' + (result.contentType || 'text/plain');
              document.getElementById('result-content').textContent = result.output;
              document.getElementById('result-container').classList.remove('hidden');
            })
            .catch(error => {
              document.getElementById('result-header').textContent = 'Execution Error';
              document.getElementById('result-content').innerHTML = \`<div class="text-red-400">Error: \${error.message}</div><button onclick="generate()" class="mt-3 px-3 py-1 bg-red-500 text-white text-sm rounded hover:bg-red-600">Regenerate Code</button>\`;
              document.getElementById('result-container').classList.remove('hidden');
            })
            .finally(() => {
              // Re-enable button after execution
              executeBtn.disabled = false;
              executeBtn.classList.remove('opacity-50', 'cursor-not-allowed');
              executeBtn.textContent = 'Execute Tool';
            });
          }

          function goBack() {
            document.getElementById('state-generate').classList.add('hidden');
            document.getElementById('state-describe').classList.remove('hidden');
          }

          function restart() {
            document.getElementById('state-generate').classList.add('hidden');
            document.getElementById('state-describe').classList.remove('hidden');
            document.getElementById('prompt-input').value = '';
            document.getElementById('result-container').classList.add('hidden');
          }

          // Load prompt from session storage
          const loadPrompt = sessionStorage.getItem('loadPrompt');
          if (loadPrompt) {
            document.getElementById('prompt-input').value = loadPrompt;
            sessionStorage.removeItem('loadPrompt');
          }
        `}} />
      </main>
    </div>
  );
});

app.get("/recent", async (c) => {
  const id = c.env.PROMPTS.idFromName("history");
  const stub = c.env.PROMPTS.get(id);
  const res = await stub.fetch(new URL("/list", "http://do").toString());
  const recent: string[] = await res.json();
  return c.render(
    <div className="min-h-screen bg-slate-900 text-slate-100">
      <main className="mx-auto max-w-3xl py-10 px-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold">Recent prompts</h2>
          <button
            onClick="clearPrompts()"
            className="px-3 py-1 bg-red-500 text-white text-sm rounded hover:bg-red-600"
          >
            Clear All
          </button>
        </div>
        <ul className="space-y-2">
          {recent.length === 0 && (<small className="text-slate-300">
            No prompts yet
          </small>)}
          {recent.map((p, i) => (
            <li key={i} className="group">
              <button
                onClick={`loadPrompt('${p.replace(/'/g, "\\'")}')`}
                className="w-full text-left p-3 text-sm text-slate-300 whitespace-pre-wrap break-words border border-slate-800 rounded hover:border-slate-600 hover:bg-slate-800 transition-colors cursor-pointer"
              >
                {p || "(no prompt)"}
              </button>
            </li>
          ))}
        </ul>
        <div className="mt-6">
          <a href="/" className="text-emerald-400 underline">Back</a>
        </div>
        <script dangerouslySetInnerHTML={{__html: `
          function clearPrompts() {
            if (confirm('Clear all prompts?')) {
              fetch('/clear', { method: 'DELETE' })
                .then(() => location.reload());
            }
          }
          function loadPrompt(prompt) {
            sessionStorage.setItem('loadPrompt', prompt);
            window.location.href = '/';
          }
        `}} />
      </main>
    </div>
  );
});

app.delete("/clear", async (c) => {
  // Clear history
  const historyId = c.env.PROMPTS.idFromName("history");
  const historyStub = c.env.PROMPTS.get(historyId);

  // Get all prompts to clear their caches
  const res = await historyStub.fetch(new URL("/list", "http://do").toString());
  const prompts: string[] = await res.json();

  // Clear each prompt's cached data
  const cache = new R2ToolCache(c.env.TOOL_CACHE);
  for (const prompt of prompts) {
    const promptHash = await hashPrompt(prompt);

    // Clear generated code DO
    const generatedId = c.env.PROMPTS.idFromName(`generated:${promptHash}`);
    await c.env.PROMPTS.get(generatedId).fetch(new URL("/clear", "http://do").toString(), {
      method: "DELETE"
    });

    // Clear R2 compiled cache
    await cache.delete(promptHash);
  }

  // Clear history
  await historyStub.fetch(new URL("/clear", "http://do").toString(), {
    method: "DELETE"
  });

  return new Response("cleared");
});


app.post("/api/store-prompt", async (c) => {
  const { prompt } = await c.req.json();
  if (prompt?.trim()) {
    const id = c.env.PROMPTS.idFromName("history");
    await c.env.PROMPTS.get(id).fetch(new URL("/write", "http://do").toString(), {
      method: "POST",
      body: prompt
    }).catch(() => {});
  }
  return new Response("ok");
});

app.post("/api/execute-tool", async (c) => {
  try {
    const { code, input, prompt } = await c.req.json();

    if (!code?.trim()) {
      console.error("No code provided");
      return Response.json({ error: "No code provided" }, { status: 400 });
    }

    if (!c.env.LOADER) {
      console.error("LOADER binding not available");
      return Response.json({ error: "Worker Loaders not available - check wrangler.jsonc" }, { status: 500 });
    }

    // Create hash for caching based on prompt, not generated code
    // This ensures consistent cache hits for same prompts even if AI generates slightly different code
    const promptHash = prompt ? await hashPrompt(prompt) : await hashPrompt(code);
    const isolateId = `tool:${promptHash}`;

    console.log("Execute tool:", { hash: promptHash.substring(0, 8), hasPrompt: !!prompt });

    // Initialize R2 cache
    const cache = new R2ToolCache(c.env.TOOL_CACHE);

    // Check cache first
    const cachedTool = await cache.get(promptHash);
    if (cachedTool) {
      console.log("Cache hit! Using cached compiled tool");

      // Create worker with cached modules
      const worker = c.env.LOADER.get(isolateId, async () => ({
        compatibilityDate: "2025-06-01",
        mainModule: "main.js",
        modules: {
          "main.js": cachedTool.code,
          ...cachedTool.nodeModules
        },
        env: {
          WHO: "dynamic-tool",
          PROXY_URL: new URL("/proxy", c.req.url).toString()
        }
      }));

      const endpoint = worker.getEntrypoint();
      const url = new URL(`http://tool/?q=${encodeURIComponent(input)}`);
      const out = await endpoint.fetch(url.toString());
      const output = await out.text();
      const contentType = out.headers.get("content-type") || "text/plain";

      return Response.json({ output, contentType });
    }

    console.log("Cache miss. Compiling tool...");

    let compilerResult;
    let compilationMethod = "unknown";

    // Use Bun compilation via Durable Object (has filesystem access)
    try {
      console.log("Attempting Bun compilation in DO...");
      compilerResult = await compileWithBun(code, c.env);
      compilationMethod = "bun";
      console.log("Bun compilation successful");
    } catch (bunError) {
      console.error("Bun compilation failed:", bunError);
      throw bunError; // No fallback - let it fail
    }

    // Cache the compiled result
    try {
      await cache.set(promptHash, {
        code: compilerResult.mainCode,
        nodeModules: compilerResult.additionalModules,
        metadata: {
          createdAt: Date.now(),
          packages: compilerResult.packages
        }
      });
      console.log("Tool cached successfully");
    } catch (cacheError) {
      console.warn("Failed to cache compiled tool:", cacheError);
      // Continue without caching
    }

    // Create worker with compiled result
    const worker = c.env.LOADER.get(isolateId, async () => ({
      compatibilityDate: "2025-06-01",
      mainModule: "main.js",
      modules: {
        "main.js": compilerResult.mainCode,
        ...compilerResult.additionalModules
      },
      env: {
        WHO: "dynamic-tool",
        PROXY_URL: new URL("/proxy", c.req.url).toString()
      }
    }));

    console.log("Getting endpoint...");
    const endpoint = worker.getEntrypoint();

    const url = new URL(`http://tool/?q=${encodeURIComponent(input)}`);
    console.log("Fetching:", url.toString());

    const out = await endpoint.fetch(url.toString());
    console.log("Response status:", out.status);

    const output = await out.text();
    const contentType = out.headers.get("content-type") || "text/plain";

    console.log("Success! Output length:", output.length);
    console.log("Compilation method:", compilationMethod);

    return Response.json({ output, contentType });

  } catch (error) {
    console.error("Execute tool error:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return Response.json({ error: errorMessage }, { status: 500 });
  }
});

app.get("/proxy", async (c) => {
  const url = c.req.query('url');
  if (!url) {
    return new Response('Missing url parameter', { status: 400 });
  }

  try {
    console.log("Proxying request to:", url);
    const response = await fetch(url);
    const data = await response.text();

    return new Response(data, {
      status: response.status,
      headers: {
        'Content-Type': response.headers.get('Content-Type') || 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  } catch (error) {
    console.error("Proxy error:", error);
    return new Response(`Proxy error: ${error.message}`, { status: 500 });
  }
});


app.post("/api/generate-code", async (c) => {
  const { prompt } = await c.req.json();

  if (!prompt?.trim()) {
    return new Response("Missing prompt", { status: 400 });
  }

  console.log("Generating code with OpenAI for:", prompt);

  // Check DO cache first for exact prompt match
  const promptHash = await hashPrompt(prompt);
  const id = c.env.PROMPTS.idFromName(`generated:${promptHash}`);
  const stub = c.env.PROMPTS.get(id);

  // Try to get cached generated code from DO
  const cachedResponse = await stub.fetch(new URL("/get-generated", "http://do").toString());
  if (cachedResponse.ok) {
    const cached = await cachedResponse.json();
    console.log("Cache hit! Serving cached generated code");
    return Response.json(cached);
  }

  console.log("Cache miss. Generating new code...");

  if (!c.env.OPENAI_API_KEY) {
    console.error("OPENAI_API_KEY not found in environment");
    return new Response("OpenAI API key not configured", { status: 500 });
  }

  try {
    // Search for relevant npm packages based on the prompt
    const searchResults = await Effect.runPromise(searchNpmPackages(prompt));
    const availablePackages = searchResults.slice(0, 20); // Top 20 results

    console.log("Found available packages:", availablePackages.map(p => p.name));

    // For better results, try to get package info for the most relevant packages
    let packageExportsInfo = '';
    if (availablePackages.length > 0) {
      const topPackage = availablePackages[0];
      try {
        // Quick check of the top package's exports
        const quickInfo = await fetch(`https://registry.npmjs.org/${topPackage.name}/latest`);
        const quickPackageInfo = await quickInfo.json();

        packageExportsInfo = `\n\nTOP PACKAGE INFO:
- ${topPackage.name}: ${topPackage.description}
  - Main entry: ${quickPackageInfo.main || 'index.js'}
  - Browser entry: ${typeof quickPackageInfo.browser === 'string' ? quickPackageInfo.browser : 'check browser field'}
  - NOTE: Use default import or check actual exports in console logs`;
      } catch (e) {
        // Fallback to basic list
      }
    }

    const packageList = availablePackages.length > 0
      ? `\n\nAVAILABLE NPM PACKAGES (use these EXACT names only):\n${availablePackages.map(p => `- ${p.name}: ${p.description}`).join('\n')}${packageExportsInfo}`
      : '';

    const openai = createOpenAI({
      apiKey: c.env.OPENAI_API_KEY,
    });

    const result = await Effect.runPromise(
      generateWithRetry(() => generateObject({
        model: openai("gpt-5-mini"),
        schema: z.object({
          typescript: z.string().describe("Complete Cloudflare Worker code that implements the requested functionality"),
          example: z.string().describe("ONLY the parameter value that goes into ?q=VALUE - NOT a full URL. Example: 'usd' not 'https://example.com/?q=usd'")
        }),
      prompt: `Create a Cloudflare Worker that implements: ${prompt}${packageList}

EXACT FORMAT REQUIRED:
import { something } from 'package-name';

export default {
  fetch(req, env, ctx) {
    // your code here
    return new Response('result', { headers: { 'Content-Type': 'text/plain' } });
  }
}

CRITICAL REQUIREMENTS:
- Must follow EXACT format above (simple object literal export)
- ONLY import npm packages if you ACTUALLY USE them in your code - unused imports cause errors
- If you import a package, you MUST use it in your implementation
- When possible, implement with native fetch() instead of importing external packages
- ONLY import npm packages from the AVAILABLE NPM PACKAGES list above (use EXACT names)
- If no suitable package is listed, implement without imports or return an error
- IMPORT SYNTAX: Most packages use default exports, so prefer: import packageName from 'package-name'
- If you need named exports, use: import { specificFunction } from 'package-name'
- NEVER assume what exports are available - use default import first, then destructure if needed
- Write PLAIN JAVASCRIPT (no TypeScript types like req: Request, env: any)
- NO async/await in import statements - use static imports only
- NO dynamic imports - all imports must be at the top of file
- NO require() statements
- Add try/catch for error handling inside fetch function
- Return new Response() with proper headers
- ABSOLUTELY NEVER write "fallback code" that makes it look like the code works. It either works as expected or it errors out.
- If a package doesn't exist, the code should fail clearly, not provide alternatives
- Accept input via URL query parameter ?q=INPUT - use new URL(req.url).searchParams.get('q')
- NEVER call external APIs directly - ALWAYS use fetch(env.PROXY_URL + '?url=' + encodeURIComponent(externalUrl))
- Do NOT use axios.get(externalUrl) - use fetch(env.PROXY_URL + '?url=' + encodeURIComponent(externalUrl))

SAFE IMPORT PATTERN:
import packageName from 'package-name';
// Then use packageName.methodName() or destructure: const { methodName } = packageName;

WORKING EXAMPLE:
import { v4 as uuidv4 } from 'uuid';

export default {
  fetch(req, env, ctx) {
    try {
      const uuid = uuidv4();
      return new Response(JSON.stringify({ uuid }), {
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (error) {
      return new Response('Error', { status: 500 });
    }
  }
}`
      }))
    );

    console.log("Generated typescript length:", result.object.typescript.length);
    console.log("Generated example:", result.object.example);

    // Minimal validation - just check it looks like a Worker
    const code = result.object.typescript.trim();
    const example = result.object.example.trim();

    if (!code.includes("export default") || !code.includes("fetch(")) {
      console.error("VALIDATION FAILED: Doesn't look like a Worker export");
      return new Response("Generated code must export a Worker with fetch handler", { status: 500 });
    }

    // Basic brace matching
    const openBraces = (code.match(/\{/g) || []).length;
    const closeBraces = (code.match(/\}/g) || []).length;
    if (openBraces !== closeBraces) {
      console.error(`VALIDATION FAILED: Mismatched braces: ${openBraces} open, ${closeBraces} close`);
      return new Response(`Syntax error: mismatched braces`, { status: 500 });
    }

    // Check for common URL typos in imports
    if (code.includes('https:/esm.sh')) {
      console.error("VALIDATION FAILED: Malformed esm.sh URL (missing slash)");
      return new Response(`Import URL error: use https://esm.sh not https:/esm.sh`, { status: 500 });
    }

    // Cache the generated result in DO
    const generatedResult = {
      typescript: result.object.typescript,
      example: result.object.example
    };

    try {
      await stub.fetch(new URL("/cache-generated", "http://do").toString(), {
        method: "POST",
        body: JSON.stringify(generatedResult)
      });
      console.log("Generated code cached in DO");
    } catch (cacheError) {
      console.warn("Failed to cache generated code:", cacheError);
    }

    return Response.json(generatedResult);

  } catch (error) {
    console.error("OpenAI generation error:", error);
    return new Response(`OpenAI error: ${error instanceof Error ? error.message : String(error)}`, { status: 500 });
  }
});

// Combined generate and execute endpoint for AI function calling
app.post("/api/generate-and-execute", async (c) => {
  try {
    const { prompt, input } = await c.req.json();

    if (!prompt?.trim()) {
      return Response.json({ error: "Missing prompt" }, { status: 400 });
    }

    console.log("Generate and execute:", { prompt: prompt.substring(0, 50), hasInput: !!input });

    // Step 1: Generate the tool (with caching)
    const generateResponse = await fetch(new URL("/api/generate-code", c.req.url).toString(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt })
    });

    if (!generateResponse.ok) {
      const error = await generateResponse.text();
      return Response.json({ error: `Generation failed: ${error}` }, { status: 500 });
    }

    const generated = await generateResponse.json();

    // Step 2: Execute the tool immediately
    const executeResponse = await fetch(new URL("/api/execute-tool", c.req.url).toString(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code: generated.typescript,
        input: input || generated.example,
        prompt
      })
    });

    if (!executeResponse.ok) {
      const error = await executeResponse.text();
      return Response.json({ error: `Execution failed: ${error}` }, { status: 500 });
    }

    const executed = await executeResponse.json();

    return Response.json({
      toolDescription: prompt,
      result: executed.output,
      contentType: executed.contentType,
      exampleInput: generated.example,
      cached: executeResponse.headers.get("x-cache") === "hit"
    });

  } catch (error) {
    console.error("Generate and execute error:", error);
    return Response.json({
      error: `Tool execution failed: ${error instanceof Error ? error.message : String(error)}`
    }, { status: 500 });
  }
});

// Tool discovery endpoint for searching cached tools
app.get("/api/tools/search", async (c) => {
  const query = c.req.query('q');

  if (!query) {
    return Response.json({ error: "Missing query parameter" }, { status: 400 });
  }

  try {
    // Get all prompts from history to search through
    const historyId = c.env.PROMPTS.idFromName("history");
    const historyStub = c.env.PROMPTS.get(historyId);
    const historyResponse = await historyStub.fetch(new URL("/list", "http://do").toString());
    const allPrompts: string[] = await historyResponse.json();

    // Simple text search through cached prompts
    const matches = allPrompts
      .filter(prompt => prompt.toLowerCase().includes(query.toLowerCase()))
      .slice(0, 10)
      .map(async (prompt) => {
        const hash = await hashPrompt(prompt);
        return {
          prompt,
          hash: hash.substring(0, 8),
          description: prompt
        };
      });

    const results = await Promise.all(matches);

    return Response.json({
      query,
      results,
      total: results.length
    });

  } catch (error) {
    console.error("Tool search error:", error);
    return Response.json({ error: "Search failed" }, { status: 500 });
  }
});

// Quick execute cached tool by prompt
app.post("/api/tools/execute", async (c) => {
  try {
    const { prompt, input } = await c.req.json();

    if (!prompt?.trim()) {
      return Response.json({ error: "Missing prompt" }, { status: 400 });
    }

    // Check if tool is cached
    const promptHash = await hashPrompt(prompt);
    const cache = new R2ToolCache(c.env.TOOL_CACHE);
    const cachedTool = await cache.get(promptHash);

    if (!cachedTool) {
      return Response.json({
        error: "Tool not cached. Use /api/generate-and-execute first.",
        suggestion: `POST /api/generate-and-execute with prompt: "${prompt}"`
      }, { status: 404 });
    }

    // Execute cached tool directly
    const isolateId = `tool:${promptHash}`;
    const worker = c.env.LOADER.get(isolateId, async () => ({
      compatibilityDate: "2025-06-01",
      mainModule: "main.js",
      modules: {
        "main.js": cachedTool.code,
        ...cachedTool.nodeModules
      },
      env: {
        WHO: "cached-tool",
        PROXY_URL: new URL("/proxy", c.req.url).toString()
      }
    }));

    const endpoint = worker.getEntrypoint();
    const url = new URL(`http://tool/?q=${encodeURIComponent(input || "")}`);
    const out = await endpoint.fetch(url.toString());
    const output = await out.text();
    const contentType = out.headers.get("content-type") || "text/plain";

    return Response.json({
      result: output,
      contentType,
      cached: true,
      toolHash: promptHash.substring(0, 8)
    });

  } catch (error) {
    console.error("Cached tool execution error:", error);
    return Response.json({
      error: `Execution failed: ${error instanceof Error ? error.message : String(error)}`
    }, { status: 500 });
  }
});

export default {
  fetch: app.fetch,
} satisfies ExportedHandler<Cloudflare.Env>;