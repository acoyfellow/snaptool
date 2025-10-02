declare module "cloudflare:workers" {
  namespace Cloudflare {
    interface Env {
      PROMPTS: DurableObjectNamespace;
      LOADER: WorkerEntrypoint;
      TOOL_CACHE: R2Bucket;
      OPENAI_API_KEY: string;
    }
  }
}