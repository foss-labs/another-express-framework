import { describe, expect, test } from "bun:test";
import { z } from "zod";
import { ConfigService, createConfigService } from "./index";

const schema = z.object({
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string().url(),
  DEBUG: z.enum(["true", "false"]).transform((v) => v === "true").optional(),
});

describe("ConfigService", () => {
  test("default ConfigService reads process.env", () => {
    process.env.__CONFIG_TEST_KEY = "value";
    const config = new ConfigService();
    const value: string | undefined = config.get("__CONFIG_TEST_KEY");
    expect(value).toBe("value");
    delete process.env.__CONFIG_TEST_KEY;
  });

  test("createConfigService validates and infers typed values", () => {
    const config = createConfigService(schema, {
      PORT: "8080",
      DATABASE_URL: "postgres://localhost/db",
      DEBUG: "true",
    });

    const port: number = config.get("PORT");
    const url: string = config.get("DATABASE_URL");
    const debug: boolean | undefined = config.get("DEBUG");

    expect(port).toBe(8080);
    expect(url).toBe("postgres://localhost/db");
    expect(debug).toBe(true);

    // @ts-expect-error unknown keys are rejected at compile time
    config.get("NOT_A_KEY");

    // @ts-expect-error PORT is a number, not a string
    const wrong: string = config.get("PORT");
    void wrong;
  });

  test("createConfigService applies schema defaults", () => {
    const config = createConfigService(schema, { DATABASE_URL: "postgres://localhost/db" });
    expect(config.get("PORT")).toBe(3000);
  });

  test("createConfigService throws on invalid configuration", () => {
    expect(() => createConfigService(schema, { DATABASE_URL: "not-a-url" })).toThrow(/DATABASE_URL/);
  });

  test("getOrThrow returns non-nullable values and throws when missing", () => {
    const config = createConfigService(schema, { DATABASE_URL: "postgres://localhost/db" });
    expect(() => config.getOrThrow("DEBUG")).toThrow(/DEBUG/);
    const url: string = config.getOrThrow("DATABASE_URL");
    expect(url).toBe("postgres://localhost/db");
  });
});
