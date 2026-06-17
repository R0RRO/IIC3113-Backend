import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { requireAuth, requireRole, optionalAuth } from '../middleware/auth.js';
import { withinZone, haversineKm } from '../lib/geo.js';
import { notify, notifyMany, enrolledUserIds } from '../lib/notify.js';

const router = Router();

const CATEGORIES = ['rescue', 'medical', 'supplies', 'infrastructure', 'volunteers'];

const createSchema = z.object({
  zoneId: z.string(),
  title: z.string().min(1),
  description: z.string().min(1),
  category: z.enum(CATEGORIES).default('rescue'),
  urgent: z.boolean().default(false),
  volunteersNeeded: z.number().int().min(0).max(500).default(0),
  lat: z.number(),       // pin del incidente
  lng: z.number(),
  userLat: z.number(),   // ubicacion GPS del usuario (gate)
  userLng: z.number(),
});

const updateSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
  category: z.enum(CATEGORIES).optional(),
  urgent: z.boolean().optional(),
  volunteersNeeded: z.number().int().min(0).max(500).optional(),
  lat: z.number().optional(),
  lng: z.number().optional(),
});

const voteSchema = z.object({
  direction: z.union([z.literal(1), z.literal(-1)]),
  userLat: z.number(),
  userLng: z.number(),
});

const commentSchema = z.object({ body: z.string().min(1).max(2000) });

const URGENT_RADIUS_KM = 20;
const NORMAL_RADIUS_KM = 5;

// Notifica a voluntarios (segun su modo) y admins al publicarse un reporte.
// nearby: dentro de 20km si urgente, 5km si normal. zones: participo antes en la zona.
async function notifyNewReport(report, zone, authorId) {
  const refLat = report.lat ?? zone.lat;
  const refLng = report.lng ?? zone.lng;
  const radius = report.urgent ? URGENT_RADIUS_KM : NORMAL_RADIUS_KM;

  const [vols, admins, zoneEnrollees] = await Promise.all([
    prisma.user.findMany({
      where: { role: 'voluntario', id: { not: authorId }, notifyMode: { not: 'off' } },
      select: { id: true, notifyMode: true, lat: true, lng: true },
    }),
    // admins: solo en urgentes, para no saturar con cada reporte normal
    report.urgent
      ? prisma.user.findMany({ where: { role: 'admin', id: { not: authorId } }, select: { id: true } })
      : Promise.resolve([]),
    prisma.enrollment.findMany({
      where: { report: { zoneId: report.zoneId } },
      select: { userId: true },
      distinct: ['userId'],
    }),
  ]);

  const participatedZone = new Set(zoneEnrollees.map((e) => e.userId));

  const volTargets = vols
    .filter((u) => {
      switch (u.notifyMode) {
        case 'all': return true;
        case 'zones': return participatedZone.has(u.id);
        case 'nearby':
          if (u.lat == null || u.lng == null) return false;
          return haversineKm([u.lat, u.lng], [refLat, refLng]) <= radius;
        default: return false;
      }
    })
    .map((u) => u.id);

  await notifyMany(
    [...volTargets, ...admins.map((a) => a.id)],
    'new_report',
    `Reporte ${report.urgent ? 'urgente' : 'nuevo'} en ${zone.name}: ${report.title}`,
    { reportId: report.id, zoneId: zone.id }
  );
}

// GET /reports?zoneId=...  (lista; todos o por zona)
router.get('/', async (req, res, next) => {
  try {
    const where = req.query.zoneId ? { zoneId: req.query.zoneId } : {};
    const reports = await prisma.report.findMany({ where, orderBy: { votes: 'desc' } });
    res.json(reports);
  } catch (err) {
    next(err);
  }
});

// GET /reports/me/state  (estado del usuario: votos, inscripciones, completados)
router.get('/me/state', requireAuth, async (req, res, next) => {
  try {
    const [votes, enrollments, completions] = await Promise.all([
      prisma.vote.findMany({ where: { userId: req.user.id }, select: { reportId: true, direction: true } }),
      prisma.enrollment.findMany({ where: { userId: req.user.id }, select: { reportId: true } }),
      prisma.completionVote.findMany({ where: { userId: req.user.id }, select: { reportId: true } }),
    ]);
    res.json({
      votes: Object.fromEntries(votes.map((v) => [v.reportId, v.direction])),
      enrollments: enrollments.map((e) => e.reportId),
      completions: completions.map((c) => c.reportId),
    });
  } catch (err) {
    next(err);
  }
});

