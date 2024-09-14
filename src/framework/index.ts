import "reflect-metadata";
import express from "express";
import { Container as InversifyContainer, injectable as inverseInjectable, inject as inverseInject, decorate } from "inversify";
import type { interfaces } from "inversify";
import { z } from "zod";
import dotenv from "dotenv";
import type { ParsedQs } from "qs";

dotenv.config();

type ParamsDictionary = { [key: string]: string };
type RequestHandler<P extends ParamsDictionary = ParamsDictionary, ResBody = any, ReqBody = any, ReqQuery = ParsedQs> = (
  req: express.Request<P, ResBody, ReqBody, ReqQuery>,
  res: express.Response<ResBody>,
  next: express.NextFunction
) => void | Promise<void>;

interface RouteMetadata {
  method: keyof Pick<express.Application, "get" | "post" | "put" | "delete" | "patch">;
  path: string;
  handlerName: string;
}

interface ModuleMetadata {
  controllers?: Constructor[];
  providers?: Provider<any>[];
  imports?: Constructor[];
}

type Constructor<T = any> = new (...args: any[]) => T;

// Scope types
// Singleton: A single instance of the service is created and shared across all consumers
// Transient: A new instance of the service is created for each consumer
// Request: A new instance of the service is created for each incoming request
type Scope = "Singleton" | "Transient" | "Request";

type Token<T = any> = Constructor<T> | string | symbol;

// Provider types
// Constructor: A class constructor
// useClass: A class constructor to be used for creating instances
// useFactory: A factory function to create instances
// useValue: A value to be used as is
type Provider<T> =
  | Constructor<T>
  | { provide: Token<T>; useClass: Constructor<T>; scope?: Scope }
  | { provide: Token<T>; useFactory: (...args: any[]) => T }
  | { provide: Token<T>; useValue: T };

// Custom HTTP exception class
class HttpException extends Error {
  constructor(public status: number, public message: string) {
    super(message);
  }
}

// Exception Filter interface
interface ExceptionFilter {
  catch(exception: Error, req: express.Request, res: express.Response, next: express.NextFunction): void;
}

// Guard interface
interface CanActivate {
  canActivate(req: express.Request, res: express.Response): boolean | Promise<boolean>;
}

// Config service interface
interface ConfigService {
  get(key: string): string | undefined;
}

// Decorators
// UseFilters: Decorator to apply exception filters to a route or controller
function UseFilters(...filters: Constructor<ExceptionFilter>[]): MethodDecorator & ClassDecorator {
  return (target: Object | Function, propertyKey?: string | symbol, descriptor?: PropertyDescriptor): void => {
    if (propertyKey) {
      // This is a method decorator
      Reflect.defineMetadata("filters", filters, target, propertyKey);
    } else {
      // This is a class decorator
      Reflect.defineMetadata("filters", filters, target);
    }
  };
}
// UseGuards: Decorator to apply guards to a route or controller
function UseGuards(...guards: Constructor<CanActivate>[]): MethodDecorator & ClassDecorator {
  return (target: Object | Function, propertyKey?: string | symbol, descriptor?: PropertyDescriptor): void => {
    if (propertyKey) {
      // This is a method decorator
      Reflect.defineMetadata("guards", guards, target, propertyKey);
    } else {
      // This is a class decorator
      Reflect.defineMetadata("guards", guards, target);
    }
  };
}

// Module decorator
// Used to define a module with controllers, providers, and imported modules
function Module(options: ModuleMetadata): ClassDecorator {
  return (target: Function): void => {
    Reflect.defineMetadata("module", options, target);
  };
}

// Controller decorator
// Used to define a controller with a prefix
// The prefix is used to define the base path for all routes in the controller
function Controller(prefix: string): ClassDecorator {
  return (target: any) => {
    Reflect.defineMetadata("prefix", prefix, target);
  };
}

// Method decorators
// Used to define routes with specific HTTP methods
function createMethodDecorator(method: string) {
  return (path?: string): MethodDecorator => {
    return (target: Object, propertyKey: string | symbol, descriptor: TypedPropertyDescriptor<any>): TypedPropertyDescriptor<any> | void => {
      Reflect.defineMetadata("path", path, target, propertyKey);
      Reflect.defineMetadata("method", method, target, propertyKey);
      return descriptor;
    };
  };
}

const Get = createMethodDecorator("get");
const Post = createMethodDecorator("post");
const Put = createMethodDecorator("put");
const Delete = createMethodDecorator("delete");
const Patch = createMethodDecorator("patch");

