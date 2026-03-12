/**
 * Barkod Stok Takip Sunucusu
 * Son Güncelleme: 2026-03-12 14:21 (Deploy Trigger)
 */
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

// SPA route listesi (redirect + catch-all icin kullanilir)
const spaRotalar = ['/giris', '/anasayfa', '/cikis-islemleri', '/giris-islemleri',
                    '/stok', '/sayim', '/ayarlar', '/fis/nakliye-arama',
                    '/sevk', '/fis/diger-giris', '/fis/nakliye-okutma',
                    '/fis/teslimat', '/fis/barkod-okut', '/fis/teslimat-okut', '/fis/on-kayit',
                    '/fis/diger-cikis'];

// .html guard: SPA redirect + bilinmeyen .html engelleme (express.static'ten ONCE calisir)
uygulama.use((istek, yanit, sonraki) => {
    if (istek.path.endsWith('.html') && !istek.path.startsWith('/api/')) {
        const temizYol = istek.path.slice(0, -5);
        // Bilinen SPA route → 301 redirect
        if (spaRotalar.includes(temizYol)) {
            return yanit.redirect(301, temizYol);
        }
        // index.html haric tum .html isteklerini engelle (express.static'e ulasmasini onle)
        if (istek.path !== '/index.html') {
            return yanit.status(404).send('Sayfa bulunamad\u0131');
        }
    }
    sonraki();
});

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
const stokRotalari = require('./rotalar/stok');
const cikisRotalari = require('./rotalar/cikis');
const girisRotalari = require('./rotalar/giris');
const sevkRotalari = require('./rotalar/sevk');

uygulama.use('/api/yetkilendirme', yetkilendirmeRotalari);
uygulama.use('/api/dogtas', dogtasRotalari);
uygulama.use('/api/supabase', supabaseRotalari);
uygulama.use('/api/ayarlar', ayarlarRotalari);
uygulama.use('/api/mikro', mikroRotalari);
uygulama.use('/api/stok', stokRotalari);
uygulama.use('/api/cikis', cikisRotalari);
uygulama.use('/api/giris', girisRotalari);
uygulama.use('/api/sevk', sevkRotalari);

// Health check - UptimeRobot ping için
uygulama.get('/api/health', (istek, yanit) => {
    yanit.json({ durum: 'aktif', zaman: new Date().toISOString() });
});

// Ana sayfa yönlendirmesi (SPA route'larina yonlendir)
uygulama.get('/', (istek, yanit) => {
    if (istek.session.kullanici) {
        yanit.redirect('/anasayfa');
    } else {
        yanit.redirect('/giris');
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

// SPA catch-all: Tanimli SPA route'lari icin index.html serve et
uygulama.get('*', (istek, yanit) => {
    // API istekleri haric
    if (istek.path.startsWith('/api/')) {
        return yanit.status(404).json({ hata: 'API endpoint bulunamadi' });
    }
    // Bilinen SPA route'larina index.html don
    if (spaRotalar.includes(istek.path)) {
        return yanit.sendFile(path.join(__dirname, '../public/index.html'));
    }
    // Diger (bilinmeyen) yollar
    yanit.status(404).send('Sayfa bulunamad\u0131');
});

// Sunucuyu başlat
uygulama.listen(PORT, () => {
    console.log(`Sunucu http://localhost:${PORT} adresinde çalışıyor`);
});