// GET /reports/:id  (incluye estado del usuario si manda token)
router.get('/:id', optionalAuth, async (req, res, next) => {
  try {
    const report = await prisma.report.findUnique({ where: { id: req.params.id } });
    if (!report) return res.status(404).json({ error: 'Reporte no encontrado' });

    let me = { vote: 0, enrolled: false, votedComplete: false };
    if (req.user) {
      const [v, e, c] = await Promise.all([
        prisma.vote.findUnique({ where: { userId_reportId: { userId: req.user.id, reportId: report.id } } }),
        prisma.enrollment.findUnique({ where: { userId_reportId: { userId: req.user.id, reportId: report.id } } }),
        prisma.completionVote.findUnique({ where: { userId_reportId: { userId: req.user.id, reportId: report.id } } }),
      ]);
      me = { vote: v?.direction ?? 0, enrolled: !!e, votedComplete: !!c };
    }
    res.json({ ...report, me });
  } catch (err) {
    next(err);
  }
});

// POST /reports  (autenticado + dentro de la zona)
router.post('/', requireAuth, async (req, res, next) => {
  try {
    const data = createSchema.parse(req.body);
    const zone = await prisma.zone.findUnique({ where: { id: data.zoneId } });
    if (!zone) return res.status(404).json({ error: 'Zona no encontrada' });

    if (!withinZone(data.userLat, data.userLng, zone)) {
      return res.status(403).json({ error: 'Debes estar dentro de la zona para publicar' });
    }
    if (!withinZone(data.lat, data.lng, zone)) {
      return res.status(400).json({ error: 'El pin debe estar dentro del radio de la zona' });
    }

    const report = await prisma.report.create({
      data: {
        zoneId: data.zoneId,
        title: data.title,
        description: data.description,
        category: data.category,
        urgent: data.urgent,
        volunteersNeeded: data.volunteersNeeded,
        lat: data.lat,
        lng: data.lng,
        authorId: req.user.id,
        authorName: req.user.name,
        authorRole: req.user.role,
        votes: 1,
        voteRecords: { create: { userId: req.user.id, direction: 1 } },
      },
    });

    await notifyNewReport(report, zone, req.user.id);

    res.status(201).json(report);
  } catch (err) {
    next(err);
  }
});

// Helper: es dueño o admin
async function loadOwnedReport(req, res) {
  const report = await prisma.report.findUnique({ where: { id: req.params.id } });
  if (!report) {
    res.status(404).json({ error: 'Reporte no encontrado' });
    return null;
  }
  const isOwner = report.authorId === req.user.id;
  const isAdmin = req.user.role === 'admin';
  if (!isOwner && !isAdmin) {
    res.status(403).json({ error: 'Sin permiso sobre este reporte' });
    return null;
  }
  return report;
}

// PATCH /reports/:id  (dueño o admin)
router.patch('/:id', requireAuth, async (req, res, next) => {
  try {
    const existing = await loadOwnedReport(req, res);
    if (!existing) return;
    const data = updateSchema.parse(req.body);
    const report = await prisma.report.update({ where: { id: existing.id }, data });

    // Avisa a los voluntarios inscritos que la tarea cambio
    const enrolled = await enrolledUserIds(report.id);
    await notifyMany(
      enrolled.filter((id) => id !== req.user.id),
      'task_update',
      `Actualizaron una tarea en la que estás inscrito: ${report.title}`,
      { reportId: report.id, zoneId: report.zoneId }
    );

    res.json(report);
  } catch (err) {
    next(err);
  }
});

