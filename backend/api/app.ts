import express from 'express';
import { router } from './routes/index.ts';

export const app = express();
app.use(express.json());
app.get('/', (_request, response) => response.json({ service: 'TerraScope API', health: '/api/health' }));
app.use('/api', router);
