import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { hashPassword, comparePassword, signToken, publicUser } from '../lib/auth.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

const ROLES = ['vecino', 'voluntario', 'admin'];

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  name: z.string().min(1),
  role: z.enum(ROLES).default('vecino'),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

// POST /auth/register
router.post('/register', async (req, res, next) => {
  try {
    const data = registerSchema.parse(req.body);
    const exists = await prisma.user.findUnique({ where: { email: data.email } });
    if (exists) return res.status(409).json({ error: 'Email ya registrado' });

    const user = await prisma.user.create({
      data: { ...data, password: await hashPassword(data.password) },
    });
    const token = signToken(user);
    res.status(201).json({ token, user: publicUser(user) });
  } catch (err) {
    next(err);
  }
});

// POST /auth/login
router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = loginSchema.parse(req.body);
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !(await comparePassword(password, user.password))) {
      return res.status(401).json({ error: 'Credenciales invalidas' });
    }
    const token = signToken(user);
    res.json({ token, user: publicUser(user) });
  } catch (err) {
    next(err);
  }
});

// POST /auth/location  -- guarda la ultima ubicacion del usuario
const locationSchema = z.object({ lat: z.number(), lng: z.number() });
router.post('/location', requireAuth, async (req, res, next) => {
  try {
    const { lat, lng } = locationSchema.parse(req.body);
    await prisma.user.update({
      where: { id: req.user.id },
      data: { lat, lng, locationAt: new Date() },
    });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// PATCH /auth/preferences  -- modo de notificacion del usuario
const prefsSchema = z.object({ notifyMode: z.enum(['all', 'nearby', 'zones', 'off']) });
router.patch('/preferences', requireAuth, async (req, res, next) => {
  try {
    const data = prefsSchema.parse(req.body);
    const user = await prisma.user.update({ where: { id: req.user.id }, data });
    res.json({ user: publicUser(user) });
  } catch (err) {
    next(err);
  }
});

// GET /auth/me
router.get('/me', requireAuth, async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
    res.json({ user: publicUser(user) });
  } catch (err) {
    next(err);
  }
});

export default router;
