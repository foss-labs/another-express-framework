# Another Express Framework

Another Express Framework is a lightweight, decorator-based Express.js framework inspired by NestJS. It provides a structured way to build scalable and maintainable server-side applications with TypeScript.

This framework is designed to be easily integrated into your project by copying the source code directly.

## Features

- Decorator-based routing and dependency injection
- Module-based architecture
- Built-in support for middleware, guards, pipes, and interceptors
- Exception filters for centralized error handling
- Configurable scopes for services (Singleton, Transient, Request)
- Easy integration with Express.js ecosystem

## Installation

1. Copy the [framework source code](https://github.com/foss-labs/another-express-framework/blob/main/src/framework/index.ts) to your project repository.
2. Place the copied file in your project, for example, as `./src/framework/index.ts`.
3. Import the necessary decorators and classes from this file in your application code.

## Quick Start

1. Create a new TypeScript project and install the necessary dependencies:

```bash
npm init -y
npm install express @types/express typescript inversify qs reflect-metadata zod
```

2. Copy the framework source code as described in the Installation section.

3. Create a simple controller:

```typescript
import { Controller, Get, Post, Body } from "./src/framework";

@Controller("/users")
export class UserController {
  @Get()
  getUsers() {
    return [{ id: 1, name: "John Doe" }];
  }

  @Post()
  createUser(@Body() user: any) {
    // Create user logic
    return user;
  }
}
```

4. Create a module to group related components:

```typescript
import { Module } from "./src/framework";
import { UserController } from "./user.controller";

@Module({
  controllers: [UserController],
})
export class AppModule {}
```

5. Set up the main application:

```typescript
import { MiniFramework } from "./src/framework";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = new MiniFramework();
  await app.registerModule(AppModule);
  app.listen(3000, () => console.log("Server running on port 3000"));
}

bootstrap();
```

## Key Concepts

### Modules

Modules are used to organize the application structure. They encapsulate controllers, providers, and can import other modules.

### Controllers

Controllers are responsible for handling incoming requests and returning responses to the client.

### Providers

Providers are injectable classes (services, repositories, etc.) that can be injected into controllers or other providers.

### Middleware

Middleware functions can be used to modify the request or response objects, end the request-response cycle, or call the next middleware function.

### Guards

Guards determine whether a request should be handled by the route handler or not, typically used for authentication and authorization.

### Pipes

Pipes transform input data to the desired format or validate it before it reaches the route handler.

### Interceptors

Interceptors can modify the response from route handlers before it's sent to the client.

### Exception Filters

Exception filters handle exceptions thrown from your application code and send appropriate error responses to the client.

## Advanced Usage

For more advanced usage and detailed API documentation, please refer to the [framework source code](https://github.com/foss-labs/another-express-framework/blob/main/src/framework/index.ts). The source code contains extensive comments and type definitions that can help you understand and use the framework's features.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request to the [original repository](https://github.com/foss-labs/another-express-framework).

## License

This project is licensed under the MIT License.
