import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

const router = Router();

const RISK = ['critical', 'high', 'medium', 'low'];

const zoneSchema = z.object({
  name: z.string().min(1),
  description: z.string().default(''),
  lat: z.number(),
  lng: z.number(),
  riskLevel: z.enum(RISK).default('medium'),
  radiusKm: z.number().positive().default(5),
  volunteers: z.number().int().nonnegative().default(0),
});

// GET /zones
router.get('/', async (_req, res, next) => {
  try {
    const zones = await prisma.zone.findMany({
      orderBy: { createdAt: 'asc' },
      include: { _count: { select: { reports: true } } },
    });
    res.json(zones.map((z) => ({ ...z, activeReports: z._count.reports, _count: undefined })));
  } catch (err) {
    next(err);
  }
});

// GET /zones/:id
router.get('/:id', async (req, res, next) => {
  try {
    const zone = await prisma.zone.findUnique({ where: { id: req.params.id } });
    if (!zone) return res.status(404).json({ error: 'Zona no encontrada' });
    res.json(zone);
  } catch (err) {
    next(err);
  }
});

// GET /zones/:id/reports
router.get('/:id/reports', async (req, res, next) => {
  try {
    const reports = await prisma.report.findMany({
      where: { zoneId: req.params.id },
      orderBy: { votes: 'desc' },
    });
    res.json(reports);
  } catch (err) {
    next(err);
  }
});

// POST /zones  (admin)
router.post('/', requireAuth, requireRole('admin'), async (req, res, next) => {
  try {
    const data = zoneSchema.parse(req.body);
    const zone = await prisma.zone.create({ data });
    res.status(201).json(zone);
  } catch (err) {
    next(err);
  }
});

// PATCH /zones/:id  (admin)
router.patch('/:id', requireAuth, requireRole('admin'), async (req, res, next) => {
  try {
    const data = zoneSchema.partial().parse(req.body);
    const zone = await prisma.zone.update({ where: { id: req.params.id }, data });
    res.json(zone);
  } catch (err) {
    next(err);
  }
});

// DELETE /zones/:id  (admin) -- borra tambien sus reportes (cascade)
router.delete('/:id', requireAuth, requireRole('admin'), async (req, res, next) => {
  try {
    await prisma.zone.delete({ where: { id: req.params.id } });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

export default router;
