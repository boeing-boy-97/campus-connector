import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import * as functionsMap from './index';

const app = express();
const PORT = process.env.PORT || 5005;
const HOST = '0.0.0.0';

// CORS configuration supporting production Vercel domain and local development
const configuredOrigins = process.env.FRONTEND_URL
  ? process.env.FRONTEND_URL.split(',').map((o) => o.trim())
  : [];

const defaultOrigins = [
  'http://localhost:5173',
  'http://localhost:3000',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:3000',
  'https://campus-connector-student.vercel.app',
];

const allowedOrigins = Array.from(new Set([...configuredOrigins, ...defaultOrigins]));

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (e.g. mobile apps, server-to-server, curl)
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes('*') || allowedOrigins.includes(origin) || process.env.NODE_ENV !== 'production') {
        return callback(null, true);
      }
      return callback(null, true);
    },
    credentials: true,
  })
);

app.use(express.json({ limit: '10mb' }));

// Root endpoint
app.get('/', (req: Request, res: Response) => {
  res.status(200).json({
    name: 'Campus Connect API Backend',
    status: 'online',
    health: '/health',
  });
});

// Health Check Endpoint for Render deployment monitoring
app.get('/health', (req: Request, res: Response) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'campus-connect-backend',
    environment: process.env.NODE_ENV || 'development',
  });
});

// Middleware: Normalize standard REST JSON body format to Firebase Callable { data: ... } format if needed
app.use((req: Request, res: Response, next: NextFunction) => {
  if (req.method === 'POST' && req.body && typeof req.body === 'object' && !('data' in req.body)) {
    req.body = { data: req.body };
  }
  next();
});

// Function Request Dispatcher
const handleFunctionRequest = (req: Request, res: Response, next: NextFunction) => {
  const rawName = req.params.name;
  if (!rawName) return next();

  let name = (Array.isArray(rawName) ? rawName[0] : rawName) || '';
  // Strip prefixes such as asia-south1-
  name = name.replace(/^asia-south1-/, '');

  const handler = (functionsMap as any)[name];
  if (typeof handler === 'function') {
    return handler(req, res);
  }

  return res.status(404).json({
    error: {
      message: `Endpoint or function '${name}' not found`,
      status: 'NOT_FOUND',
    },
  });
};

app.all('/:name', handleFunctionRequest);
app.all('/asia-south1-:name', handleFunctionRequest);
app.all('/:project/asia-south1/:name', handleFunctionRequest);

// Start HTTP Server
app.listen(Number(PORT), HOST, () => {
  console.log(`[Campus Connect] Backend HTTP server running on http://${HOST}:${PORT}`);
  console.log(`[Campus Connect] Health check endpoint: http://${HOST}:${PORT}/health`);
});

export default app;
