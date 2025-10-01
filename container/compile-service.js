import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';

const server = Bun.serve({
  port: 3000,
  async fetch(req) {
    if (req.method !== 'POST' || new URL(req.url).pathname !== '/compile') {
      return new Response('Not Found', { status: 404 });
    }

    try {
      const { code } = await req.json();
      const result = await compileCode(code);

      return new Response(JSON.stringify(result), {
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }
});

async function compileCode(code) {
  const npmImports = code.match(/from\s+['"`]([^'"`\s]+)['"`]/g) || [];
  const packages = [];

  for (const importMatch of npmImports) {
    const packageName = importMatch.match(/from\s+['"`]([^'"`\s]+)['"`]/)[1];
    if (!packageName.startsWith('http') && !packageName.startsWith('./') && !packageName.startsWith('../')) {
      packages.push(packageName);
    }
  }

  if (packages.length === 0) {
    return {
      mainCode: code,
      additionalModules: {},
      packages: []
    };
  }

  const workspaceDir = `/tmp/worker-${Date.now()}`;
  await fs.mkdir(workspaceDir, { recursive: true });

  try {
    // Create package.json
    const packageJson = {
      name: "dynamic-worker",
      type: "module",
      dependencies: Object.fromEntries(packages.map(pkg => [pkg, "latest"]))
    };
    await fs.writeFile(path.join(workspaceDir, 'package.json'), JSON.stringify(packageJson, null, 2));

    // Write the worker code
    await fs.writeFile(path.join(workspaceDir, 'worker.js'), code);

    // Install dependencies with bun
    await runCommand('bun', ['install'], workspaceDir);

    // Bundle with bun
    const bundleResult = await runCommand('bun', ['build', 'worker.js', '--target=browser', '--format=esm'], workspaceDir, true);

    return {
      mainCode: bundleResult.stdout,
      additionalModules: {},
      packages
    };
  } finally {
    // Cleanup
    await fs.rm(workspaceDir, { recursive: true, force: true });
  }
}

function runCommand(command, args, cwd, captureOutput = false) {
  return new Promise((resolve, reject) => {
    const process = spawn(command, args, {
      cwd,
      stdio: captureOutput ? 'pipe' : 'inherit'
    });

    let stdout = '';
    let stderr = '';

    if (captureOutput) {
      process.stdout.on('data', (data) => {
        stdout += data.toString();
      });
      process.stderr.on('data', (data) => {
        stderr += data.toString();
      });
    }

    process.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        reject(new Error(`${command} failed with code ${code}: ${stderr}`));
      }
    });
  });
}

console.log('Bun compilation service listening on port 3000');