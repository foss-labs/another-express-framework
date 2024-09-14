import { z } from "zod";
import express from "express";
import {
  Injectable,
  Inject,
  ConfigService,
  Body,
  Controller,
  Delete,
  Get,
  HttpException,
  Param,
  Post,
  Put,
  UseFilters,
  UseGuards,
  UsePipes,
  type ExceptionFilter,
  type CanActivate,
  createDecorator,
  Module,
  MiniFramework,
} from "./framework";

// User service with basic CRUD methods
@Injectable()
class UserService {
  constructor(@Inject(ConfigService) private configService: ConfigService) {}

  getUsers() {
    return [
      { id: 1, name: "John Doe" },
      { id: 2, name: "Jane Doe" },
    ];
  }

  getUserById(id: string) {
    return { id, name: "John Doe" };
  }

  createUser(userData: { name: string; email: string; age: number }) {
    console.log("Creating user:", userData);
    // Here you would typically save the user data to a DB
    return { message: "User created", user: userData };
  }

  updateUser(
    id: string,
    userData: Partial<{ name: string; email: string; age: number }>
  ) {
    return { message: "User updated", id, updates: userData };
  }

  deleteUser(id: string) {
    return { message: "User deleted", id };
  }
}

// Zod schema for user creation
const createUserSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  age: z.number().int().min(18),
});

// Exception filter for handling errors
@Injectable()
class HttpExceptionFilter implements ExceptionFilter {
  catch(
    exception: Error,
    req: express.Request,
    res: express.Response,
    next: express.NextFunction
  ): void {
    if (exception instanceof HttpException) {
      res.status(exception.status).json({
        statusCode: exception.status,
        message: exception.message,
      });
    } else {
      // Generic fallback for other exceptions
      res.status(500).json({
        statusCode: 500,
        message: "Internal server error",
      });
    }
  }
}

// Custom guard for checking authorization headers
@Injectable()
class AuthGuard implements CanActivate {
  canActivate(req: express.Request, res: express.Response): boolean {
    const authHeader = req.headers.authorization;
    return !!authHeader && authHeader.startsWith("Bearer ");
  }
}

// Custom decorator for roles
const Roles = (...roles: string[]) => createDecorator("roles", roles);

// Controller for managing users
@Controller("/users")
@UseGuards(AuthGuard)
@UseFilters(HttpExceptionFilter)
@Injectable()
class UserController {
  constructor(@Inject(UserService) private userService: UserService) {}

  @Get("/")
  @Roles("admin")
  getUsers() {
    return this.userService.getUsers();
  }

  @Get("/:id")
  getUser(@Param("id") id: string) {
    return this.userService.getUserById(id);
  }

  @Post("/")
  @UsePipes(createUserSchema.parse)
  createUser(@Body() userData: z.infer<typeof createUserSchema>) {
    return this.userService.createUser(userData);
  }

  @Put("/:id")
  updateUser(
    @Param("id") id: string,
    @Body() userData: Partial<z.infer<typeof createUserSchema>>
  ) {
    return this.userService.updateUser(id, userData);
  }

  @Delete("/:id")
  deleteUser(@Param("id") id: string) {
    return this.userService.deleteUser(id);
  }
}

// User module
@Module({
  controllers: [UserController],
  providers: [ConfigService, UserService, AuthGuard, HttpExceptionFilter],
})
class UserModule {}

// Bootstrap the application
async function bootstrap() {
  const app = new MiniFramework();
  await app.registerModule(UserModule);
  app.listen(3000, () => {
    console.log("Server running at http://localhost:3000");
  });
}

bootstrap();
