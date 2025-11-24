const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static('public'));

app.get('/', (req, res) => {
    res.send(
        <!DOCTYPE html>
        <html>
        <head>
            <title>Project 3128 - Loyalty System</title>
            <style>
                body { font-family: Arial, sans-serif; margin: 40px; }
                .container { max-width: 800px; margin: 0 auto; }
                .status { padding: 10px; border-radius: 5px; margin: 10px 0; }
                .success { background: #d4edda; color: #155724; }
                .info { background: #d1ecf1; color: #0c5460; }
            </style>
        </head>
        <body>
            <div class="container">
                <h1>🎯 Project 3128 - Система лояльности</h1>
                <div class="status success">✅ Frontend работает</div>
                <div class="status info">📱 Telegram бот в разработке</div>
                <div class="status info">🚀 API: localhost:8086</div>
                <div class="status info">🗄️ База данных: localhost:5433</div>
            </div>
        </body>
        </html>
    );
});

app.listen(PORT, () => {
    console.log(🌐 Frontend running on port );
});
