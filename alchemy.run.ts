import alchemy from "alchemy";
import { CloudflareStateStore } from "alchemy/state";
import {
  Worker,
  DurableObjectNamespace,
  R2Bucket,
  WorkerLoader,
  Container
} from "alchemy/cloudflare";

import type { PromptLog, BunCompiler } from "./src/worker.tsx";

const projectName = "anytool";

console.time(`alchemy.run (${projectName})`);

const prod = process.env.NODE_ENV === 'production' || process.env.CI;
const password = process.env.ALCHEMY_PASSWORD || projectName;

// Environment variables
const env = {
  OPENAI_API_KEY: process.env.OPENAI_API_KEY || (() => {
    throw new Error('OPENAI_API_KEY environment variable is required');
  })(),
  BUN_COMPILER_LOCALHOST: true,
} as const;

const project = await alchemy(projectName, prod ? {
  password,
  stateStore: (scope: any) => new CloudflareStateStore(scope, {
    scriptName: `${projectName}-ci-state`,
  })
} : {
  password
});

// Durable Object Namespaces
const PROMPTS = DurableObjectNamespace<PromptLog>(
  `${projectName}-prompts`, {
  className: "PromptLog",
  scriptName: `${projectName}-worker`,
  sqlite: false,
});

// R2 Bucket for tool cache
const TOOL_CACHE = await R2Bucket(
  `${projectName}-tools`, {
  name: `anytool-tools`,
  adopt: true,
});

// Worker Loader
const LOADER = WorkerLoader(`${projectName}-loader`, {
  binding: "LOADER"
});

// Container for Bun compilation
const BUN_COMPILER = await Container<BunCompiler>("bun-compiler", {
  className: "BunCompiler",
});

// Main Worker
export const worker = await Worker(
  `${projectName}-worker`, {
  name: projectName,
  entrypoint: "./src/worker.tsx",
  adopt: true,
  url: true,
  compatibilityDate: "2025-10-01",
  compatibilityFlags: ["nodejs_compat"],
  env,
  bindings: {
    PROMPTS,
    TOOL_CACHE,
    LOADER,
    BUN_COMPILER_LOCALHOST: env.BUN_COMPILER_LOCALHOST,
    BUN_COMPILER,
  }
});

console.info("WORKER:", worker.url);

await project.finalize();

console.timeEnd(`alchemy.run (${projectName})`);