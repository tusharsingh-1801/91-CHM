import type { Request, Response } from 'express';
import { pool } from '../db/pool.ts';

export async function getHealth(_request: Request, response: Response) {
  try {
    await pool.query('select 1');
    response.json({ status: 'ok', database: 'postgresql' });
  } catch {
    response.status(503).json({ status: 'error', database: 'unavailable' });
  }
}

