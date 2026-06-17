import { prisma } from '../db.js';

// Crea una notificacion para un usuario
export function notify(userId, type, message, extra = {}) {
  if (!userId) return null;
  return prisma.notification.create({
    data: {
      userId,
      type,
      message,
      reportId: extra.reportId ?? null,
      zoneId: extra.zoneId ?? null,
    },
  });
}

// Notifica a varios usuarios (dedup, ignora null)
export async function notifyMany(userIds, type, message, extra = {}) {
  const unique = [...new Set(userIds.filter(Boolean))];
  if (unique.length === 0) return;
  await prisma.notification.createMany({
    data: unique.map((userId) => ({
      userId,
      type,
      message,
      reportId: extra.reportId ?? null,
      zoneId: extra.zoneId ?? null,
    })),
  });
}

// Ids de voluntarios inscritos en un reporte
export async function enrolledUserIds(reportId) {
  const rows = await prisma.enrollment.findMany({
    where: { reportId },
    select: { userId: true },
  });
  return rows.map((r) => r.userId);
}
