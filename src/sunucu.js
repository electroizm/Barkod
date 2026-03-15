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

// Render reverse proxy arkasinda calistigimiz icin trust proxy gerekli
// Bu olmadan secure cookie (NODE_ENV=production) duzgun calismaz
uygulama.set('trust proxy', 1);

// Middleware
// Büyük nakliye verileri için limit artırıldı (varsayılan 100KB -> 10MB)
uygulama.use(express.json({ limit: '10mb' }));
uygulama.use(express.urlencoded({ extended: true, limit: '10mb' }));

// SPA route listesi (redirect + catch-all icin kullanilir)
const spaRotalar = ['/giris', '/anasayfa', '/cikis-islemleri', '/giris-islemleri',
                    '/stok', '/sayim', '/ayarlar', '/fis/nakliye-arama',
                    '/sevk', '/fis/diger-giris', '/fis/nakliye-okutma',
                    '/fis/teslimat', '/fis/nakliye-okut', '/fis/teslimat-okut', '/fis/on-kayit',
                    '/fis/diger-cikis', '/sayim/okut'];

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

// SESSION_SECRET kontrolu
if (!process.env.SESSION_SECRET) {
    console.error('HATA: SESSION_SECRET environment variable tanimli degil!');
    process.exit(1);
}

// Oturum yapılandırması
uygulama.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: process.env.NODE_ENV === 'production',
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
const sayimRotalari = require('./rotalar/sayim');

// Health check - UptimeRobot ping icin (oturum gerektirmez)
uygulama.get('/api/health', async (istek, yanit) => {
    const sonuc = { durum: 'aktif', zaman: new Date().toISOString() };

    sonuc.node_env = process.env.NODE_ENV || 'undefined';
    sonuc.cookie_secure = process.env.NODE_ENV === 'production';
    sonuc.trust_proxy = uygulama.get('trust proxy') ? true : false;
    sonuc.protocol = istek.protocol;
    sonuc.session_var = istek.session ? (istek.session.kullanici ? 'SET' : 'YOK') : 'NO_SESSION';

    // ?db=1 parametresi ile Supabase baglanti testi
    if (istek.query.db) {
        try {
            const { createClient } = require('@supabase/supabase-js');
            const url = process.env.SUPABASE_URL;
            const key = process.env.SUPABASE_ANON_KEY;
            sonuc.supabase_url = url ? url.substring(0, 30) + '...' : 'YOK';
            sonuc.supabase_key = key ? 'SET (len=' + key.length + ')' : 'YOK';

            if (url && key) {
                const client = createClient(url, key);
                const { count, error } = await client.from('satis_faturasi').select('*', { count: 'exact', head: true });
                sonuc.supabase_test = error ? 'HATA: ' + error.message : 'OK';
                sonuc.satis_faturasi_count = error ? 0 : count;

                // satis_faturasi_okumalari tablosu var mi?
                const { count: c2, error: e2 } = await client.from('satis_faturasi_okumalari').select('*', { count: 'exact', head: true });
                sonuc.okumalari_count = e2 ? 'HATA: ' + e2.message : c2;

                // fatura_okumalari tablosu var mi?
                const { count: c3, error: e3 } = await client.from('fatura_okumalari').select('*', { count: 'exact', head: true });
                sonuc.fatura_okumalari_count = e3 ? 'HATA: ' + e3.message : c3;
            }
        } catch (e) {
            sonuc.supabase_test = 'EXCEPTION: ' + e.message;
        }
    }

    yanit.json(sonuc);
});

// Oturum kontrolu (oturum gerektirmez - frontend bunu kontrol icin kullanir)
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

// Yetkilendirme rotalari (oturum gerektirmez - giris/cikis)
uygulama.use('/api/yetkilendirme', yetkilendirmeRotalari);

// Oturum dogrulama middleware - bundan sonraki tum /api/* rotalari oturum gerektirir
uygulama.use('/api', (istek, yanit, sonraki) => {
    if (!istek.session || !istek.session.kullanici) {
        return yanit.status(401).json({
            success: false,
            message: 'Oturum gecersiz. Lutfen giris yapin.'
        });
    }
    sonraki();
});

// Korumali rotalar (oturum gerektirir)
uygulama.use('/api/dogtas', dogtasRotalari);
uygulama.use('/api/supabase', supabaseRotalari);
uygulama.use('/api/ayarlar', ayarlarRotalari);
uygulama.use('/api/mikro', mikroRotalari);
uygulama.use('/api/stok', stokRotalari);
uygulama.use('/api/cikis', cikisRotalari);
uygulama.use('/api/giris', girisRotalari);
uygulama.use('/api/sevk', sevkRotalari);
uygulama.use('/api/sayim', sayimRotalari);

// Ana sayfa yonlendirmesi (SPA route'larina yonlendir)
uygulama.get('/', (istek, yanit) => {
    if (istek.session.kullanici) {
        yanit.redirect('/anasayfa');
    } else {
        yanit.redirect('/giris');
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