// DELETE /reports/:id  (dueño o admin)
router.delete('/:id', requireAuth, async (req, res, next) => {
  try {
    const existing = await loadOwnedReport(req, res);
    if (!existing) return;
    await prisma.report.delete({ where: { id: existing.id } });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

// GET /reports/:id/comments
router.get('/:id/comments', async (req, res, next) => {
  try {
    const comments = await prisma.comment.findMany({
      where: { reportId: req.params.id },
      orderBy: { createdAt: 'asc' },
    });
    res.json(comments);
  } catch (err) {
    next(err);
  }
});

// POST /reports/:id/comments  (autenticado). Notifica al autor del reporte.
router.post('/:id/comments', requireAuth, async (req, res, next) => {
  try {
    const { body } = commentSchema.parse(req.body);
    const report = await prisma.report.findUnique({ where: { id: req.params.id } });
    if (!report) return res.status(404).json({ error: 'Reporte no encontrado' });

    const comment = await prisma.comment.create({
      data: {
        reportId: report.id,
        authorId: req.user.id,
        authorName: req.user.name,
        authorRole: req.user.role,
        body,
      },
    });
    await prisma.report.update({ where: { id: report.id }, data: { comments: { increment: 1 } } });

    if (report.authorId && report.authorId !== req.user.id) {
      await notify(report.authorId, 'comment',
        `${req.user.name} comentó en tu reporte: ${report.title}`,
        { reportId: report.id, zoneId: report.zoneId });
    }
    res.status(201).json(comment);
  } catch (err) {
    next(err);
  }
});

// DELETE /reports/:id/comments/:commentId  (admin o autor del comentario)
router.delete('/:id/comments/:commentId', requireAuth, async (req, res, next) => {
  try {
    const comment = await prisma.comment.findUnique({ where: { id: req.params.commentId } });
    if (!comment || comment.reportId !== req.params.id) {
      return res.status(404).json({ error: 'Comentario no encontrado' });
    }
    const isAdmin = req.user.role === 'admin';
    const isAuthor = comment.authorId === req.user.id;
    if (!isAdmin && !isAuthor) return res.status(403).json({ error: 'Sin permiso' });

    await prisma.$transaction([
      prisma.comment.delete({ where: { id: comment.id } }),
      prisma.report.update({ where: { id: comment.reportId }, data: { comments: { decrement: 1 } } }),
    ]);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

// POST /reports/:id/vote  (autenticado + dentro de la zona). Toggle como el front.
router.post('/:id/vote', requireAuth, async (req, res, next) => {
  try {
    const { direction, userLat, userLng } = voteSchema.parse(req.body);
    const report = await prisma.report.findUnique({
      where: { id: req.params.id },
      include: { zone: true },
    });
    if (!report) return res.status(404).json({ error: 'Reporte no encontrado' });
    if (!withinZone(userLat, userLng, report.zone)) {
      return res.status(403).json({ error: 'Debes estar dentro de la zona para votar' });
    }

    const key = { userId_reportId: { userId: req.user.id, reportId: report.id } };
    const current = await prisma.vote.findUnique({ where: key });
    const currentDir = current?.direction ?? 0;
    const newDir = currentDir === direction ? 0 : direction;
    const delta = newDir - currentDir;

    await prisma.$transaction(async (tx) => {
      if (newDir === 0) {
        await tx.vote.delete({ where: key });
      } else if (current) {
        await tx.vote.update({ where: key, data: { direction: newDir } });
      } else {
        await tx.vote.create({ data: { userId: req.user.id, reportId: report.id, direction: newDir } });
      }
      await tx.report.update({ where: { id: report.id }, data: { votes: { increment: delta } } });
    });

    res.json({ votes: report.votes + delta, myVote: newDir });
  } catch (err) {
    next(err);
  }
});

// POST /reports/:id/enroll  (voluntario). Inscribe.
router.post('/:id/enroll', requireAuth, requireRole('voluntario'), async (req, res, next) => {
  try {
    const report = await prisma.report.findUnique({ where: { id: req.params.id } });
    if (!report) return res.status(404).json({ error: 'Reporte no encontrado' });

    const key = { userId_reportId: { userId: req.user.id, reportId: report.id } };
    const existing = await prisma.enrollment.findUnique({ where: key });
    if (existing) return res.status(409).json({ error: 'Ya estas inscrito' });

    await prisma.$transaction([
      prisma.enrollment.create({ data: { userId: req.user.id, reportId: report.id } }),
      prisma.report.update({ where: { id: report.id }, data: { enrolledCount: { increment: 1 } } }),
    ]);

    if (report.authorId && report.authorId !== req.user.id) {
      await notify(report.authorId, 'enroll',
        `${req.user.name} se inscribio en tu reporte: ${report.title}`,
        { reportId: report.id, zoneId: report.zoneId });
    }
    res.json({ enrolled: true, enrolledCount: report.enrolledCount + 1 });
  } catch (err) {
    next(err);
  }
});

// DELETE /reports/:id/enroll  (voluntario). Cancela inscripcion.
router.delete('/:id/enroll', requireAuth, requireRole('voluntario'), async (req, res, next) => {
  try {
    const report = await prisma.report.findUnique({ where: { id: req.params.id } });
    if (!report) return res.status(404).json({ error: 'Reporte no encontrado' });

    const key = { userId_reportId: { userId: req.user.id, reportId: report.id } };
    const existing = await prisma.enrollment.findUnique({ where: key });
    if (!existing) return res.status(409).json({ error: 'No estabas inscrito' });

    await prisma.$transaction([
      prisma.enrollment.delete({ where: key }),
      prisma.report.update({
        where: { id: report.id },
        data: { enrolledCount: { decrement: 1 } },
      }),
    ]);
    res.json({ enrolled: false, enrolledCount: Math.max(0, report.enrolledCount - 1) });
  } catch (err) {
    next(err);
  }
});

// POST /reports/:id/complete  (voluntario inscrito). Vota "completado".
router.post('/:id/complete', requireAuth, requireRole('voluntario'), async (req, res, next) => {
  try {
    const report = await prisma.report.findUnique({ where: { id: req.params.id } });
    if (!report) return res.status(404).json({ error: 'Reporte no encontrado' });
    if (report.completed) return res.status(409).json({ error: 'Reporte ya resuelto' });

    const enrollKey = { userId_reportId: { userId: req.user.id, reportId: report.id } };
    const isEnrolled = await prisma.enrollment.findUnique({ where: enrollKey });
    if (!isEnrolled) return res.status(403).json({ error: 'Solo voluntarios inscritos pueden confirmar' });

    const existing = await prisma.completionVote.findUnique({ where: enrollKey });
    if (existing) return res.status(409).json({ error: 'Ya confirmaste' });

    const newVotes = report.completionVotes + 1;
    const threshold = Math.ceil(report.enrolledCount / 2);
    const completed = threshold > 0 && newVotes >= threshold;

    await prisma.$transaction([
      prisma.completionVote.create({ data: { userId: req.user.id, reportId: report.id } }),
      prisma.report.update({
        where: { id: report.id },
        data: { completionVotes: newVotes, completed },
      }),
    ]);

    if (completed) {
      const ids = await enrolledUserIds(report.id);
      await notifyMany([...ids, report.authorId], 'resolved',
        `Reporte resuelto: ${report.title}`,
        { reportId: report.id, zoneId: report.zoneId });
    }
    res.json({ completionVotes: newVotes, threshold, completed });
  } catch (err) {
    next(err);
  }
});

// DELETE /reports/:id/complete  (voluntario inscrito). Cancela confirmacion.
router.delete('/:id/complete', requireAuth, requireRole('voluntario'), async (req, res, next) => {
  try {
    const report = await prisma.report.findUnique({ where: { id: req.params.id } });
    if (!report) return res.status(404).json({ error: 'Reporte no encontrado' });

    const key = { userId_reportId: { userId: req.user.id, reportId: report.id } };
    const existing = await prisma.completionVote.findUnique({ where: key });
    if (!existing) return res.status(409).json({ error: 'No habias confirmado' });

    await prisma.$transaction([
      prisma.completionVote.delete({ where: key }),
      prisma.report.update({
        where: { id: report.id },
        data: { completionVotes: { decrement: 1 }, completed: false },
      }),
    ]);
    res.json({ completionVotes: Math.max(0, report.completionVotes - 1), completed: false });
  } catch (err) {
    next(err);
  }
});

export default router;
