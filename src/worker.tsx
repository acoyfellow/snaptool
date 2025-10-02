import { Hono } from "hono";
import { jsxRenderer } from "hono/jsx-renderer";
import { html } from "hono/html";
import { generateObject } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { z } from "zod";

import { DurableObject } from "cloudflare:workers";
import type { R2Bucket, Cloudflare } from "cloudflare:workers";
import { marked } from 'marked';

// README content (you can replace this with the actual content)
const readmeContent = `# Anytool: Infinite Tools Without the Context Bloat

**One Tool To Rule Them All** - Transform any natural language description into a working, cached, executable tool that returns the perfect content type.

## The Core Value Proposition

Instead of building and maintaining hundreds of individual tools for AI agents, you give them **one universal tool** that can generate any other tool on-demand.

**Traditional Approach:**
- Build 50+ individual tools (UUID generator, QR code maker, password checker, etc.)
- Maintain each tool separately
- Hand over a massive tool list to your AI agent
- Each tool has fixed functionality

**Anytool Approach:**
- Build **one universal tool** that generates others
- AI describes what it needs: "Create a QR code generator that returns SVG"
- Tool is generated, compiled, cached, and executed instantly
- Same prompt = instant cached response (~50ms)
- **Infinite tools from one tool**

## What Makes This Revolutionary

### **Dynamic Content Type Intelligence**
Anytool doesn't just generate code - it understands what type of response you need and handles it perfectly:

- "Create a QR code generator" → Returns SVG with proper headers
- "Build a password checker" → Returns JSON with strength analysis
- "Make an image resizer" → Returns base64 PNG data
- "Create a CSV parser" → Returns formatted HTML table

### **Smart Response Handling**
The system automatically:
1. **Detects output type** from the AI-generated tool (image, json, html, svg, csv, etc.)
2. **Sets proper headers** in the generated Worker
3. **Renders appropriately** in the UI (images display, JSON formats, CSV becomes tables)
4. **Caches everything** so repeat requests are instant

## Quick Start

\`\`\`bash
# Install dependencies
bun install

# Start development server
bun dev

# Visit http://localhost:8787
\`\`\`

## Example Prompts to Try

### **Text & Data Tools**
- "Make a UUID generator using the uuid package"
- "Create a password strength meter using zxcvbn"
- "Build a JWT token decoder that validates claims"
- "Create a markdown to HTML converter using marked"

### **Visual Tools**
- "Create a QR code generator that returns SVG"
- "Build a QR code generator that outputs PNG images"
- "Make a simple chart generator that returns SVG"

### **Data Processing**
- "Create a CSV parser that returns formatted HTML tables"
- "Build a JSON validator and formatter"
- "Make a URL shortener with analytics"`;

const app = new Hono<{ Bindings: Cloudflare.Env }>();

