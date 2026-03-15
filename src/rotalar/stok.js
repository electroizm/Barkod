/**
 * Stok Arama - PRGsheet "Stok" Sayfası Entegrasyonu
 */

const express = require('express');
const router = express.Router();
const { google } = require('googleapis');

const GOOGLE_SERVICE_ACCOUNT_EMAIL = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
const GOOGLE_PRIVATE_KEY = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n');
const PRGSHEET_NAME = 'PRGsheet';

// Cache
let stokCache = null;
let cacheZamani = null;
const CACHE_SURESI = 5 * 60 * 1000; // 5 dakika

/**
 * PRGsheet'ten Stok sayfasını oku ve cache'le
 */
async function stokVerisiYukle() {
    if (stokCache && cacheZamani && (Date.now() - cacheZamani < CACHE_SURESI)) {
        return stokCache;
    }

    const auth = new google.auth.JWT(
        GOOGLE_SERVICE_ACCOUNT_EMAIL,
        null,
        GOOGLE_PRIVATE_KEY,
        [
            'https://www.googleapis.com/auth/spreadsheets.readonly',
            'https://www.googleapis.com/auth/drive.readonly'
        ]
    );

    const drive = google.drive({ version: 'v3', auth });
    const driveYanit = await drive.files.list({
        q: `name='${PRGSHEET_NAME}' and mimeType='application/vnd.google-apps.spreadsheet'`,
        fields: 'files(id, name)',
        spaces: 'drive'
    });

    if (!driveYanit.data.files || driveYanit.data.files.length === 0) {
        throw new Error('PRGsheet bulunamadı');
    }

    const spreadsheetId = driveYanit.data.files[0].id;

    const sheets = google.sheets({ version: 'v4', auth });
    const yanit = await sheets.spreadsheets.values.get({
        spreadsheetId: spreadsheetId,
        range: 'Stok'
    });

    const satirlar = yanit.data.values || [];
    if (satirlar.length <= 1) {
        throw new Error('Stok sayfası boş');
    }

    const basliklar = satirlar[0];
    const veriler = [];

    for (let i = 1; i < satirlar.length; i++) {
        const satir = satirlar[i];
        const kayit = {};
        for (let j = 0; j < basliklar.length; j++) {
            kayit[basliklar[j]] = satir[j] || '';
        }
        veriler.push(kayit);
    }

    // Malzeme Adı'na göre sırala
    veriler.sort((a, b) => (a['Malzeme Adı'] || '').localeCompare(b['Malzeme Adı'] || '', 'tr'));

    stokCache = { basliklar, veriler };
    cacheZamani = Date.now();

    return stokCache;
}

/**
 * GET /api/stok/ara?q=ARAMA_TERIMI
 * Malzeme Adı veya Stok Kodu ile arama
 */
router.get('/ara', async (req, res) => {
    try {
        const q = (req.query.q || '').trim().toUpperCase();
        if (!q) {
            return res.json({ success: true, sonuclar: [] });
        }

        const { veriler } = await stokVerisiYukle();

        const kelimeler = q.split(/\s+/).filter(k => k.length > 0);

        const sonuclar = veriler.filter(kayit => {
            const malzemeAdi = (kayit['Malzeme Adı'] || '').toUpperCase();
            const stokKod = Object.values(kayit)[0]?.toString().toUpperCase() || '';
            const tumMetin = malzemeAdi + ' ' + stokKod;
            return kelimeler.every(kelime => {
                // Kısa sayısal kelimeler (1-3 hane) için kelime sınırı kontrolü
                // Böylece "6" sadece " 6 " veya "6 KAPAKLI" ile eşleşir, stok kodu içindeki "6" ile değil
                if (/^\d{1,3}$/.test(kelime)) {
                    const regex = new RegExp('\\b' + kelime + '\\b');
                    return regex.test(tumMetin);
                }
                return tumMetin.includes(kelime);
            });
        });

        return res.json({ success: true, sonuclar });

    } catch (error) {
        console.error('Stok arama hatası:', error.message);
        return res.status(500).json({ success: false, message: 'Stok verisi yüklenemedi: ' + error.message });
    }
});

/**
 * GET /api/stok/cache-temizle
 * Cache'i temizle (yeni veri çekmek için)
 */
router.get('/cache-temizle', (req, res) => {
    stokCache = null;
    cacheZamani = null;
    res.json({ success: true, message: 'Stok cache temizlendi' });
});

module.exports = router;
module.exports.stokVerisiYukle = stokVerisiYukle;
