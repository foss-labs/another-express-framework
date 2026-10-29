import { afterAll, describe, expect, it } from "bun:test";
import { Body, Controller, Injectable, Module, Post, UsePipes } from "../src/framework/index";

const calls: string[] = [];

@Controller("/test")
@Injectable()
class TestController {
  @Post("/")
  @UsePipes((value) => {
    calls.push("pipe");
    return { ...(value as Record<string, unknown>), transformed: true };
  })
  create(@Body() body: { transformed?: boolean }) {
    calls.push(`handler:${String(body.transformed)}`);
    return body;
  }
}

@Module({ controllers: [TestController] })
class TestModule {}

const frameworkModule = await import("../src/framework/index");
const app = new frameworkModule.MiniFramework() as any;
await app.registerModule(TestModule);
const server = app.listen(0);
const address = server.address();

if (!address || typeof address === "string") {
  throw new Error("Expected server to listen on an ephemeral port");
}

const baseUrl = `http://127.0.0.1:${address.port}`;

afterAll(() => {
  server.close();
});

describe("UsePipes", () => {
  it("runs pipes before the route handler receives arguments", async () => {
    calls.length = 0;

    const response = await fetch(`${baseUrl}/test/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ original: true }),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ original: true, transformed: true });
    expect(calls).toEqual(["pipe", "handler:true"]);
  });
});