app.use(
  "*",
  jsxRenderer(
    ({ children }) => html`<!doctype html>
      <html lang="en">
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <title>Anytool</title>
          <script src="https://cdn.tailwindcss.com"></script>
          <link rel="preconnect" href="https://fonts.googleapis.com">
          <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
          <link href="https://fonts.googleapis.com/css2?family=Google+Sans+Code:ital,wght@0,300..800;1,300..800&display=swap" rel="stylesheet">
          <style>
            *{
              font-family: "Google Sans Code", monospace;
            }
            .prose h1 {
              font-size: 1.5rem;
              font-weight: bold;
              margin-top: 1.5rem;
              margin-bottom: 1rem;
              color: #ffffff;
            }
            .prose h2 {
              font-size: 1.25rem;
              font-weight: bold;
              margin-top: 1.5rem;
              margin-bottom: 0.75rem;
              color: #60a5fa;
            }
            .prose h3 {
              font-size: 1.125rem;
              font-weight: bold;
              margin-top: 1rem;
              margin-bottom: 0.5rem;
              color: #93c5fd;
            }
            .prose p {
              margin-bottom: 0.75rem;
              color: #d1d5db;
            }
            .prose pre {
              background-color: #111827;
              padding: 0.75rem;
              border-radius: 0.375rem;
              overflow-x: auto;
              color: #d1d5db;
            }
            .prose code {
              background-color: #374151;
              padding: 0.125rem 0.25rem;
              border-radius: 0.25rem;
              font-size: 0.875rem;
              color: #d1d5db;
            }
            .prose strong {
              color: #ffffff;
              font-weight: bold;
            }
            .prose table {
              width: 100%;
              border-collapse: collapse;
              border: 1px solid #4b5563;
              margin-top: 1rem;
              margin-bottom: 1rem;
            }
            .prose th, .prose td {
              border: 1px solid #4b5563;
              padding: 0.5rem;
            }
            .prose th {
              background-color: #1f2937;
              font-weight: bold;
              color: #ffffff;
            }
            .prose td {
              color: #d1d5db;
            }
            .prose ul {
              margin-left: 1rem;
              margin-top: 0.5rem;
              margin-bottom: 0.5rem;
            }
            .prose li {
              color: #d1d5db;
              margin-bottom: 0.25rem;
            }
            .prose blockquote {
              border-left: 4px solid #4b5563;
              padding-left: 1rem;
              margin: 1rem 0;
              color: #9ca3af;
              font-style: italic;
            }
          </style>
        </head>
        <body>
          ${children}
        </body>
      </html>`
  )
);

// Simple hash function
async function hashPrompt(prompt: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(prompt.trim().toLowerCase());
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// Tool interface
interface CachedTool {
  hash: string;
  bundledCode: string;
  createdAt: number;
  packages: string[];
  outputType: string;
  outputDescription: string;
}

// Simple R2 cache
class ToolCache {
  constructor(private r2: R2Bucket) { }

  async get(hash: string): Promise<CachedTool | null> {
    try {
      const object = await this.r2.get(`tools/${hash}.json`);
      if (!object) return null;
      return await object.json() as CachedTool;
    } catch {
      return null;
    }
  }

  async set(hash: string, tool: Omit<CachedTool, 'hash'>): Promise<void> {
    const data: CachedTool = { hash, ...tool };
    await this.r2.put(`tools/${hash}.json`, JSON.stringify(data), {
      httpMetadata: { contentType: 'application/json' }
    });
  }
}

// Compilation via container
async function compileTool(code: string, env: Cloudflare.Env): Promise<{ bundledCode: string; packages: string[] }> {
  console.log("Starting compilation...");

  // Use localhost fallback for local dev
  const useLocalhost = true; // Force localhost for now since container isn't working

  let response;
  if (useLocalhost) {
    response = await fetch('http://localhost:3000/compile', {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code })
    });
  } else {
    if (!env.BUN_COMPILER_DO) {
      throw new Error('BUN_COMPILER_DO container binding not available');
    }
    console.log("Using container for compilation...");
    const container = env.BUN_COMPILER_DO.get(env.BUN_COMPILER_DO.idFromName('compiler'));
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
    const result = JSON.parse(responseText);
    return {
      bundledCode: result.mainCode,
      packages: result.packages || []
    };
  } catch (jsonError) {
    console.error("Failed to parse compilation response as JSON:", responseText.substring(0, 200));
    throw new Error(`Invalid JSON response from compiler: ${responseText.substring(0, 100)}`);
  }
}

// Execute tool using Worker Loaders
async function executeTool(bundledCode: string, input: string, hash: string, env: Cloudflare.Env): Promise<{ output: string; contentType: string }> {
  if (!env.LOADER) {
    throw new Error('Worker Loaders not available');
  }

  const isolateId = `tool:${hash}`;

  const worker = env.LOADER.get(isolateId, async () => ({
    compatibilityDate: "2025-09-27",
    mainModule: "tool.js",
    modules: {
      "tool.js": bundledCode
    }
  }));

  const endpoint = worker.getEntrypoint();
  const url = new URL(`http://tool/?q=${encodeURIComponent(input)}`);
  const response = await endpoint.fetch(url.toString());
  const output = await response.text();
  const contentType = response.headers.get("content-type") || "text/plain";

  return { output, contentType };
}

