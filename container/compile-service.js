import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';

console.log('Starting Bun compilation service...');
console.log('Bun version:', Bun.version);
console.log('Platform:', process.platform);
console.log('Working directory:', process.cwd());
console.log('Environment:', process.env.NODE_ENV);

try {
  console.log('Attempting to start server on 0.0.0.0:3000...');

  const server = Bun.serve({
    port: 3000,
    hostname: '0.0.0.0',
    development: false,
    async fetch(req) {
    const url = new URL(req.url);

    // Health check endpoints
    if (req.method === 'GET' && (url.pathname === '/ping' || url.pathname === '/health')) {
      return new Response(JSON.stringify({
        message: 'Hello from Bun container!',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        status: 'healthy'
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (req.method !== 'POST' || url.pathname !== '/compile') {
      return new Response('Not Found', { status: 404 });
    }

    try {
      console.log("Received compile request");
      const body = await req.text();
      console.log("Request body:", body);

      let parsed;
      try {
        parsed = JSON.parse(body);
      } catch (parseError) {
        console.error("JSON parse error:", parseError);
        return new Response(JSON.stringify({ error: "Invalid JSON in request body" }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      const { code } = parsed;
      if (!code) {
        console.error("No code provided in request");
        return new Response(JSON.stringify({ error: "No code provided" }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      console.log("Starting compilation for code length:", code.length);
      const result = await compileCode(code);
      console.log("Compilation successful");

      return new Response(JSON.stringify(result), {
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (error) {
      console.error("Compilation error:", error);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }
  });

  async function compileCode(code) {
    console.log("Starting compileCode function");

    const npmImports = code.match(/from\s+['"`]([^'"`\s]+)['"`]/g) || [];
    const packages = [];

    for (const importMatch of npmImports) {
      const packageName = importMatch.match(/from\s+['"`]([^'"`\s]+)['"`]/)[1];
      if (!packageName.startsWith('http') && !packageName.startsWith('./') && !packageName.startsWith('../')) {
        packages.push(packageName);
      }
    }

    console.log("Detected packages:", packages);

    if (packages.length === 0) {
      console.log("No packages needed, returning code as-is");
      return {
        mainCode: code,
        additionalModules: {},
        packages: []
      };
    }

    const workspaceDir = `/tmp/worker-${Date.now()}`;
    console.log("Creating workspace:", workspaceDir);
    await fs.mkdir(workspaceDir, { recursive: true });

    try {
      // Create package.json
      const packageJson = {
        name: "dynamic-worker",
        type: "module",
        dependencies: Object.fromEntries(packages.map(pkg => [pkg, "latest"]))
      };
      console.log("Creating package.json:", packageJson);
      await fs.writeFile(path.join(workspaceDir, 'package.json'), JSON.stringify(packageJson, null, 2));

      // Write the worker code
      console.log("Writing worker code to file");
      await fs.writeFile(path.join(workspaceDir, 'worker.js'), code);

      // Try to install dependencies with bun (may fail due to network restrictions)
      console.log("Running bun install...");
      try {
        await runCommand('bun', ['install'], workspaceDir);
        console.log("bun install completed");

        // Bundle with bun if install succeeded
        console.log("Running bun build...");
        const bundleResult = await runCommand('bun', ['build', 'worker.js', '--target=browser', '--format=esm'], workspaceDir, true);
        console.log("bun build completed, output length:", bundleResult.stdout.length);

        return {
          mainCode: bundleResult.stdout,
          additionalModules: {},
          packages
        };
      } catch (installError) {
        console.error("Package installation failed:", installError.message);
        throw installError;
      }
    } catch (error) {
      console.error("Error in compileCode:", error);
      throw error;
    } finally {
      // Cleanup
      console.log("Cleaning up workspace");
      await fs.rm(workspaceDir, { recursive: true, force: true });
    }
  }


function runCommand(command, args, cwd, captureOutput = false) {
  return new Promise((resolve, reject) => {
    console.log(`Running command: ${command} ${args.join(' ')} in ${cwd}`);

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
      console.log(`Command ${command} finished with code ${code}`);
      if (captureOutput) {
        console.log("stdout:", stdout.substring(0, 500));
        console.log("stderr:", stderr.substring(0, 500));
      }

      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        console.error(`Command failed: ${command} ${args.join(' ')}`);
        console.error(`Exit code: ${code}`);
        console.error(`stderr: ${stderr}`);
        reject(new Error(`${command} failed with code ${code}: ${stderr}`));
      }
    });

    process.on('error', (error) => {
      console.error(`Process error: ${error}`);
      reject(error);
    });
  });
  }

  console.log('Server object:', server);
  console.log('Bun compilation service listening on 0.0.0.0:3000');
  console.log('Server started successfully!');

  // Keep the process alive
  setInterval(() => {
    console.log('Server is alive:', new Date().toISOString());
  }, 30000);

} catch (error) {
  console.error('Failed to start server:', error);
  console.error('Error stack:', error.stack);
  process.exit(1);
}