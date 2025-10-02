export class PromptLog {
  state: DurableObjectState;
  storage: DurableObjectStorage;

  constructor(state: DurableObjectState, _env: any) {
    this.state = state;
    this.storage = state.storage;
  }

  async write(prompt: string) {
    const now = Date.now();
    await this.storage.put(now.toString(), prompt);
    const keys = (await this.storage.list({ reverse: true })).keys();
    let count = 0;
    for await (const key of keys) {
      count++;
      if (count > 20) await this.storage.delete(key);
    }
  }

  async list(): Promise<string[]> {
    const items = await this.storage.list<string>({ reverse: true, limit: 20 });
    return [...items.values()];
  }

  async clear() {
    await this.storage.deleteAll();
  }

  async fetch(req: Request) {
    const url = new URL(req.url);

    // Original prompt logging functionality
    if (req.method === "POST" && url.pathname === "/write") {
      const body = await req.text();
      await this.write(body);
      return new Response("ok");
    }
    if (req.method === "DELETE" && url.pathname === "/clear") {
      await this.clear();
      return new Response("cleared");
    }
    if (url.pathname === "/list") {
      const lines = await this.list();
      return new Response(JSON.stringify(lines), { headers: { "content-type": "application/json" }});
    }

    // Generated code caching functionality
    if (req.method === "POST" && url.pathname === "/cache-generated") {
      const body = await req.text();
      await this.storage.put("generated", body);
      return new Response("cached");
    }
    if (url.pathname === "/get-generated") {
      const cached = await this.storage.get("generated");
      if (cached) {
        return new Response(cached, { headers: { "content-type": "application/json" }});
      }
      return new Response("not found", { status: 404 });
    }

    return new Response("not found", { status: 404 });
  }
}