// Simple history storage
class PromptHistory {
  private history: string[] = [];

  add(prompt: string) {
    if (prompt?.trim()) {
      // Remove duplicates and add to front
      this.history = [prompt, ...this.history.filter(p => p !== prompt)].slice(0, 50);
    }
  }

  list(): string[] {
    return [...this.history];
  }

  clear() {
    this.history = [];
  }
}

const promptHistory = new PromptHistory();

// Main API endpoint: Generate and Execute
app.post("/api/tool", async (c) => {
  let hash = "(null)";
  let tool = null;
  try {
    const { prompt, input = "", forceRegenerate = false } = await c.req.json();

    if (!prompt?.trim()) {
      return Response.json({ error: "Missing prompt" }, { status: 400 });
    }

    // 1. Hash prompt and store in history
    hash = await hashPrompt(prompt);
    promptHistory.add(prompt);
    console.log(`Tool request: ${hash.substring(0, 8)}`);

    // 2. Check cache (unless forcing regeneration)
    const cache = new ToolCache(c.env.TOOL_CACHE);
    tool = forceRegenerate ? null : await cache.get(hash);

    if (forceRegenerate && tool) {
      console.log("Force regeneration - clearing cached tool");
      await c.env.TOOL_CACHE.delete(`tools/${hash}.json`);
      tool = null;
    }

    if (!tool) {
      console.log("Cache miss - generating tool");

      // 3. Generate code with AI
      if (!c.env.OPENAI_API_KEY) {
        return Response.json({ error: "OpenAI API key not configured" }, { status: 500 });
      }

      const openai = createOpenAI({ apiKey: c.env.OPENAI_API_KEY });

      const result = await generateObject({
        model: openai("gpt-4o-mini"),
        schema: z.object({
          typescript: z.string().describe("Complete Cloudflare Worker code that implements the requested functionality"),
          example: z.string().describe("ONLY the parameter value that goes into ?q=VALUE - NOT a full URL. Example: 'usd' not 'https://example.com/?q=usd'"),
          outputType: z.enum(['text', 'json', 'html', 'image', 'svg', 'csv', 'xml']).describe("Expected output content type from this tool"),
          outputDescription: z.string().describe("Brief description of what the output contains (e.g., 'Base64-encoded PNG image', 'HTML with embedded QR code', 'JSON with UUID')")
        }),
        prompt: `Create a Cloudflare Worker that implements: ${prompt}

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
- WORKER COMPATIBILITY: Only use packages that work in Cloudflare Workers (no DOM, no Node.js APIs)
- RECOMMENDED PACKAGES: uuid, lodash, date-fns, crypto-js, marked, zxcvbn
- AVOID: qrcode (needs canvas), sharp (needs Node), puppeteer, any DOM-dependent packages
- When possible, implement with native fetch() and Web APIs instead of importing packages
- Write PLAIN JAVASCRIPT (no TypeScript types like req: Request, env: any)
- NO async/await in import statements - use static imports only
- NO dynamic imports - all imports must be at the top of file
- NO require() statements
- Add try/catch for error handling inside fetch function
- Return new Response() with proper headers
- Accept input via URL query parameter ?q=INPUT - use new URL(req.url).searchParams.get('q')
- Always have a sensible default value for the input, so empty calls don't error
- If no suitable package is available, implement without imports or return an error
- Match your outputType choice: 'image' = return base64 data or data URLs, 'html' = return HTML, 'json' = return JSON, etc.
- For images: return base64 strings, data URLs, or raw image data
- For HTML: return complete HTML snippets that can be directly rendered
- CRITICAL: If using async operations, make fetch function async and await all promises
- NEVER return [object Promise] - always await async operations before returning
- FOR QR CODES: Use 'qr-code-generator' package (pure JS, no canvas) or implement simple QR logic
- FOR IMAGES: Return base64 string or data URL, NOT a Promise object
- WORKERS LIMITATION: No canvas/DOM/Node APIs - only Web APIs and pure JS packages

WORKING EXAMPLES:

// Simple sync example:
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
}

// QR code example with worker-compatible package:
import qrcode from 'qr-code-generator';

export default {
  fetch(req, env, ctx) {
    try {
      const input = new URL(req.url).searchParams.get('q') || 'Hello World';
      const qr = qrcode(0, 'M');
      qr.addData(input);
      qr.make();
      const svgString = qr.createSvgTag(4, 0);
      return new Response(svgString, {
        headers: { 'Content-Type': 'image/svg+xml' }
      });
    } catch (error) {
      return new Response('Error generating QR code', { status: 500 });
    }
  }
}`
      });

      // 4. Compile code
      const compiled = await compileTool(result.object.typescript, c.env);

      // 5. Cache compiled tool
      tool = {
        hash,
        bundledCode: compiled.bundledCode,
        createdAt: Date.now(),
        packages: compiled.packages,
        outputType: result.object.outputType,
        outputDescription: result.object.outputDescription
      };

      await cache.set(hash, tool);
      console.log(`Cached tool: ${hash.substring(0, 8)} with ${tool.packages.length} packages`);
    } else {
      console.log("Cache hit - using cached tool");
    }

    // 6. Execute tool
    console.log("Executing tool with hash:", hash.substring(0, 8));
    const result = await executeTool(tool.bundledCode, input, hash, c.env);
    console.log("Tool execution completed successfully");

    return Response.json({
      output: result.output,
      contentType: result.contentType,
      outputType: tool.outputType,
      outputDescription: tool.outputDescription,
      toolHash: hash.substring(0, 255),
      packages: tool.packages,
      cached: !!tool,
      generatedCode: tool.bundledCode
    });

  } catch (error) {
    console.error("Tool execution error:", error);
    console.error("Error stack:", error instanceof Error ? error.stack : 'No stack trace');
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("Detailed error:", {
      message: errorMessage,
      hash: hash?.substring(0, 8),
      hasCode: !!tool?.bundledCode,
      packages: tool?.packages || []
    });
    return Response.json({
      error: `Tool failed: ${errorMessage}`,
      details: {
        hash: hash?.substring(0, 8),
        packages: tool?.packages || [],
        stack: error instanceof Error ? error.stack : undefined
      }
    }, { status: 500 });
  }
});

