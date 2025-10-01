# SnapTool: AI-Powered Dynamic Tool Generator

A sophisticated demo showcasing **Cloudflare Worker Loaders** combined with **AI code generation** and **advanced caching**. Generate custom tools from natural language prompts and execute them instantly with intelligent multi-layer caching.

## What This Demo Does

- **AI Code Generation**: Describe a tool in plain English, get working TypeScript code
- **Smart Caching**: Two-level cache (DO + R2) for sub-second repeat executions
- **Dynamic Compilation**: Automatic NPM package resolution and bundling
- **Isolated Execution**: Each tool runs in its own Worker isolate
- **Production Ready**: Scales to unlimited tools with cost-efficient storage

## Architecture: The Magic Behind the Speed

### **Two-Level Caching System**

```
User: "Make a UUID generator using the uuid package"
                    ↓
1. Hash Prompt → Check DO Cache → AI Generate → Cache in DO
                    ↓
2. Generated Code → Check R2 Cache → Compile NPM → Cache in R2
                    ↓
3. Execute Tool → Instant Response (cache hits = ~50ms total)
```

### **Performance Benefits**

| Scenario | First Time | Subsequent Times |
|----------|------------|------------------|
| **Code Generation** | 10-30 seconds | ~10ms (DO cache) |
| **NPM Compilation** | 1-5 seconds | ~50ms (R2 cache) |
| **Tool Execution** | Normal speed | **Instant** |

### **Cost Efficiency & Caching Strategy**

- **R2 Storage**: Pennies per GB for compiled tools vs expensive DO storage
- **Scalable**: Unlimited cached tools, each isolated by prompt hash
- **Smart Cleanup**: Purging history also cleans all related caches

**🔥 Why We Cache Everything**: This demo saves you OpenAI API calls and compilation time during development. Same prompt = instant response from cache.

**Production Caching Options:**
- **TTL-based**: Set 1-hour cache expiry for dynamic tools
- **Version-based**: Cache by `prompt + version` for controlled updates
- **Usage-based**: LRU eviction for frequently-used tools only
- **Manual**: API endpoints to invalidate specific cached tools
- **Hybrid**: Cache popular tools forever, TTL for experimental ones

## Live Demo Flow

1. **Enter Prompt**: "Create a password generator with special characters"
2. **AI Generation**: GPT generates complete Worker code with npm imports
3. **Auto Compilation**: System resolves `npm` packages and bundles dependencies
4. **Instant Execution**: Tool runs in isolated Worker, returns result
5. **Smart Caching**: Repeat requests execute in ~50ms total

## Meta-Tool System: Tools That Generate Tools

SnapTool becomes a **dynamic tool gateway** for AI agents - tools can generate and call other tools recursively.

### **Function Calling Integration**
```javascript
// OpenAI Function Call
{
  "name": "generate_and_execute_tool",
  "description": "Generate and execute a custom tool from natural language",
  "parameters": {
    "toolDescription": "Generate a QR code for URLs",
    "input": "https://example.com"
  }
}

// Returns: { "result": "data:image/png;base64,iVBOR..." }
```

### **Recursive Tool Generation**
```javascript
// A tool that generates other tools
export default {
  async fetch(req, env, ctx) {
    const uuid = await callTool("Generate UUID using uuid package", "");
    const qrCode = await callTool("Create QR code PNG", uuid.result);

    return Response.json({
      uuid: uuid.result,
      qrCode: qrCode.result
    });
  }
}

async function callTool(description, input) {
  const response = await fetch(`${env.SNAPTOOL_URL}/api/generate-and-execute`, {
    method: 'POST',
    body: JSON.stringify({ prompt: description, input })
  });
  return response.json();
}
```

### **Tool Discovery & Registry**
```bash
# Search for existing tools
GET /api/tools/search?q=uuid

# Execute cached tool instantly
POST /api/tools/execute
{ "prompt": "Generate UUID using uuid package", "input": "" }
```

## Key Technical Innovations

### **1. Prompt-Based Cache Keys**
- Same prompt = same cache, even if AI generates slightly different code
- Ensures consistent behavior across generations

### **2. Cloudflare Container Compilation**
```typescript
// Real Bun compilation via dedicated container service
const response = await env.BUN_COMPILER.fetch('/compile', {
  method: "POST",
  body: JSON.stringify({ code })
});

const result = await response.json();
// Returns fully bundled, tree-shaken, optimized ES6 code
```

### **3. Container Architecture**
- **Compilation Container**: Isolated Linux environment with Bun, filesystem access, and NPM
- **Worker Execution**: Compiled tools run in fast Workers with Worker Loaders
- **Service Bindings**: Zero-latency communication between Workers and containers

