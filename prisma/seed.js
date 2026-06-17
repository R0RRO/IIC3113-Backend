import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

// Contraseña compartida para todas las cuentas demo
const PASSWORD = 'mingup2026';

const hoursAgo = (h) => new Date(Date.now() - h * 3600000);

// --- Zonas ---
const zones = [
  // Zonas previas (Valparaiso) que se preservan
  { id: 'valparaiso-centro', name: 'Valparaíso Centro', riskLevel: 'critical', lat: -33.0472, lng: -71.6127, radiusKm: 5, volunteers: 45,
    description: 'Zona centro de Valparaíso afectada por incendio forestal. Apoyo urgente en evacuación y distribución de suministros.' },
  { id: 'vina-del-mar-norte', name: 'Viña del Mar Norte', riskLevel: 'high', lat: -33.0153, lng: -71.5500, radiusKm: 5, volunteers: 32,
    description: 'Sector norte de Viña del Mar con daños estructurales por terremoto. Evaluación de edificios y rescate.' },
  { id: 'quilpue-sur', name: 'Quilpué Sur', riskLevel: 'medium', lat: -33.0550, lng: -71.4400, radiusKm: 5, volunteers: 18,
    description: 'Zona sur de Quilpué con inundaciones. Apoyo en limpieza y distribución de agua potable.' },
  // Zonas nuevas
  {
    id: 'san-joaquin',
    name: 'San Joaquín',
    riskLevel: 'high',
    lat: -33.4936,
    lng: -70.6276,
    radiusKm: 3,
    volunteers: 14,
    description: 'Sector de San Joaquín afectado por inundaciones tras sistema frontal. Anegamientos en Vicuña Mackenna y daños en viviendas del sector poniente.',
  },
  {
    id: 'santiago-oriente',
    name: 'Santiago Oriente',
    riskLevel: 'medium',
    lat: -33.4170,
    lng: -70.5990,
    radiusKm: 6,
    volunteers: 9,
    description: 'Zona oriente de Santiago (Providencia, Las Condes, piedemonte) con aluviones y cortes de servicios tras lluvias intensas en la cordillera.',
  },
];

// --- Usuarios (key interno para enlazar reportes) ---
const users = [
  { key: 'admin', email: 'admin@mingup.cl', name: 'Camila Rojas', role: 'admin' },
  { key: 'pedro', email: 'pedro@mingup.cl', name: 'Pedro Soto', role: 'vecino' },
  { key: 'jorge', email: 'jorge@mingup.cl', name: 'Jorge Fuentes', role: 'vecino' },
  { key: 'fernanda', email: 'fernanda@mingup.cl', name: 'Fernanda Díaz', role: 'vecino' },
  { key: 'maria', email: 'maria@mingup.cl', name: 'María González', role: 'voluntario', preferredArea: 'medical', bio: 'Enfermera con experiencia en emergencias y primeros auxilios.', lat: -33.4930, lng: -70.6280 },
  { key: 'diego', email: 'diego@mingup.cl', name: 'Diego Muñoz', role: 'voluntario', preferredArea: 'rescue', bio: 'Bombero voluntario, disponible para rescate y evacuación.', lat: -33.4948, lng: -70.6255 },
  { key: 'ana', email: 'ana@mingup.cl', name: 'Ana Pérez', role: 'voluntario', preferredArea: 'supplies', bio: 'Coordino acopio y distribución de suministros.', lat: -33.4200, lng: -70.6050 },
  { key: 'matias', email: 'matias@mingup.cl', name: 'Matías Vera', role: 'voluntario', preferredArea: 'infrastructure', bio: 'Estudiante de ingeniería, apoyo en evaluación de daños.', lat: -33.4180, lng: -70.6010 },
];

