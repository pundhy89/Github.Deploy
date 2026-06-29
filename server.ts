import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Body parser for JSON
  app.use(express.json());

  // Vercel API Proxy to bypass CORS issues
  app.use('/api/vercel/*', async (req, res) => {
    const targetUrl = `https://api.vercel.com${req.originalUrl.replace('/api/vercel', '')}`;
    
    try {
      const fetchOptions: RequestInit = {
        method: req.method,
        headers: {
          'Authorization': req.headers.authorization || '',
          'Content-Type': 'application/json'
        },
      };

      if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) && Object.keys(req.body).length > 0) {
        fetchOptions.body = JSON.stringify(req.body);
      }

      const response = await fetch(targetUrl, fetchOptions);
      const data = await response.text();
      
      res.status(response.status).send(data);
    } catch (err: any) {
      console.error('Vercel proxy error:', err);
      res.status(500).json({ error: { message: err.message } });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