### **4. Namespace Architecture**
- **History DO**: `"history"` - Singleton for prompt list
- **Generated Code DOs**: `"generated:{hash}"` - Per-prompt caching
- **R2 Cache**: `tools/{hash}/compiled.json` - Compiled artifacts

## API Endpoints

### **Core Tool Generation**
- `POST /api/generate-code` - Generate tool code from prompt
- `POST /api/execute-tool` - Execute generated tool with input

### **Meta-Tool Gateway** 🔥
- `POST /api/generate-and-execute` - One-shot: generate + execute tool
- `POST /api/tools/execute` - Execute cached tool by prompt
- `GET /api/tools/search?q=query` - Search cached tools

### **Usage Examples**
```bash
# Generate and execute in one call
curl -X POST http://localhost:8787/api/generate-and-execute \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Generate a UUID using the uuid package",
    "input": ""
  }'

# Search for existing tools
curl "http://localhost:8787/api/tools/search?q=uuid"

# Execute cached tool instantly
curl -X POST http://localhost:8787/api/tools/execute \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Generate a UUID using the uuid package",
    "input": ""
  }'
```

## Quick Start

```bash
# Install dependencies
bun install

# Start development server
bun dev

# Visit http://localhost:8787
```

## Example Prompts to Try

- "Make a UUID generator using the uuid package"
- "Create a QR code generator that outputs PNG images"
- "Build a JWT token decoder that validates claims"
- "Make a password strength meter using zxcvbn"
- "Create a markdown to HTML converter using marked"

## Real-World Use Cases

### **1. AI Assistant with Infinite Tools**
```javascript
// ChatGPT/Claude with SnapTool integration
const tools = [{
  name: "generate_and_execute_tool",
  description: "Create and run any tool from description",
  function: async ({ toolDescription, input }) => {
    const response = await fetch(`${SNAPTOOL_URL}/api/generate-and-execute`, {
      method: 'POST',
      body: JSON.stringify({ prompt: toolDescription, input })
    });
    return response.json();
  }
}];

// User: "Convert this CSV to JSON then validate the email addresses"
// AI: Uses generate_and_execute_tool twice, chains results
```

### **2. Workflow Automation Platform**
```javascript
// Zapier-style automation with generated steps
const workflow = [
  { tool: "Parse CSV file", input: csvData },
  { tool: "Validate email addresses using validator.js", input: "{{step1.emails}}" },
  { tool: "Send welcome email via SendGrid", input: "{{step2.validEmails}}" }
];

for (const step of workflow) {
  const result = await generateAndExecute(step.tool, step.input);
  // Chain to next step...
}
```

### **3. Microservice Generator**
```javascript
// Generate entire service endpoints on demand
const endpoints = {
  "/auth": "JWT token validator with secret verification",
  "/payments": "Stripe payment processor with webhook handling",
  "/notifications": "Email sender with template support using SendGrid",
  "/analytics": "Event tracker that stores data in PostgreSQL"
};

// Each endpoint becomes a cached, callable tool
for (const [path, description] of Object.entries(endpoints)) {
  await generateAndCache(description);
  router.post(path, (req) => executeCachedTool(description, req.body));
}
```

### **4. Self-Improving AI Agent**
```javascript
// Agent that creates better tools over time
class SelfImprovingAgent {
  async solveTask(task) {
    // Try existing tools first
    const existingTool = await searchTools(task);
    if (existingTool) return await executeTool(existingTool, task);

    // Generate new tool
    const newTool = await generateAndExecute(
      `Create optimized tool for: ${task}`,
      task
    );

    // Learn from results and cache for future use
    return newTool;
  }
}
```

### **5. Dynamic API Gateway**
```javascript
// API that grows functionality on demand
app.post('/tools/:operation', async (req, res) => {
  const { operation } = req.params;
  const { input } = req.body;

  // Check cache first
  let tool = await getCachedTool(operation);

  if (!tool) {
    // Generate tool on first request
    tool = await generateAndExecute(
      `Create tool for operation: ${operation}`,
      input
    );
  }

  const result = await executeTool(tool, input);
  res.json(result);
});

// POST /tools/image-resize → Generates image resizing tool
// POST /tools/pdf-merge → Generates PDF merging tool
// POST /tools/crypto-hash → Generates hashing tool
```

## Production Deployment

