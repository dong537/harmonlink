import express from 'express';
import cors from 'cors';
import { prisma } from '@ipeasy/db';

const app = express();
const PORT = process.env.PORT || 8080;
const API_TOKEN = process.env.API_TOKEN;

if (!API_TOKEN) {
  console.error('❌ API_TOKEN environment variable is required');
  process.exit(1);
}

// Middleware
app.use(cors());
app.use(express.json());

// Auth middleware
const authenticate = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.replace('Bearer ', '');
  
  if (!token || token !== API_TOKEN) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  next();
};

// Health check endpoint (no auth required)
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    nodeId: process.env.NODE_ID || 'unknown',
  });
});

// Create dedicated line
app.post('/lines/create', authenticate, async (req, res) => {
  try {
    const { lineId, inboundConfig, exitProxyConfig } = req.body;
    
    if (!lineId || !inboundConfig || !exitProxyConfig) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    // TODO: Implement actual line creation logic
    // For now, just log and return success
    console.log('📝 Creating line:', {
      lineId,
      inbound: inboundConfig.protocol,
      exit: `${exitProxyConfig.host}:${exitProxyConfig.port}`,
    });
    
    res.json({
      success: true,
      lineId,
      status: 'active',
      createdAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('❌ Line creation failed:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get line status
app.get('/lines/:lineId/status', authenticate, async (req, res) => {
  try {
    const { lineId } = req.params;
    
    // TODO: Implement actual status check
    console.log('🔍 Checking line status:', lineId);
    
    res.json({
      lineId,
      status: 'active',
      uptime: 3600,
      bytesIn: 0,
      bytesOut: 0,
    });
  } catch (error) {
    console.error('❌ Status check failed:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete line
app.post('/lines/:lineId/delete', authenticate, async (req, res) => {
  try {
    const { lineId } = req.params;
    
    // TODO: Implement actual line deletion
    console.log('🗑️  Deleting line:', lineId);
    
    res.json({
      success: true,
      lineId,
      deletedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('❌ Line deletion failed:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`✅ Control Panel API listening on port ${PORT}`);
  console.log(`   Node ID: ${process.env.NODE_ID || 'unknown'}`);
  console.log(`   Health: http://localhost:${PORT}/health`);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('👋 Shutting down gracefully...');
  await prisma.$disconnect();
  process.exit(0);
});
