const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 8086;

app.use(cors());
app.use(express.json());

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        message: 'API is running without database',
        timestamp: new Date().toISOString(),
        version: '1.0.0'
    });
});

// Basic merchant endpoint (mock data)
app.get('/api/v1/merchant', (req, res) => {
    const apiKey = req.headers['x-api-key'];
    
    if (!apiKey) {
        return res.status(401).json({ error: 'API Key required' });
    }
    
    res.json({
        merchant: {
            id: 1,
            code: 'TEST70',
            name: 'Test Merchant',
            apiKey: apiKey,
            status: 'active'
        }
    });
});

// Merchant registration endpoint
app.post('/api/v1/public/merchants', (req, res) => {
    const { name, email } = req.body;
    
    if (!name || !email) {
        return res.status(400).json({ error: 'Name and email are required' });
    }
    
    res.json({
        success: true,
        merchant: {
            id: Math.floor(Math.random() * 1000),
            code: 'TEST' + Math.floor(Math.random() * 100),
            name: name,
            email: email,
            apiKey: 'sbg_' + Math.random().toString(36).substr(2, 24),
            joinToken: 'mj_m_' + Math.random().toString(36).substr(2, 10)
        }
    });
});

app.listen(PORT, '0.0.0.0', () => {
    console.log('🚀 API Server running on port ' + PORT);
});
