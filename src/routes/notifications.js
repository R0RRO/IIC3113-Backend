import { Router } from 'express';
import { prisma } from '../db.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

// GET /notifications?unread=1  -- lista las del usuario (polling desde el front)
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const where = { userId: req.user.id };
    if (req.query.unread === '1') where.read = false;
    const [items, unread] = await Promise.all([
      prisma.notification.findMany({ where, orderBy: { createdAt: 'desc' }, take: 50 }),
      prisma.notification.count({ where: { userId: req.user.id, read: false } }),
    ]);
    res.json({ items, unread });
  } catch (err) {
    next(err);
  }
});

// POST /notifications/:id/read  -- marca una como leida
router.post('/:id/read', requireAuth, async (req, res, next) => {
  try {
    const n = await prisma.notification.findUnique({ where: { id: req.params.id } });
    if (!n || n.userId !== req.user.id) return res.status(404).json({ error: 'No encontrada' });
    await prisma.notification.update({ where: { id: n.id }, data: { read: true } });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// POST /notifications/read-all  -- marca todas como leidas
router.post('/read-all', requireAuth, async (req, res, next) => {
  try {
    await prisma.notification.updateMany({
      where: { userId: req.user.id, read: false },
      data: { read: true },
    });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