// History endpoints
app.get("/recent", async (c) => {
  const recent = promptHistory.list();

  return c.render(
    <div className="bg-gray-900 text-gray-100 min-h-screen">
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold">Recent Prompts</h1>
          <div className="flex gap-3">
            <button onclick="clearAll()" className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded">
              Clear All
            </button>
            <a href="/" className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded">
              Back to Tool
            </a>
          </div>
        </div>

        <div className="space-y-3">
          {recent.length === 0 ? (
            <p className="text-gray-400">No prompts yet. Create some tools first!</p>
          ) : (
            recent.map((prompt, i) => (
              <div key={i} className="bg-gray-800 p-4 rounded-lg">
                <button
                  onclick={`loadPrompt('${prompt.replace(/'/g, "\\'")}', event)`}
                  className="w-full text-left text-gray-100 hover:text-blue-400 transition-colors"
                >
                  {prompt}
                </button>
              </div>
            ))
          )}
        </div>

        <script dangerouslySetInnerHTML={{__html: `
          function clearAll() {
            if (confirm('Clear all history?')) {
              fetch('/api/clear-history', { method: 'DELETE' })
                .then(() => location.reload())
                .catch(err => alert('Error: ' + err.message));
            }
          }

          function loadPrompt(prompt, event) {
            event.preventDefault();
            sessionStorage.setItem('loadPrompt', prompt);
            window.location.href = '/';
          }
        `}} />
      </div>
    </div>
  );
});

