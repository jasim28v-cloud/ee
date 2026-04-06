const express = require('express');
const compression = require('compression');
const cors = require('cors');
const path = require('path');
const app = express();

// إعداد المنفذ ليتوافق مع أي سيرفر تلقائياً
const PORT = process.env.PORT || 3000;

// تفعيل تقنيات السرعة والحماية
app.use(compression()); 
app.use(cors());
app.use(express.json());

// تشغيل أي ملفات (HTML, CSS, JS) موجودة في المجلد
app.use(express.static(path.join(__dirname, '.')));

// نقطة فحص النظام (تستخدمها لـ Cron-job)
app.get('/status', (req, res) => {
    res.json({ 
        system: "Online",
        engine: "Universal Joker v99",
        status: "High Performance" 
    });
});

// تشغيل المحرك
app.listen(PORT, () => {
    console.log(`Joker Engine active on port ${PORT} 🚀`);
});
