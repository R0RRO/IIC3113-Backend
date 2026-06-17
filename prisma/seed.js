import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const zones = [
  { id: 'valparaiso-centro', name: 'Valparaíso Centro', riskLevel: 'critical', lat: -33.0472, lng: -71.6127, volunteers: 45,
    description: 'Zona centro de Valparaíso afectada por incendio forestal.' },
  { id: 'vina-del-mar-norte', name: 'Viña del Mar Norte', riskLevel: 'high', lat: -33.0153, lng: -71.55, volunteers: 32,
    description: 'Sector norte con daños estructurales por terremoto.' },
  { id: 'quilpue-sur', name: 'Quilpué Sur', riskLevel: 'medium', lat: -33.055, lng: -71.44, volunteers: 18,
    description: 'Zona sur con inundaciones.' },
];

const reports = [
  { zoneId: 'valparaiso-centro', title: 'Familias sin agua potable en Cerro Alegre', category: 'supplies', votes: 156, urgent: false, volunteersNeeded: 10,
    description: '200 familias llevan 3 días sin agua potable. Se necesitan camiones aljibe.' },
  { zoneId: 'valparaiso-centro', title: 'Derrumbe bloquea acceso a Cerro Barón', category: 'rescue', votes: 234, urgent: true, volunteersNeeded: 0,
    description: 'Derrumbe bloquea la única vía de acceso. Personas atrapadas.' },
  { zoneId: 'vina-del-mar-norte', title: 'Adultos mayores sin medicamentos', category: 'medical', votes: 210, urgent: true, volunteersNeeded: 0,
    description: 'Hogar de ancianos con 50 residentes sin medicamentos hace 2 días.' },
];

async function main() {
  // Usuarios demo (uno por rol)
  const password = await bcrypt.hash('password123', 10);
  await prisma.user.upsert({
    where: { email: 'admin@mingup.cl' },
    update: {},
    create: { email: 'admin@mingup.cl', password, name: 'Admin', role: 'admin' },
  });
  await prisma.user.upsert({
    where: { email: 'vecino@mingup.cl' },
    update: {},
    create: { email: 'vecino@mingup.cl', password, name: 'Vecino Demo', role: 'vecino' },
  });
  await prisma.user.upsert({
    where: { email: 'voluntario@mingup.cl' },
    update: {},
    create: { email: 'voluntario@mingup.cl', password, name: 'Voluntario Demo', role: 'voluntario' },
  });

  for (const z of zones) {
    await prisma.zone.upsert({ where: { id: z.id }, update: z, create: z });
  }

  // Solo siembra reportes si la tabla esta vacia (ids autogenerados)
  const count = await prisma.report.count();
  if (count === 0) {
    for (const r of reports) {
      await prisma.report.create({ data: { ...r, authorName: 'Seed', authorRole: 'vecino' } });
    }
  }

  console.log('Seed completo. Usuarios: admin@/vecino@/voluntario@mingup.cl  pass: password123');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