### **Requirements**
- **Worker Loaders**: Currently in closed beta ([apply here](https://developers.cloudflare.com/workers/runtime-apis/bindings/worker-loaders/))
- **Cloudflare Containers**: For Bun compilation service ([docs](https://developers.cloudflare.com/containers/))
- **R2 Bucket**: For compiled tool storage
- **OpenAI API Key**: For code generation

### **Deployment Steps**
```bash
# 1. Deploy the Bun compiler container
./deploy-container.sh

# 2. Deploy the main worker
wrangler deploy

# 3. Remove localhost flag from production
# Edit wrangler.jsonc: remove "BUN_COMPILER_LOCALHOST": true
```

### **Container Setup**
The `container/` directory contains a complete Bun compilation service:
- **Dockerfile**: Alpine Linux + Bun + compilation logic
- **compile-service.js**: HTTP service that handles NPM resolution and bundling
- **deploy.toml**: Container deployment configuration

### **Without Beta Access**
The demo works fully in local development. For production without Worker Loaders/Containers beta access, you'll need to remove the `worker_loaders` binding and deploy a UI-only version.

## Configuration

### **Environment Variables**
```bash
OPENAI_API_KEY=your_openai_key_here
AUTH_SECRET=your_secret_key_here  # Optional: For production auth
```

## Security: Pragmatic Protection

**For Production**: Add simple auth to prevent abuse while keeping the pattern clean.

### **Option 1: API Key Auth (Recommended)**
```typescript
// Add to worker.tsx before tool endpoints
const authMiddleware = async (c, next) => {
  const apiKey = c.req.header('Authorization')?.replace('Bearer ', '');
  if (!apiKey || apiKey !== c.env.AUTH_SECRET) {
    return c.json({ error: 'Unauthorized' }, 401);
  }
  await next();
};

// Protect expensive endpoints
app.post("/api/generate-and-execute", authMiddleware, async (c) => {
  // ... existing code
});
```

### **Option 2: Rate Limiting**
```typescript
// Simple per-IP rate limiting using Durable Objects
const rateLimiter = async (c, next) => {
  const ip = c.req.header('CF-Connecting-IP') || 'unknown';
  const limiter = c.env.RATE_LIMITER.getByName(ip);

  const allowed = await limiter.fetch('/check');
  if (!allowed.ok) {
    return c.json({ error: 'Rate limit exceeded' }, 429);
  }
  await next();
};
```

### **Option 3: Cloudflare Access**
```bash
# Zero-code solution: Use Cloudflare Access
# Protect entire domain or specific paths
# Perfect for internal company tools
```

**Never expose in production without auth** - AI code generation can be expensive and dangerous if abused.

### **Wrangler Config** (`wrangler.jsonc`)
```json
{
  "compatibility_flags": ["nodejs_compat"],
  "worker_loaders": [{"binding": "LOADER"}],
  "r2_buckets": [{"binding": "TOOL_CACHE", "bucket_name": "snaptool-tools"}],
  "durable_objects": {
    "bindings": [{"name": "PROMPTS", "class_name": "PromptLog"}]
  }
}
```

## File Structure

```
src/
├── worker.tsx              # Main Hono app + AI generation
├── do.tsx                  # Durable Object for history + generated code
└── utils/
    ├── hash.ts             # Prompt hashing for cache keys
    ├── r2-cache.ts         # R2 compiled artifact management
    └── compiler.ts         # Bun + manual NPM compilation
```

## Tech Stack

- **Runtime**: Cloudflare Workers with nodejs_compat
- **Framework**: Hono with JSX rendering
- **AI**: OpenAI GPT for code generation
- **Caching**: Durable Objects + R2 Storage
- **Compilation**: Bun via Cloudflare Containers
- **Package Manager**: Bun

## Advanced Features

### **NPM Package Support**
- Automatic package discovery via npm registry search
- Tarball extraction and dependency resolution
- CommonJS → ES6 module conversion
- Recursive internal dependency processing

### **Cache Management**
- Intelligent cache invalidation
- Prompt history with full cleanup
- Per-tool isolation with shared infrastructure
- Cost-optimized storage strategy

### **Error Handling**
- Graceful compilation fallbacks
- Detailed error reporting
- Cache corruption recovery
- Network request retry logic

## Performance Characteristics

- **Cold Start**: 15-35 seconds (AI + compilation)
- **Warm Start**: ~60ms (cached everything)
- **Memory**: ~10MB per compiled tool in R2
- **Concurrency**: Unlimited parallel tool execution
- **Scale**: Tested with 100+ unique tools

## License

MIT - Feel free to use this as a foundation for your own AI-powered development tools!

---

*This demo showcases the powerful combination of AI code generation, Worker Loaders, and intelligent caching to create a new paradigm for dynamic tool creation.*