// Param decorators
// Used to define parameters for routes
interface ParamMetadata {
  index: number;
  type: "param" | "body" | "query" | "custom";
  name?: string;
  data?: string;
  factory?: (req: express.Request, res: express.Response, next: express.NextFunction, data?: any) => any;
}

type ParamType = "param" | "body" | "query";

function createParamDecorator(type: ParamType, name?: string): ParameterDecorator {
  return (target: Object, propertyKey: string | symbol | undefined, parameterIndex: number): void => {
    const existingParams: ParamMetadata[] = Reflect.getMetadata("params", target, propertyKey as string | symbol) || [];
    existingParams.push({ index: parameterIndex, type, ...(name && { name }) });
    Reflect.defineMetadata("params", existingParams, target, propertyKey as string | symbol);
  };
}

// Param: Decorator to inject route parameters
function Param(param: string): ParameterDecorator {
  return createParamDecorator("param", param);
}

// Body: Decorator to inject the request body
function Body(): ParameterDecorator {
  return createParamDecorator("body");
}

// Query: Decorator to inject query parameters
function Query(param: string): ParameterDecorator {
  return createParamDecorator("query", param);
}

// Custom decorator creator
// Used to create custom decorators with metadata
// The metadata key and value are used to store the metadata
function createDecorator(metadataKey: string, metadataValue: any): Function {
  return function (target: any, key?: string | symbol, descriptor?: PropertyDescriptor | number) {
    if (descriptor === undefined) {
      // Class decorator
      Reflect.defineMetadata(metadataKey, metadataValue, target);
    } else if (typeof descriptor === "number") {
      // Parameter decorator
      const existingParameters = Reflect.getOwnMetadata(metadataKey, target, key!) || [];
      existingParameters.push({ index: descriptor, value: metadataValue });
      Reflect.defineMetadata(metadataKey, existingParameters, target, key!);
    } else {
      // Method decorator
      Reflect.defineMetadata(metadataKey, metadataValue, target, key!);
    }
  };
}

// Injectable decorator
// Used to define a service as injectable with a specific scope
// The scope determines how the service is created and shared
function Injectable(scope: Scope = "Singleton"): ClassDecorator {
  return (target: any) => {
    decorate(inverseInjectable(), target);
    Reflect.defineMetadata("scope", scope, target);
  };
}

interface InjectionMetadata {
  index: number;
  token: string | symbol | Constructor;
}

// Inject decorator
// Used to inject dependencies into a service
// The token can be a class constructor
function Inject(token: string | symbol | Constructor): ParameterDecorator {
  return (target: Object, propertyKey: string | symbol | undefined, parameterIndex: number) => {
    decorate(inverseInject(token), target, parameterIndex);
    const existingInjections: InjectionMetadata[] = Reflect.getMetadata("injections", target, propertyKey as string | symbol) || [];

    existingInjections.push({
      index: parameterIndex,
      token: typeof token === "function" ? token : token,
    });

    Reflect.defineMetadata("injections", existingInjections, target, propertyKey as string | symbol);
  };
}

// UseMiddleware decorator
// Used to apply middleware to a route or controller
const UseMiddleware = (middleware: RequestHandler): MethodDecorator & ClassDecorator => {
  return (target: any, key?: string | symbol, descriptor?: PropertyDescriptor) => {
    if (key) {
      // Method decorator
      const middlewares = Reflect.getMetadata("middlewares", target, key) || [];
      middlewares.push(middleware);
      Reflect.defineMetadata("middlewares", middlewares, target, key);
    } else {
      // Class decorator
      const middlewares = Reflect.getMetadata("middlewares", target) || [];
      middlewares.push(middleware);
      Reflect.defineMetadata("middlewares", middlewares, target);
    }
  };
};

type PipeFunction = (value: unknown) => unknown;

// UsePipes decorator
// Used to apply pipes to a route or controller
function UsePipes(...pipes: PipeFunction[]): MethodDecorator {
  return (target: Object, propertyKey: string | symbol, descriptor: PropertyDescriptor): PropertyDescriptor | void => {
    Reflect.defineMetadata("pipes", pipes, target, propertyKey);
    return descriptor;
  };
}

