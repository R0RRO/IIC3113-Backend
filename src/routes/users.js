import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

const router = Router();

// GET /users  -- lista de usuarios (admin)
router.get('/', requireAuth, requireRole('admin'), async (_req, res, next) => {
  try {
    const users = await prisma.user.findMany({
      orderBy: { createdAt: 'asc' },
      select: { id: true, name: true, email: true, role: true, suspended: true, createdAt: true },
    });
    res.json(users);
  } catch (err) {
    next(err);
  }
});

// GET /users/:id  -- perfil publico (cualquier usuario autenticado)
router.get('/:id', requireAuth, async (req, res, next) => {
  try {
    const u = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!u) return res.status(404).json({ error: 'Usuario no encontrado' });
    const reportCount = await prisma.report.count({ where: { authorId: u.id } });
    res.json({
      id: u.id,
      name: u.name,
      role: u.role,
      bio: u.bio,
      preferredArea: u.preferredArea,
      suspended: u.suspended,
      createdAt: u.createdAt,
      reportCount,
    });
  } catch (err) {
    next(err);
  }
});

// PATCH /users/:id/suspend  -- suspender/reactivar (admin). No aplica a admins.
const suspendSchema = z.object({ suspended: z.boolean() });
router.patch('/:id/suspend', requireAuth, requireRole('admin'), async (req, res, next) => {
  try {
    const { suspended } = suspendSchema.parse(req.body);
    const target = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!target) return res.status(404).json({ error: 'Usuario no encontrado' });
    if (target.role === 'admin') return res.status(403).json({ error: 'No se puede suspender a un administrador' });
    const u = await prisma.user.update({ where: { id: target.id }, data: { suspended } });
    res.json({ id: u.id, suspended: u.suspended });
  } catch (err) {
    next(err);
  }
});

export default router;