app.delete("/api/clear-history", async (c) => {
  promptHistory.clear();
  return Response.json({ message: "History cleared" });
});

// Serve the HTML interface
app.get("/", async (c) => {
  const _html = await marked(readmeContent, {
    breaks: true,
  });
  return c.render(
    <div className="bg-gray-900 text-gray-100 min-h-screen">
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <h1 className="text-3xl font-bold mb-2">Anytool</h1>
        <p className="text-gray-400 mb-4">Infinite tools without the context bloat</p>

        <details className="mb-6 p-4 bg-gray-800 rounded-lg">
          <summary className="cursor-pointer text-blue-400 font-semibold hover:text-blue-300">
            Learn More
          </summary>
          <div
            className="mt-4 prose prose-invert prose-sm max-w-none text-gray-300 leading-relaxed"
            dangerouslySetInnerHTML={{
              __html: _html
            }}
          />
        </details>

        <div className="space-y-6">
          {/* Input Section */}
          <div className="bg-gray-800 p-6 rounded-lg">
            <label className="block text-sm font-medium mb-2">Describe your tool:</label>
            <textarea
              id="prompt"
              rows={4}
              className="w-full p-3 bg-gray-700 border border-gray-600 rounded focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              placeholder="Create a tool that converts markdown to HTML using the marked package"
            />

            <div className="mt-4 space-y-3">
              <div className="flex gap-3">
                <input
                  id="input"
                  type="text"
                  className="flex-1 p-3 bg-gray-700 border border-gray-600 rounded focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  placeholder="Test input (optional)"
                />
                <button
                  id="execute"
                  className="px-6 py-3 bg-blue-600 hover:bg-blue-700 rounded font-medium"
                  onclick="executeTool()"
                >
                  »
                </button>
              </div>
              <div className="flex gap-2 text-sm flex-col md:flex-row">
                <label className="flex items-center gap-2">
                  <input type="checkbox" id="forceRegenerate" className="rounded" />
                  <span>Force regenerate (bypass cache)</span>
                </label>
                <a href="/recent" className="px-3 py-1 bg-gray-600 hover:bg-gray-500 rounded text-sm">
                  History
                </a>
              </div>
            </div>
          </div>

          {/* Output Section */}
          <div id="output" className="bg-gray-800 p-6 rounded-lg hidden">
            <div className="mb-4">
              <h3 className="text-lg font-medium">Output</h3>
              <div id="meta" className="text-sm text-gray-400 block"></div>
            </div>
            <div className="grid gap-4">
              <div className="bg-gray-900 p-4 rounded overflow-auto">
                <div className="text-xs text-gray-400 mb-2">Result:</div>
                <pre id="result" className="whitespace-pre-wrap"></pre>
              </div>
              <div id="generatedCodeSection" className="bg-gray-900 p-4 rounded overflow-auto hidden">
                <div className="text-xs text-gray-400 mb-2">Generated Worker Code:</div>
                <pre id="generatedCode" className="whitespace-pre-wrap text-green-400 text-xs max-h-60 overflow-auto"></pre>
              </div>
            </div>
          </div>

          {/* Examples */}
          <div className="bg-gray-800 p-6 rounded-lg">
            <h3 className="text-lg font-medium mb-4">Example Tools</h3>
            <div className="grid gap-2">
              <button onclick="setPrompt('Create a UUID generator using the uuid package')" className="text-left p-2 bg-gray-700 hover:bg-gray-600 rounded text-sm">
                UUID Generator
              </button>
              <button onclick="setPrompt('Build a QR code generator that returns SVG using qr-code-generator')" className="text-left p-2 bg-gray-700 hover:bg-gray-600 rounded text-sm">
                QR Code Generator (SVG)
              </button>
              <button onclick="setPrompt('Create a markdown to HTML converter using marked')" className="text-left p-2 bg-gray-700 hover:bg-gray-600 rounded text-sm">
                Markdown Converter
              </button>
              <button onclick="setPrompt('Build a password strength checker using zxcvbn')" className="text-left p-2 bg-gray-700 hover:bg-gray-600 rounded text-sm">
                Password Checker
              </button>
              <button onclick="setPrompt('Create a simple hello world tool')" className="text-left p-2 bg-gray-700 hover:bg-gray-600 rounded text-sm">
                Hello World (no deps)
              </button>
            </div>
          </div>
        </div>

        <script dangerouslySetInnerHTML={{__html: `
          function setPrompt(text) {
            document.getElementById('prompt').value = text;
          }

          function displayOutput(container, output, outputType) {
            container.innerHTML = ''; // Clear previous content

            switch(outputType) {
              case 'image':
                if (output.startsWith('data:image/') || output.startsWith('http')) {
                  const img = document.createElement('img');
                  img.src = output;
                  img.style.maxWidth = '100%';
                  img.style.height = 'auto';
                  container.appendChild(img);
                } else if (output.includes('<svg') || output.includes('<?xml')) {
                  // Handle SVG content returned as image
                  container.innerHTML = output;
                } else {
                  // Try to create data URL from base64
                  const img = document.createElement('img');
                  img.src = \`data:image/png;base64,\${output}\`;
                  img.style.maxWidth = '100%';
                  img.style.height = 'auto';
                  container.appendChild(img);
                }
                break;

              case 'html':
                container.innerHTML = output;
                break;

              case 'svg':
                container.innerHTML = output;
                break;

              case 'json':
                try {
                  const formatted = JSON.stringify(JSON.parse(output), null, 2);
                  container.textContent = formatted;
                } catch {
                  container.textContent = output;
                }
                break;

              case 'csv':
                // Create a simple table for CSV
                const lines = output.split('\\n').filter(line => line.trim());
                if (lines.length > 0) {
                  const table = document.createElement('table');
                  table.className = 'w-full border-collapse border border-gray-600';

                  lines.forEach((line, index) => {
                    const row = document.createElement('tr');
                    const cells = line.split(',');

                    cells.forEach(cell => {
                      const cellElement = document.createElement(index === 0 ? 'th' : 'td');
                      cellElement.className = 'border border-gray-600 px-2 py-1 text-left';
                      cellElement.textContent = cell.trim();
                      row.appendChild(cellElement);
                    });

                    table.appendChild(row);
                  });

                  container.appendChild(table);
                } else {
                  container.textContent = output;
                }
                break;

              default:
                container.textContent = output;
            }
          }

          async function executeTool() {
            const prompt = document.getElementById('prompt').value.trim();
            const input = document.getElementById('input').value.trim();
            const forceRegenerate = document.getElementById('forceRegenerate').checked;
            const button = document.getElementById('execute');
            const output = document.getElementById('output');
            const result = document.getElementById('result');
            const meta = document.getElementById('meta');
            const generatedCode = document.getElementById('generatedCode');
            const generatedCodeSection = document.getElementById('generatedCodeSection');

            if (!prompt) {
              alert('Please describe your tool');
              return;
            }

            // Update UI
            button.disabled = true;
            button.textContent = 'Executing...';
            output.classList.add('hidden');

            try {
              const response = await fetch('/api/tool', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ prompt, input, forceRegenerate })
              });

              const data = await response.json();

              if (!response.ok) {
                throw new Error(data.error || 'Request failed');
              }

              // Show results based on output type
              displayOutput(result, data.output, data.outputType);
              meta.textContent = \`\${data.outputType} • \${data.outputDescription} • \${data.packages.length} packages • \${data.cached ? 'cached' : 'compiled'} • \${data.toolHash}\`;

              // Show generated code if available
              if (data.generatedCode) {
                generatedCode.textContent = data.generatedCode;
                generatedCodeSection.classList.remove('hidden');
              } else {
                generatedCodeSection.classList.add('hidden');
              }

              output.classList.remove('hidden');

            } catch (error) {
              result.textContent = \`Error: \${error.message}\`;
              meta.textContent = 'error';
              generatedCodeSection.classList.add('hidden');
              output.classList.remove('hidden');
            } finally {
              button.disabled = false;
              button.textContent = '»';
            }
          }

          // Allow Enter to execute
          document.getElementById('input').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') executeTool();
          });

          // Load prompt from session storage (from history page)
          const loadPrompt = sessionStorage.getItem('loadPrompt');
          if (loadPrompt) {
            document.getElementById('prompt').value = loadPrompt;
            sessionStorage.removeItem('loadPrompt');
          }
        `}} />
      </div>
    </div>
  );
});