// UseInterceptor decorator
// Used to apply interceptors to a route or controller
const UseInterceptor = (interceptor: RequestHandler): MethodDecorator & ClassDecorator => {
  return (target: Object | Function, propertyKey?: string | symbol, descriptor?: PropertyDescriptor): void => {
    if (propertyKey) {
      // Method decorator
      const interceptors: RequestHandler[] = Reflect.getMetadata("interceptors", target, propertyKey) || [];
      interceptors.push(interceptor);
      Reflect.defineMetadata("interceptors", interceptors, target, propertyKey);
    } else {
      // Class decorator
      const interceptors: RequestHandler[] = Reflect.getMetadata("interceptors", target) || [];
      interceptors.push(interceptor);
      Reflect.defineMetadata("interceptors", interceptors, target);
    }
  };
};

// Container class
// Used to register and resolve services
class Container {
  public inversifyContainer = new InversifyContainer();

  // register method
  // Used to register a provider with the container
  register<T>(provider: Provider<T>): void {
    if (typeof provider === "function") {
      this.bind(provider, provider);
    } else if ("useClass" in provider) {
      this.bind(provider.provide, provider.useClass, provider.scope);
    } else if ("useFactory" in provider) {
      this.inversifyContainer.bind(provider.provide).toFactory((ctx) => provider.useFactory);
    } else if ("useValue" in provider) {
      this.inversifyContainer.bind(provider.provide).toConstantValue(provider.useValue);
    } else {
      throw new Error("Invalid provider configuration");
    }
  }

  // bind method
  // Used to bind a token to a target class with a specific scope
  private bind<T>(token: Token<T>, target: Constructor<T>, scope?: Scope): void {
    const binding = this.inversifyContainer.bind(token).to(target);
    this.applyScope(binding, scope || this.getClassScope(target));
  }

  private applyScope<T>(binding: interfaces.BindingInSyntax<T>, scope: Scope): void {
    switch (scope) {
      case "Singleton":
        binding.inSingletonScope();
        break;
      case "Transient":
        binding.inTransientScope();
        break;
      case "Request":
        if (typeof binding.inRequestScope === "function") {
          binding.inRequestScope();
        } else {
          console.warn("Request scope not available. Using transient scope.");
          binding.inTransientScope();
        }
        break;
      default:
        binding.inSingletonScope();
    }
  }

  // getClassScope method
  // Used to get the scope of a class
  private getClassScope(target: Constructor): Scope {
    return Reflect.getMetadata("scope", target) || "Singleton";
  }

  resolve<T>(token: Token<T>): T {
    return this.inversifyContainer.get<T>(token);
  }

  has(token: Token): boolean {
    return this.inversifyContainer.isBound(token);
  }
}

@Injectable()
class ConfigService implements ConfigService {
  get(key: string): string | undefined {
    return process.env[key];
  }
}

class MiniFramework {
  private app: express.Application;
  private container: Container;

  constructor() {
    this.app = express();
    this.container = new Container();
    this.app.use(express.json());
    this.app.use(this.scopeMiddleware.bind(this));
  }

  // scopeMiddleware method
  // Used to create a child container for each incoming request
  private scopeMiddleware(req: express.Request, res: express.Response, next: express.NextFunction): void {
    req.container = this.container.inversifyContainer.createChild();
    res.on("finish", () => {
      // Clean up request-scoped instances
      req.container.unbindAll();
    });
    next();
  }

  // registerModule method
  // Used to register a module with the framework
  async registerModule(moduleClass: Constructor): Promise<void> {
    const moduleMetadata: ModuleMetadata = Reflect.getMetadata("module", moduleClass);

    if (!moduleMetadata) {
      throw new Error(`Invalid module: ${moduleClass.name}`);
    }

    const { controllers = [], providers = [], imports = [] } = moduleMetadata;

    imports.forEach((importedModule) => this.registerModule(importedModule));

    providers.forEach((provider) => (!this.container.has(provider as Constructor) ? this.container.register(provider) : () => {}));

    controllers.forEach((controller) => this.registerController(controller));
  }

  // getRoutes method
  // Used to get the routes from a controller
  private getRoutes(controller: Constructor): RouteMetadata[] {
    const prototype = controller.prototype;
    const methodNames = Object.getOwnPropertyNames(prototype).filter((prop) => prop !== "constructor" && typeof prototype[prop] === "function");

    return methodNames
      .map((methodName) => {
        const method = Reflect.getMetadata("method", prototype, methodName);
        const path = Reflect.getMetadata("path", prototype, methodName);
        // If the method does not have the metadata, it is not a route
        if (!method || !path) {
          return null;
        }
        return {
          method: method as keyof Pick<express.Application, "get" | "post" | "put" | "delete" | "patch">,
          path: path as string,
          handlerName: methodName,
        };
      })
      .filter((route) => route !== null) as RouteMetadata[];
  }