// --- Reportes (authorKey enlaza con users) ---
const reports = [
  // Valparaíso Centro
  { authorKey: 'pedro', zoneId: 'valparaiso-centro', title: 'Familias sin agua potable en Cerro Alegre', category: 'supplies', urgent: false, votes: 156, comments: 0, lat: -33.0440, lng: -71.6160, volunteersNeeded: 10, hours: 30 },
  { authorKey: 'diego', zoneId: 'valparaiso-centro', title: 'Derrumbe bloquea acceso a Cerro Barón', category: 'rescue', urgent: true, votes: 234, comments: 0, lat: -33.0420, lng: -71.6020, volunteersNeeded: 0, hours: 28 },
  // Viña del Mar Norte
  { authorKey: 'fernanda', zoneId: 'vina-del-mar-norte', title: 'Edificio con daño estructural en Av. Libertad', category: 'infrastructure', urgent: false, votes: 178, comments: 0, lat: -33.0180, lng: -71.5520, volunteersNeeded: 5, hours: 40 },
  { authorKey: 'maria', zoneId: 'vina-del-mar-norte', title: 'Adultos mayores sin medicamentos en Recreo', category: 'medical', urgent: true, votes: 210, comments: 0, lat: -33.0200, lng: -71.5560, volunteersNeeded: 0, hours: 36 },
  // Quilpué Sur
  { authorKey: 'jorge', zoneId: 'quilpue-sur', title: 'Calle principal inundada impide paso de vehículos', category: 'infrastructure', urgent: false, votes: 145, comments: 0, lat: -33.0560, lng: -71.4420, volunteersNeeded: 8, hours: 33 },
  { authorKey: 'ana', zoneId: 'quilpue-sur', title: 'Albergue en escuela municipal necesita frazadas', category: 'supplies', urgent: false, votes: 67, comments: 0, lat: -33.0540, lng: -71.4380, volunteersNeeded: 15, hours: 35 },
  // San Joaquín
  { authorKey: 'pedro', zoneId: 'san-joaquin', title: 'Inundación corta Av. Vicuña Mackenna', category: 'infrastructure', urgent: true, votes: 142, comments: 0, lat: -33.4920, lng: -70.6250, volunteersNeeded: 0, hours: 5 },
  { authorKey: 'maria', zoneId: 'san-joaquin', title: 'Adulto mayor sin oxígeno en Villa O\'Higgins', category: 'medical', urgent: true, votes: 210, comments: 0, lat: -33.4955, lng: -70.6300, volunteersNeeded: 0, hours: 3 },
  { authorKey: 'jorge', zoneId: 'san-joaquin', title: 'Familias evacuadas necesitan colchonetas y frazadas', category: 'supplies', urgent: false, votes: 88, comments: 0, lat: -33.4910, lng: -70.6290, volunteersNeeded: 12, hours: 8 },
  { authorKey: 'diego', zoneId: 'san-joaquin', title: 'Voluntarios para despejar barro en pasajes', category: 'volunteers', urgent: false, votes: 64, comments: 0, lat: -33.4948, lng: -70.6262, volunteersNeeded: 20, hours: 10 },
  // Santiago Oriente
  { authorKey: 'fernanda', zoneId: 'santiago-oriente', title: 'Aluvión en piedemonte sector Estoril', category: 'infrastructure', urgent: true, votes: 187, comments: 0, lat: -33.4060, lng: -70.5680, volunteersNeeded: 0, hours: 6 },
  { authorKey: 'ana', zoneId: 'santiago-oriente', title: 'Corte de agua afecta a Providencia', category: 'supplies', urgent: false, votes: 96, comments: 0, lat: -33.4260, lng: -70.6100, volunteersNeeded: 8, hours: 9 },
  { authorKey: 'matias', zoneId: 'santiago-oriente', title: 'Punto de acopio necesita clasificadores', category: 'volunteers', urgent: false, votes: 73, comments: 0, lat: -33.4180, lng: -70.6020, volunteersNeeded: 25, hours: 12 },
  { authorKey: 'pedro', zoneId: 'santiago-oriente', title: 'Persona atrapada en estacionamiento subterráneo', category: 'rescue', urgent: true, votes: 245, comments: 0, lat: -33.4150, lng: -70.5950, volunteersNeeded: 0, hours: 2 },
];

// Inscripciones reales (reportTitle -> voluntarios). enrolledCount se calcula de aquí.
const enrollments = {
  'Familias sin agua potable en Cerro Alegre': ['maria', 'ana'],
  'Albergue en escuela municipal necesita frazadas': ['ana'],
  'Familias evacuadas necesitan colchonetas y frazadas': ['maria', 'diego'],
  'Voluntarios para despejar barro en pasajes': ['maria', 'diego', 'matias'],
  'Corte de agua afecta a Providencia': ['ana'],
  'Punto de acopio necesita clasificadores': ['ana', 'matias'],
};

async function main() {
  // Reset total (orden por dependencias; cascade igual cubre la mayoria)
  await prisma.notification.deleteMany();
  await prisma.comment.deleteMany();
  await prisma.completionVote.deleteMany();
  await prisma.enrollment.deleteMany();
  await prisma.vote.deleteMany();
  await prisma.report.deleteMany();
  await prisma.zone.deleteMany();
  await prisma.user.deleteMany();

  const password = await bcrypt.hash(PASSWORD, 10);

  // Usuarios
  const byKey = {};
  for (const u of users) {
    const { key, ...data } = u;
    byKey[key] = await prisma.user.create({ data: { ...data, password } });
  }

  // Zonas
  for (const z of zones) {
    await prisma.zone.create({ data: z });
  }

  // Reportes
  const reportByTitle = {};
  for (const r of reports) {
    const author = byKey[r.authorKey];
    const enrolledKeys = enrollments[r.title] || [];
    const created = await prisma.report.create({
      data: {
        zoneId: r.zoneId,
        title: r.title,
        description: r.title,
        category: r.category,
        urgent: r.urgent,
        votes: r.votes,
        comments: r.comments,
        lat: r.lat,
        lng: r.lng,
        volunteersNeeded: r.volunteersNeeded,
        enrolledCount: enrolledKeys.length,
        authorId: author.id,
        authorName: author.name,
        authorRole: author.role,
        createdAt: hoursAgo(r.hours),
      },
    });
    reportByTitle[r.title] = created;
  }

  // Inscripciones
  for (const [title, keys] of Object.entries(enrollments)) {
    const report = reportByTitle[title];
    for (const k of keys) {
      await prisma.enrollment.create({ data: { userId: byKey[k].id, reportId: report.id } });
    }
  }

  console.log(`Seed OK: ${users.length} usuarios, ${zones.length} zonas, ${reports.length} reportes.`);
  console.log(`Contraseña para todas las cuentas: ${PASSWORD}`);
  console.log('Emails:', users.map((u) => u.email).join(', '));
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
