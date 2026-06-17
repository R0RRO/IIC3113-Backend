# IIC3113-Backend — MingUp API

Backend de MingUp (priorización colaborativa en zonas de catástrofe).
Express + Prisma + SQLite + JWT. Sirve al frontend [IIC3113-Frontend](../IIC3113-Frontend).

## Stack

- **Express** — API REST
- **Prisma + SQLite** — datos en un archivo (`data/mingup.db`)
- **JWT** — auth con 3 roles: `vecino`, `voluntario`, `admin`
- **Notificaciones** — tabla + polling (`GET /notifications`)

## Desarrollo local

```bash
npm install
cp .env.example .env          # edita JWT_SECRET
npm run push                  # crea las tablas en el sqlite
npm run seed                  # datos demo + usuarios de prueba
npm run dev                   # http://localhost:3001
```

Usuarios demo (pass `password123`): `admin@mingup.cl`, `vecino@mingup.cl`, `voluntario@mingup.cl`.

## Deploy (droplet con Docker)

```bash
# en el droplet, dentro del repo clonado
echo "JWT_SECRET=$(openssl rand -hex 32)" > .env
echo 'CORS_ORIGIN=https://tu-frontend' >> .env
docker compose up -d --build
docker compose exec api npm run seed   # opcional, una vez
```

nginx hace proxy de `https://<tu-duckdns>` → `127.0.0.1:3001`.

Actualizar: `git pull && docker compose up -d --build`.

## Endpoints

### Auth
| Método | Ruta | Acceso |
|---|---|---|
| POST | `/auth/register` | público |
| POST | `/auth/login` | público |
| GET  | `/auth/me` | token |

### Zonas
| Método | Ruta | Acceso |
|---|---|---|
| GET | `/zones` | público |
| GET | `/zones/:id` | público |
| GET | `/zones/:id/reports` | público |
| POST | `/zones` | admin |
| PATCH | `/zones/:id` | admin |
| DELETE | `/zones/:id` | admin |

### Reportes
| Método | Ruta | Acceso |
|---|---|---|
| GET | `/reports/:id` | público (token opcional → estado del usuario) |
| POST | `/reports` | token + dentro de zona (GPS) |
| PATCH | `/reports/:id` | dueño o admin |
| DELETE | `/reports/:id` | dueño o admin |
| POST | `/reports/:id/vote` | token + dentro de zona |
| POST/DELETE | `/reports/:id/enroll` | voluntario |
| POST/DELETE | `/reports/:id/complete` | voluntario inscrito |

### Notificaciones
| Método | Ruta | Acceso |
|---|---|---|
| GET | `/notifications?unread=1` | token |
| POST | `/notifications/:id/read` | token |
| POST | `/notifications/read-all` | token |

## Geo-gate

Publicar y votar exigen que el cliente mande su GPS (`userLat`, `userLng`).
El server valida con haversine que esté dentro del `radiusKm` de la zona.