  // registerController method
  // Used to register a controller with the framework
  private async registerController(controller: Constructor): Promise<void> {
    if (!this.container.has(controller)) {
      this.container.register(controller);
    }
    const prefix = Reflect.getMetadata("prefix", controller);
    const routes = this.getRoutes(controller);

    const classMiddlewares: express.RequestHandler[] = Reflect.getMetadata("middlewares", controller) || [];
    const classInterceptors: express.RequestHandler[] = Reflect.getMetadata("interceptors", controller) || [];
    const classFilters: Constructor<ExceptionFilter>[] = Reflect.getMetadata("filters", controller) || [];
    const classGuards: Constructor<CanActivate>[] = Reflect.getMetadata("guards", controller) || [];

    for (const { method, path, handlerName } of routes) {
      const pipes: PipeFunction[] = Reflect.getMetadata("pipes", controller.prototype, handlerName) || [];

      const methodMiddlewares = Reflect.getMetadata("middlewares", controller.prototype, handlerName) || [];
      const methodInterceptors = Reflect.getMetadata("interceptors", controller.prototype, handlerName) || [];
      const methodFilters: Constructor<ExceptionFilter>[] = Reflect.getMetadata("filters", controller.prototype, handlerName) || [];
      const methodGuards: Constructor<CanActivate>[] = Reflect.getMetadata("guards", controller.prototype, handlerName) || [];

      const params: ParamMetadata[] = Reflect.getMetadata("params", controller.prototype, handlerName) || [];

      this.app[method](
        prefix + path,
        ...classMiddlewares,
        ...methodMiddlewares,
        ...classInterceptors,
        ...methodInterceptors,
        this.createGuardMiddleware([...classGuards, ...methodGuards]),
        this.createExceptionFilterMiddleware([...classFilters, ...methodFilters]),
        async (req: express.Request, res: express.Response, next: express.NextFunction) => {
          try {
            const requestContainer = req.container;
            const instance = requestContainer.get(controller);

            const args = params
              .sort((a: { index: number }, b: { index: number }) => a.index - b.index)
              .map((param) => {
                switch (param.type) {
                  case "param":
                    return req.params[param.data as string];
                  case "body":
                    return req.body;
                  case "query":
                    return req.query[param.data as string];
                  case "custom":
                    if (param.factory && typeof param.factory === "function") {
                      return param.factory(req, res, next, param.data);
                    }
                    return undefined;
                  default:
                    return undefined;
                }
              });

            let result = await instance[handlerName](...args);

            for (const pipe of pipes) {
              result = await pipe(result);
            }

            res.send(result);
          } catch (error) {
            if (error instanceof z.ZodError) {
              return res.status(400).json({ errors: error.errors });
            }
            next(error);
          }
        }
      );
    }
  }

  // createExceptionFilterMiddleware method
  // Used to create an exception filter middleware
  private createExceptionFilterMiddleware(filters: Constructor<ExceptionFilter>[]): express.ErrorRequestHandler {
    return (err: any, req, res, next): void => {
      const requestContainer = req.container;

      for (const Filter of filters) {
        // Get the exception filter instance from the request container
        const filter = requestContainer.get<ExceptionFilter>(Filter);
        filter.catch(err, req, res, next);
        if (res.headersSent) {
          return;
        }
      }
      if (!res.headersSent) {
        next(err);
      }
    };
  }

  private createGuardMiddleware(guards: Constructor<CanActivate>[]): RequestHandler {
    return async (req, res, next): Promise<void> => {
      try {
        const requestContainer = req.container;
        for (const Guard of guards) {
            // Get the guard instance from the request container
          const guard = requestContainer.get<CanActivate>(Guard);
          const canActivate = await guard.canActivate(req, res);
          if (!canActivate) {
            res.status(403).json({ message: "Forbidden" });
            return;
          }
        }
        next();
      } catch (error) {
        next(error);
      }
    };
  }

  listen(port: number, callback?: () => void): void {
    this.app.listen(port, callback);
  }
}

export {
  Injectable,
  Module,
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Patch,
  Param,
  Body,
  Query,
  UseMiddleware,
  UsePipes,
  UseGuards,
  UseFilters,
  UseInterceptor,
  Inject,
  ConfigService,
  MiniFramework,
  HttpException,
  createParamDecorator,
  createMethodDecorator,
  createDecorator,
};

export type { ExceptionFilter, CanActivate, Scope };
