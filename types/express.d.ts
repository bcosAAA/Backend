import { Request } from 'express';

declare namespace Express {
  interface User {
    id: string;
    email: string;
    name?: string; // Make name optional
    role?: string;
  }
}