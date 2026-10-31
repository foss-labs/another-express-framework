import { test, expect, describe } from "bun:test";
import { Controller, Get, Inject, Injectable, Module, MiniFramework } from "./index";

async function request(app: MiniFramework, path: string) {
  const server = app["app"].listen(0);
  try {
    const { port } = server.address() as { port: number };
    const res = await fetch(`http://localhost:${port}${path}`);
    return { status: res.status, body: await res.text() };
  } finally {
    server.close();
  }
}

describe("provider registration", () => {
  test("object providers registered by multiple modules are bound once", async () => {
    @Injectable()
    class Greeter {
      greet() {
        return "hello";
      }
    }

    const sharedProviders = [
      { provide: "GREETING", useValue: "hi" },
      { provide: "GREETER", useClass: Greeter },
    ];

    @Module({ providers: sharedProviders })
    class FirstModule {}

    @Module({ providers: sharedProviders })
    class SecondModule {}

    @Controller("/greet")
    @Injectable()
    class GreetController {
      constructor(@Inject("GREETING") private greeting: string, @Inject("GREETER") private greeter: Greeter) {}

      @Get("/")
      get() {
        return `${this.greeting} ${this.greeter.greet()}`;
      }
    }

    @Module({ imports: [FirstModule, SecondModule], controllers: [GreetController] })
    class AppModule {}

    const app = new MiniFramework();
    await app.registerModule(AppModule);

    expect(await request(app, "/greet")).toEqual({ status: 200, body: "hi hello" });
  });
});
