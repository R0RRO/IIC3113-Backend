import express from 'express';
import cors from 'cors';
import { ZodError } from 'zod';

import authRoutes from './routes/auth.js';
import zoneRoutes from './routes/zones.js';
import reportRoutes from './routes/reports.js';
import notificationRoutes from './routes/notifications.js';

const app = express();
const PORT = process.env.PORT || 3001;

const origins = (process.env.CORS_ORIGIN || 'http://localhost:5173')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

app.use(cors({ origin: origins, credentials: true }));
app.use(express.json());

app.get('/health', (_req, res) => res.json({ ok: true }));

app.use('/auth', authRoutes);
app.use('/zones', zoneRoutes);
app.use('/reports', reportRoutes);
app.use('/notifications', notificationRoutes);

// 404
app.use((_req, res) => res.status(404).json({ error: 'Ruta no encontrada' }));

// Error handler central
app.use((err, _req, res, _next) => {
  if (err instanceof ZodError) {
    return res.status(400).json({ error: 'Datos invalidos', details: err.issues });
  }
  // Prisma: registro no encontrado
  if (err.code === 'P2025') return res.status(404).json({ error: 'No encontrado' });
  console.error(err);
  res.status(500).json({ error: 'Error interno' });
});

app.listen(PORT, () => console.log(`API escuchando en :${PORT}`));
