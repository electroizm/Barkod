require('dotenv').config();
const express = require('express');
const session = require('express-session');
const path = require('path');

const uygulama = express();
const PORT = process.env.PORT || 3000;

// Middleware
// Büyük nakliye verileri için limit artırıldı (varsayılan 100KB -> 10MB)
uygulama.use(express.json({ limit: '10mb' }));
uygulama.use(express.urlencoded({ extended: true, limit: '10mb' }));
uygulama.use(express.static(path.join(__dirname, '../public')));

// Oturum yapılandırması
uygulama.use(session({
    secret: process.env.SESSION_SECRET || 'gizli-anahtar',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: false, // Production'da true yapılmalı (HTTPS)
        maxAge: 24 * 60 * 60 * 1000 // 24 saat
    }
}));

// Rotalar
const yetkilendirmeRotalari = require('./rotalar/yetkilendirme');
const dogtasRotalari = require('./rotalar/dogtas');
const supabaseRotalari = require('./rotalar/supabase');
const ayarlarRotalari = require('./rotalar/ayarlar');
const mikroRotalari = require('./rotalar/mikro');

uygulama.use('/api/yetkilendirme', yetkilendirmeRotalari);
uygulama.use('/api/dogtas', dogtasRotalari);
uygulama.use('/api/supabase', supabaseRotalari);
uygulama.use('/api/ayarlar', ayarlarRotalari);
uygulama.use('/api/mikro', mikroRotalari);

// Ana sayfa yönlendirmesi
uygulama.get('/', (istek, yanit) => {
    if (istek.session.kullanici) {
        yanit.redirect('/anasayfa.html');
    } else {
        yanit.redirect('/giris.html');
    }
});

// Oturum kontrolü middleware
uygulama.get('/api/oturum-kontrol', (istek, yanit) => {
    if (istek.session.kullanici) {
        yanit.json({
            girisYapildi: true,
            kullanici: istek.session.kullanici
        });
    } else {
        yanit.json({ girisYapildi: false });
    }
});

// Sunucuyu başlat
uygulama.listen(PORT, () => {
    console.log(`Sunucu http://localhost:${PORT} adresinde çalışıyor`);
});
