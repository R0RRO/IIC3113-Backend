import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const SECRET = process.env.JWT_SECRET || 'dev-secret-cambiame';
const EXPIRES_IN = '7d';

export function hashPassword(plain) {
  return bcrypt.hash(plain, 10);
}

export function comparePassword(plain, hash) {
  return bcrypt.compare(plain, hash);
}

export function signToken(user) {
  return jwt.sign(
    { sub: user.id, role: user.role, name: user.name },
    SECRET,
    { expiresIn: EXPIRES_IN }
  );
}

export function verifyToken(token) {
  return jwt.verify(token, SECRET);
}

// User sin el hash de password, para devolver al cliente
export function publicUser(u) {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
    notifyMode: u.notifyMode,
    hasLocation: u.lat != null && u.lng != null,
    createdAt: u.createdAt,
  };
}
