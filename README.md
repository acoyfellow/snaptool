# Anytool: Infinite Tools Without the Context Bloat

**One Tool To Rule Them All** - Transform any natural language description into a working, cached, executable tool that returns the perfect content type.

## 🎯 The Context Bloat Problem

| **Traditional Approach** | **Anytool Approach** |
|-------------------------|----------------------|
| 50+ tools = massive context | **One tool** = minimal context |
| Each tool needs description | AI describes what it needs |
| Context window bloat | "Create a QR code generator" |
| Fixed functionality | **Infinite tools from one tool** |

## ⚡ How It Works

```
"Create a QR code generator" → AI generates Worker → Bun compiles → 
Tool executes → Returns SVG → UI renders inline → Cached for ~50ms next time
```

## 🎨 Dynamic Content Types

Anytool automatically handles 7 output types:

| Type | Example | Renders As |
|------|---------|------------|
| **image** | QR code PNG | `<img>` tag |
| **svg** | QR code SVG | Inline SVG |
| **json** | Password analysis | Formatted JSON |
| **html** | Markdown conversion | Rendered HTML |
| **csv** | Data export | HTML table |
| **xml** | API response | Formatted XML |
| **text** | Simple output | Pre-formatted |

## 🚀 Live Examples

```bash
# QR Code Generator
curl -X POST /api/tool -d '{"prompt": "Create QR code generator", "input": "https://example.com"}'
# Returns: <svg>...</svg> (rendered inline)

# Password Checker  
curl -X POST /api/tool -d '{"prompt": "Password strength checker", "input": "MyPass123"}'
# Returns: {"score": 2, "feedback": "Add special characters"}

# CSV Parser
curl -X POST /api/tool -d '{"prompt": "CSV to HTML table", "input": "Name,Age\nJohn,25"}'
# Returns: <table><tr><th>Name</th>...</table>
```

## 🏗️ Architecture

### **Pipeline**
```
Prompt → AI Generation → Bun Compilation → Worker Execution → Smart Rendering → Cache
```

### **Performance**
| First Time | Cached |
|------------|--------|
| 15-35 seconds | **~50ms** |

### **Tech Stack**
- **Runtime**: Cloudflare Workers + Worker Loaders
- **AI**: OpenAI GPT-4 for code generation  
- **Compilation**: Bun via Cloudflare Containers
- **Caching**: R2 Storage (pennies per GB)
- **UI**: Hono + JSX with smart content type rendering

## 🔌 Production Integration

### **Option 1: MCP Server (Recommended)**
```typescript
// Replace 50+ tools with this ONE tool
export const tools = [{
  name: "anytool_generate",
  description: "Generate any tool from natural language - no context bloat",
  inputSchema: {
    type: "object",
    properties: {
      prompt: { type: "string" },
      input: { type: "string" }
    }
  }
}];
```

### **Option 2: OpenAI Function Calling**
```javascript
// Instead of 50+ function definitions, just one:
const functions = [{
  name: 'anytool_generate',
  description: 'Generate any tool from natural language - infinite tools, zero context bloat',
  parameters: {
    type: 'object',
    properties: {
      description: { type: 'string' },
      input: { type: 'string' }
    }
  }
}];
```

### **Option 3: Simple HTTP Client**
```javascript
async function anytool(description, input = "") {
  const response = await fetch('/api/tool', {
    method: 'POST',
    body: JSON.stringify({ prompt: description, input })
  });
  return response.json();
}

// Usage
const qrCode = await anytool("QR code generator", "https://example.com");
```

## 🛠️ Key Features

### **Smart Content Type Detection**
AI automatically determines output type and sets proper headers:
```typescript
// AI chooses: 'svg' → Content-Type: 'image/svg+xml'
return new Response(svgString, {
  headers: { 'Content-Type': 'image/svg+xml' }
});
```

### **Auto UI Rendering**
Frontend handles all 7 content types automatically:
- **image** → `<img>` tags
- **csv** → HTML tables  
- **json** → Formatted JSON
- **svg** → Inline SVG

### **Worker Loaders**
Each tool runs in isolated Worker with zero-latency execution.

### **Bun Compilation**
Real NPM package resolution and bundling via Cloudflare Containers.

## 📡 API

### **Main Endpoint**
```bash
POST /api/tool
{
  "prompt": "Create a QR code generator that returns SVG",
  "input": "https://example.com"
}
```

**Response:**
```json
{
  "output": "<svg>...</svg>",
  "outputType": "svg",
  "cached": true,
  "packages": ["qr-code-generator"]
}
```

### **Cache Management**
```bash
GET /api/cache          # List cached tools
DELETE /api/cache       # Clear all cache
DELETE /api/cache/hash  # Clear specific tool
```

## 🚀 Quick Start

```bash
bun install
bun dev
# Visit http://localhost:8787
```

## 💡 Example Prompts

- "Create a UUID generator using the uuid package"
- "Build a QR code generator that returns SVG"  
- "Create a password strength meter using zxcvbn"
- "Make a CSV parser that returns HTML tables"
- "Build a markdown to HTML converter using marked"

## 🏭 Production Deployment

### **Requirements**
- **Worker Loaders**: Cloudflare beta feature
- **Cloudflare Containers**: For Bun compilation
- **R2 Bucket**: For tool caching
- **OpenAI API Key**: For code generation

### **Deploy Steps**
```bash
# 1. Deploy Bun compiler container
./deploy-container.sh

# 2. Deploy main worker
wrangler deploy

# 3. Remove localhost flag for production
# Edit wrangler.jsonc: remove "BUN_COMPILER_LOCALHOST": true
```

### **Environment Variables**
```bash
OPENAI_API_KEY=your_openai_key_here
AUTH_SECRET=your_secret_key_here  # Optional: For production auth
```

## 🔒 Security

**Never expose in production without auth** - AI code generation can be expensive.

### **Simple API Key Auth**
```typescript
const authMiddleware = async (c, next) => {
  const apiKey = c.req.header('Authorization')?.replace('Bearer ', '');
  if (!apiKey || apiKey !== c.env.AUTH_SECRET) {
    return c.json({ error: 'Unauthorized' }, 401);
  }
  await next();
};
```

## 📁 File Structure

```
src/
├── worker.tsx              # Main Hono app + AI generation
├── do.tsx                  # Durable Object for history
└── utils/
    ├── hash.ts             # Prompt hashing
    ├── r2-cache.ts         # R2 cache management
    └── compiler.ts         # Bun compilation
```

## 📊 Performance

- **Cold Start**: 15-35 seconds (AI + compilation)
- **Warm Start**: **~50ms** (cached)
- **Memory**: ~10MB per tool in R2
- **Scale**: Tested with 100+ unique tools

---

**MIT License** - Use this as a foundation for your own AI-powered development tools!