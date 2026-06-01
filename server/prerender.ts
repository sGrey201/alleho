import { Request, Response, NextFunction } from 'express';

export function invalidateCache(_slug?: string) {}

export function invalidateTagCache(_category?: 'remedy' | 'situation') {}

export async function prerenderMiddleware(_req: Request, _res: Response, next: NextFunction) {
  return next();
}
