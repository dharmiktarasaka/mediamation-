import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { connectDB } from './config/db.js';
import authRoutes from './routes/auth.js';
import accountRoutes from './routes/accounts.js';
import postRoutes from './routes/posts.js';
import uploadRoutes from './routes/upload.js';
import { startScheduler } from './scheduler.js';
import path from 'path';
import { fileURLToPath } from 'url';

const app = express();
app.set('trust proxy', true);
const PORT = process.env.PORT || 5000;

const allowedOrigins = [
  'http://localhost:5173',
  'https://mediamation.vercel.app',
  process.env.CLIENT_URL
].filter(Boolean).map(url => url.replace(/\/$/, ''));

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    const cleanOrigin = origin.replace(/\/$/, '');
    if (allowedOrigins.includes(cleanOrigin)) {
      callback(null, true);
    } else {
      callback(null, false);
    }
  },
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));

app.use('/api/auth', authRoutes);
app.use('/api/accounts', accountRoutes);
app.use('/api/posts', postRoutes);
app.use('/api/upload', uploadRoutes);

// Serve uploaded files
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Global error handler — catches multer errors, auth errors, and anything else
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('[Express Error]', err.message);
  const status = err.status || err.statusCode || 500;
  const message = err.message || 'Internal server error';
  res.status(status).json({ message });
});

const startServer = (port, retries = 3) => {
  const srv = app.listen(port, () => {
    console.log(`Server running on port ${port}`);
  });
  srv.on('error', (err) => {
    if (err.code === 'EADDRINUSE' && retries > 0) {
      console.log(`Port ${port} busy, retrying in 1s... (${retries} left)`);
      srv.close(() => setTimeout(() => startServer(port, retries - 1), 1000));
    } else {
      console.error(err);
      process.exit(1);
    }
  });
};

await connectDB();
startScheduler();
startServer(PORT);
// Server configuration reload trigger: active