// Container ping for debugging
app.get("/ping-container", async (c) => {
  try {
    if (!c.env.BUN_COMPILER_DO) {
      return Response.json({ error: "BUN_COMPILER_DO not available" }, { status: 500 });
    }
    const container = c.env.BUN_COMPILER_DO.get(c.env.BUN_COMPILER_DO.idFromName('compiler'));
    const response = await container.fetch('http://container/ping');
    const result = await response.text();
    return new Response(result, {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error("Container ping error:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});

// Clear cache endpoint
app.delete("/api/cache/:hash?", async (c) => {
  try {
    const hash = c.req.param('hash');
    const cache = new ToolCache(c.env.TOOL_CACHE);

    if (hash) {
      // Clear specific tool
      await c.env.TOOL_CACHE.delete(`tools/${hash}.json`);
      console.log(`Cleared cache for hash: ${hash}`);
      return Response.json({ message: `Cache cleared for ${hash}` });
    } else {
      // Clear all cache
      const list = await c.env.TOOL_CACHE.list({ prefix: 'tools/' });
      for (const object of list.objects) {
        await c.env.TOOL_CACHE.delete(object.key);
      }
      console.log(`Cleared all cache (${list.objects.length} items)`);
      return Response.json({ message: `Cleared all cache (${list.objects.length} items)` });
    }
  } catch (error) {
    console.error("Cache clear error:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});

// List cache endpoint
app.get("/api/cache", async (c) => {
  try {
    const list = await c.env.TOOL_CACHE.list({ prefix: 'tools/' });
    const items = [];

    for (const object of list.objects.slice(0, 50)) { // Limit to 50 items
      try {
        const cached = await c.env.TOOL_CACHE.get(object.key);
        if (cached) {
          const data = await cached.json() as any;
          items.push({
            hash: data.hash?.substring(0, 8) || 'unknown',
            packages: data.packages || [],
            createdAt: data.createdAt,
            size: object.size
          });
        }
      } catch (e) {
        // Skip invalid cache entries
      }
    }

    return Response.json({
      total: list.objects.length,
      items: items.sort((a, b) => b.createdAt - a.createdAt)
    });
  } catch (error) {
    console.error("Cache list error:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});

// BunCompiler Durable Object with container
export class BunCompiler extends DurableObject<Cloudflare.Env> {
  container: globalThis.Container;

  constructor(ctx: DurableObjectState, env: Cloudflare.Env) {
    super(ctx, env);
    this.container = ctx.container!;
    void this.ctx.blockConcurrencyWhile(async () => {
      if (!this.container.running) {
        this.container.start();
      }
    });
  }

  async fetch(req: Request): Promise<Response> {
    try {
      return await this.container.getTcpPort(3000).fetch(req.url.replace('https:', 'http:'), req);
    } catch (err: any) {
      return new Response(`${this.ctx.id.toString()}: ${err.message}`, { status: 500 });
    }
  }
}

export default app;