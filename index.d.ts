import { Container } from "inversify";

declare global {
  namespace Express {
    interface Request {
      container: Container;
    }
  }
}