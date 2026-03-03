/**
 * Mikro SQL Server Entegrasyonu
 * PRGsheet'ten SQL bağlantı bilgilerini okur ve satış faturalarını Supabase'e aktarır
 */

const express = require('express');
const router = express.Router();
const sql = require('mssql');
const { google } = require('googleapis');
const { createClient } = require('@supabase/supabase-js');
const { qrKodParsele, qrKodHash, qrKodValidasyon } = require('../utils/qr-parser');

// Google Sheets bilgileri (.env'den)
const GOOGLE_SERVICE_ACCOUNT_EMAIL = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
const GOOGLE_PRIVATE_KEY = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n');
const PRGSHEET_NAME = 'PRGsheet';

// SQL Server config cache
let SQL_CONFIG = null;
let configYuklendi = false;

// Supabase client
let supabase = null;

// ============================================
// FATURA CACHE SİSTEMİ (PRD uyumlu)
// ============================================
const faturaCache = new Map();
const CACHE_SURESI_MS = 30 * 60 * 1000; // 30 dakika

/**
 * Fatura cache'ini yükle veya güncelle
 */
async function faturaCacheYukle(faturaNo, client, zorlaYenile = false) {
    const mevcutCache = faturaCache.get(faturaNo);
    const simdi = Date.now();

    // Cache varsa ve süresi dolmamışsa kullan
    if (mevcutCache && !zorlaYenile && (simdi - mevcutCache.sonGuncelleme < CACHE_SURESI_MS)) {
        return mevcutCache;
    }

    // Veritabanından yükle
    const { data: kalemler, error: kalemHata } = await client
        .from('satis_faturasi')
        .select('*')
        .eq('evrakno_sira', parseInt(faturaNo))
        .order('stok_kod');

    if (kalemHata) {
        console.error('Fatura cache yükleme hatası:', kalemHata);
        return null;
    }

    // Okunan QR'ları yükle
    const { data: okumalar, error: okumaHata } = await client
        .from('satis_faturasi_okumalari')
        .select('qr_kod, stok_kod, paket_sira, kalem_id')
        .eq('fatura_no', parseInt(faturaNo));

    const okunanQrler = new Set();
    const paketOkumaSayilari = new Map(); // "stok_kod:paket_sira" -> sayı
    const kalemOkumaSayilari = new Map(); // "kalem_id:paket_sira" -> sayı (satır dağıtımı için)

    if (!okumaHata && okumalar) {
        okumalar.forEach(o => {
            okunanQrler.add(o.qr_kod);

            // Paket okuma sayısını hesapla (toplam - stok_kod bazlı)
            if (o.stok_kod && o.paket_sira) {
                const key = `${o.stok_kod}:${o.paket_sira}`;
                paketOkumaSayilari.set(key, (paketOkumaSayilari.get(key) || 0) + 1);
            }

            // Kalem bazlı okuma sayısı (aynı üründen birden fazla satır olduğunda doğru dağıtım için)
            if (o.kalem_id && o.paket_sira) {
                const kalemKey = `${o.kalem_id}:${o.paket_sira}`;
                kalemOkumaSayilari.set(kalemKey, (kalemOkumaSayilari.get(kalemKey) || 0) + 1);
            }
        });
    }

    // Toplam paket sayısını hesapla
    let toplamPaket = 0;
    if (kalemler) {
        kalemler.forEach(k => {
            const miktar = parseFloat(k.miktar) || 1;
            const paketSayisi = parseInt(k.paket_sayisi) || 1;
            toplamPaket += Math.ceil(miktar * paketSayisi);
        });
    }

    const cacheData = {
        kalemler: kalemler || [],
        okunanQrler,
        paketOkumaSayilari,
        kalemOkumaSayilari,
        sonGuncelleme: simdi,
        toplamPaket,
        okunanPaket: okunanQrler.size
    };

    faturaCache.set(faturaNo, cacheData);
    console.log(`Fatura cache yüklendi: ${faturaNo} - ${kalemler?.length || 0} kalem, ${okunanQrler.size} okuma`);

    return cacheData;
}

/**
 * Cache'e yeni okuma ekle
 */
function cacheyeOkumaEkle(faturaNo, qrKod, stokKod, paketSira, kalemId) {
    const cache = faturaCache.get(faturaNo);
    if (cache) {
        cache.okunanQrler.add(qrKod);
        cache.okunanPaket = cache.okunanQrler.size;
        cache.sonGuncelleme = Date.now();

        // Paket okuma sayısını artır (stok_kod bazlı toplam)
        if (stokKod && paketSira) {
            const key = `${stokKod}:${paketSira}`;
            cache.paketOkumaSayilari.set(key, (cache.paketOkumaSayilari.get(key) || 0) + 1);
        }

        // Kalem bazlı okuma sayısını artır (satır dağıtımı için)
        if (kalemId && paketSira) {
            const kalemKey = `${kalemId}:${paketSira}`;
            cache.kalemOkumaSayilari.set(kalemKey, (cache.kalemOkumaSayilari.get(kalemKey) || 0) + 1);
        }
    }
}

/**
 * Cache'den QR okunmuş mu kontrol et
 */
function cachedeQrVarMi(faturaNo, qrKod) {
    const cache = faturaCache.get(faturaNo);
    if (cache) {
        return cache.okunanQrler.has(qrKod);
    }
    return false;
}

/**
 * Cache'den kalem bul (stok_kod ile) - ilk eşleşeni döndürür
 */
function cachedeStokKodBul(faturaNo, stokKod) {
    const cache = faturaCache.get(faturaNo);
    if (!cache) return null;

    return cache.kalemler.find(k =>
        k.stok_kod === stokKod ||
        k.product_code === stokKod ||
        k.stok_kod.startsWith(stokKod + '-')
    );
}

/**
 * stok_kod ile eşleşen bir kalemin eşleşip eşleşmediğini kontrol et
 */
function stokKodEslesiyor(kalem, stokKod) {
    return kalem.stok_kod === stokKod ||
        kalem.product_code === stokKod ||
        kalem.stok_kod.startsWith(stokKod + '-');
}

/**
 * Aynı stok_kod'a sahip TÜM kalemlerin toplam miktarını hesapla
 */
function toplamMiktarBulStokKod(faturaNo, stokKod) {
    const cache = faturaCache.get(faturaNo);
    if (!cache) return 1;

    return cache.kalemler
        .filter(k => stokKodEslesiyor(k, stokKod))
        .reduce((toplam, k) => toplam + (parseFloat(k.miktar) || 1), 0);
}

/**
 * Aynı stok_kod'a sahip kalemlerden kapasitesi olan ilkini bul
 */
function uygunKalemBulStokKod(faturaNo, stokKod, paketSira) {
    const cache = faturaCache.get(faturaNo);
    if (!cache) return null;

    const eslesenKalemler = cache.kalemler.filter(k => stokKodEslesiyor(k, stokKod));
    if (eslesenKalemler.length === 0) return null;

    // Tek satır varsa direkt döndür
    if (eslesenKalemler.length === 1) return eslesenKalemler[0];

    // Birden fazla satır: kapasitesi olan ilk kalemi bul
    for (const kalem of eslesenKalemler) {
        const kalemMiktar = parseFloat(kalem.miktar) || 1;
        const kalemKey = `${kalem.id}:${paketSira}`;
        const kalemOkuma = cache.kalemOkumaSayilari.get(kalemKey) || 0;
        if (kalemOkuma < kalemMiktar) {
            return kalem;
        }
    }

    // Hepsi doluysa ilkini döndür (limit kontrolü yakalayacak)
    return eslesenKalemler[0];
}

/**
 * Cache'den kalem bul (product_code/malzeme_no ile)
 */
function cachedeProductCodeBul(faturaNo, productCode) {
    const cache = faturaCache.get(faturaNo);
    if (!cache) return null;

    // product_code alanı varsa ona göre, yoksa stok_kod ile eşleştir
    return cache.kalemler.find(k =>
        k.product_code === productCode ||
        k.stok_kod === productCode ||
        // 18 haneli malzeme_no'nun son 10 hanesi stok_kod olabilir
        (productCode.length === 18 && k.stok_kod === productCode.slice(-10))
    );
}

/**
 * Bu stok_kod ve paket_sira için daha fazla okuma yapılabilir mi?
 */
function paketOkumasiYapilabilirMi(faturaNo, stokKod, paketSira, maxMiktar) {
    const cache = faturaCache.get(faturaNo);
    if (!cache) return true; // Cache yoksa kontrolü atla

    const key = `${stokKod}:${paketSira}`;
    const mevcutOkuma = cache.paketOkumaSayilari.get(key) || 0;

    return mevcutOkuma < maxMiktar;
}

/**
 * Bu stok_kod ve paket_sira için kaç okuma yapılmış?
 */
function paketOkumaSayisi(faturaNo, stokKod, paketSira) {
    const cache = faturaCache.get(faturaNo);
    if (!cache) return 0;

    const key = `${stokKod}:${paketSira}`;
    return cache.paketOkumaSayilari.get(key) || 0;
}

/**
 * Supabase client'ı al veya oluştur
 */
async function getSupabaseClient() {
    if (supabase) return supabase;

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
        console.error('Supabase bağlantı bilgileri eksik');
        return null;
    }

    supabase = createClient(supabaseUrl, supabaseKey);
    return supabase;
}

/**
 * PRGsheet'ten SQL Server bağlantı bilgilerini yükle
 */
async function sqlConfigYukle() {
    if (configYuklendi && SQL_CONFIG) return SQL_CONFIG;

    try {
        const auth = new google.auth.JWT(
            GOOGLE_SERVICE_ACCOUNT_EMAIL,
            null,
            GOOGLE_PRIVATE_KEY,
            [
                'https://www.googleapis.com/auth/spreadsheets.readonly',
                'https://www.googleapis.com/auth/drive.readonly'
            ]
        );

        // Drive API ile PRGsheet'in ID'sini bul
        const drive = google.drive({ version: 'v3', auth });
        const driveYanit = await drive.files.list({
            q: `name='${PRGSHEET_NAME}' and mimeType='application/vnd.google-apps.spreadsheet'`,
            fields: 'files(id, name)',
            spaces: 'drive'
        });

        if (!driveYanit.data.files || driveYanit.data.files.length === 0) {
            console.error('PRGsheet bulunamadı');
            return null;
        }

        const spreadsheetId = driveYanit.data.files[0].id;

        // Sheets API ile Ayar sayfasını oku
        const sheets = google.sheets({ version: 'v4', auth });
        const yanit = await sheets.spreadsheets.values.get({
            spreadsheetId: spreadsheetId,
            range: 'Ayar'
        });

        const satirlar = yanit.data.values || [];

        if (satirlar.length <= 1) {
            console.error('PRGsheet Ayar sayfası boş');
            return null;
        }

        // Key/Value sözlüğü oluştur
        const headers = satirlar[0];
        let keyIndex = headers.indexOf('Key');
        let valueIndex = headers.indexOf('Value');
        if (keyIndex === -1) keyIndex = 1;
        if (valueIndex === -1) valueIndex = 3;

        const config = {};
        for (let i = 1; i < satirlar.length; i++) {
            const satir = satirlar[i];
            const key = satir[keyIndex]?.trim() || '';
            const value = satir[valueIndex]?.trim() || '';
            if (key) {
                config[key] = value;
            }
        }

        // SQL Server config
        SQL_CONFIG = {
            server: config['SQL_SERVER'] || '192.168.1.17',
            port: parseInt(config['SQL_PORT']) || 1433,
            database: config['SQL_DATABASE'] || 'MikroDB_V14_DOGTAS_12',
            user: config['SQL_USERNAME'] || 'sa',
            password: config['SQL_PASSWORD'] || '',
            options: {
                encrypt: false,
                trustServerCertificate: true,
                enableArithAbort: true
            },
            connectionTimeout: 30000,
            requestTimeout: 60000
        };

        configYuklendi = true;
        console.log(`SQL Server config PRGsheet'ten yüklendi: ${SQL_CONFIG.server}:${SQL_CONFIG.port}`);
        return SQL_CONFIG;

    } catch (hata) {
        console.error('SQL config yükleme hatası:', hata.message);
        return null;
    }
}

/**
 * POST /api/mikro/fatura-yukle
 * Mikro'dan satış faturalarını çekip Supabase'e kaydet
 */
router.post('/fatura-yukle', async (req, res) => {
    try {
        // SQL config yükle
        const config = await sqlConfigYukle();
        if (!config) {
            return res.status(500).json({
                success: false,
                message: 'SQL Server bağlantı bilgileri yüklenemedi'
            });
        }

        // Supabase client
        const client = await getSupabaseClient();
        if (!client) {
            return res.status(500).json({
                success: false,
                message: 'Supabase bağlantısı kurulamadı'
            });
        }

        // Supabase'den en büyük evrakno_sira değerini al (artımlı veri çekme)
        const { data: maxData } = await client
            .from('satis_faturasi')
            .select('evrakno_sira')
            .order('evrakno_sira', { ascending: false })
            .limit(1);

        const sonEvrakSira = maxData?.[0]?.evrakno_sira || 0;
        console.log(`Supabase'deki son evrak sıra: ${sonEvrakSira}`);

        // SQL Server'a bağlan
        console.log('Mikro SQL Server\'a bağlanılıyor...');
        const pool = await sql.connect(config);

        // Faturaları çek (sadece yeni kayıtlar - evrakno_sira > sonEvrakSira)
        const sorgu = `
            SELECT
                sth.sth_evrakno_seri,
                sth.sth_evrakno_sira,
                CONVERT(DATE, sth.sth_tarih) AS tarih,
                sth.sth_stok_kod,
                sth.sth_miktar,
                sth.sth_cikis_depo_no,
                dbo.fn_StokHarEvrTip(sth.sth_evraktip) AS evrak_adi,
                cha.cha_kod AS cari_kodu,
                dbo.fn_CarininIsminiBul(cha.cha_cari_cins, cha.cha_kod) AS cari_adi,
                bar.bar_serino_veya_bagkodu AS bag_kodu,
                sto.sto_isim AS malzeme_adi
            FROM dbo.STOK_HAREKETLERI sth WITH (NOLOCK)
            LEFT JOIN dbo.CARI_HESAP_HAREKETLERI cha WITH (NOLOCK)
                ON sth.sth_evrakno_seri = cha.cha_evrakno_seri
                AND sth.sth_evrakno_sira = cha.cha_evrakno_sira
                AND cha.cha_evrak_tip = 63
            LEFT JOIN dbo.BARKOD_TANIMLARI bar WITH (NOLOCK)
                ON sth.sth_stok_kod = bar.bar_stokkodu
            LEFT JOIN dbo.STOKLAR sto WITH (NOLOCK)
                ON sto.sto_kod = sth.sth_stok_kod
                AND (sto.sto_pasif_fl IS NULL OR sto.sto_pasif_fl = 0)
            WHERE sth.sth_evraktip = 4
                AND sth.sth_tarih > '2026-01-01'
                AND sth.sth_evrakno_sira > @sonEvrakSira
            ORDER BY sth.sth_evrakno_sira DESC
        `;

        const result = await pool.request()
            .input('sonEvrakSira', sql.Int, sonEvrakSira)
            .query(sorgu);
        const faturalar = result.recordset;

        // Bağlantıyı kapat
        await pool.close();

        if (faturalar.length === 0) {
            return res.json({
                success: true,
                message: 'Mikro\'dan aktarılmamış Satış Faturası bulunamadı.',
                eklenen: 0
            });
        }

        // Benzersiz productCode'ları topla (ilk 10 karakter)
        const productCodeSet = new Set();
        for (const fatura of faturalar) {
            if (fatura.sth_stok_kod) {
                const productCode = fatura.sth_stok_kod.substring(0, 10);
                productCodeSet.add(productCode);
            }
        }
        const productCodelar = Array.from(productCodeSet);
        console.log(`${productCodelar.length} benzersiz productCode bulundu`);

        // Doğtaş API'den paket bilgilerini çek
        let paketBilgileri = {};
        try {
            const dogtasResponse = await fetch('http://localhost:3000/api/dogtas/urun-paketleri', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ stokKodlari: productCodelar })
            });
            const dogtasData = await dogtasResponse.json();

            if (dogtasData.success && dogtasData.sonuclar) {
                for (const sonuc of dogtasData.sonuclar) {
                    if (sonuc.basarili && sonuc.veri) {
                        paketBilgileri[sonuc.stokKod] = {
                            productDesc: sonuc.veri.productDesc,
                            paketSayisi: sonuc.veri.paketSayisi
                        };
                    }
                }
            }
            console.log(`${Object.keys(paketBilgileri).length} ürün için paket bilgisi alındı`);
        } catch (apiError) {
            console.error('Doğtaş API hatası:', apiError.message);
        }

        // Supabase'e kaydet (upsert)
        let eklenen = 0;
        let atlanan = 0;

        for (const fatura of faturalar) {
            // productCode: ilk 10 karakter
            const productCode = fatura.sth_stok_kod ? fatura.sth_stok_kod.substring(0, 10) : null;
            const paketBilgisi = productCode ? paketBilgileri[productCode] : null;

            const kayit = {
                evrakno_seri: fatura.sth_evrakno_seri || '',
                evrakno_sira: fatura.sth_evrakno_sira,
                tarih: fatura.tarih,
                stok_kod: fatura.sth_stok_kod,
                miktar: fatura.sth_miktar,
                cikis_depo_no: fatura.sth_cikis_depo_no,
                evrak_adi: fatura.evrak_adi || 'Satış Faturası',
                cari_kodu: fatura.cari_kodu || '',
                cari_adi: fatura.cari_adi || '',
                // Yeni sütunlar
                product_code: productCode,
                product_desc: paketBilgisi?.productDesc || null,
                paket_sayisi: paketBilgisi?.paketSayisi || 1, // NULL ise varsayılan 1
                bag_kodu: fatura.bag_kodu || null,
                malzeme_adi: fatura.malzeme_adi || null
            };

            const { error } = await client
                .from('satis_faturasi')
                .upsert(kayit, {
                    onConflict: 'evrakno_seri,evrakno_sira,stok_kod'
                });

            if (error) {
                console.error('Kayıt hatası:', error.message);
                atlanan++;
            } else {
                eklenen++;
            }
        }

        // Benzersiz evrak sayısını hesapla (evrakno_seri + evrakno_sira kombinasyonu)
        const benzersizEvraklar = new Set();
        for (const fatura of faturalar) {
            const evrakKey = `${fatura.sth_evrakno_seri || ''}_${fatura.sth_evrakno_sira}`;
            benzersizEvraklar.add(evrakKey);
        }
        const evrakSayisi = benzersizEvraklar.size;

        return res.json({
            success: true,
            message: `${evrakSayisi} Satış Faturası (${eklenen} Satır) Kaydedildi.`,
            evrakSayisi,
            eklenen,
            atlanan,
            toplam: faturalar.length
        });

    } catch (error) {
        console.error('Fatura yükleme hatası:', error);
        return res.status(500).json({
            success: false,
            message: 'Fatura yükleme hatası: ' + error.message
        });
    }
});

/**
 * GET /api/mikro/fatura/:faturaNo
 * Belirli bir faturanın detaylarını getir
 */
router.get('/fatura/:faturaNo', async (req, res) => {
    try {
        const { faturaNo } = req.params;

        const client = await getSupabaseClient();
        if (!client) {
            return res.status(500).json({
                success: false,
                message: 'Veritabanı bağlantısı kurulamadı'
            });
        }

        let { data, error } = await client
            .from('satis_faturasi')
            .select('*')
            .eq('evrakno_sira', parseInt(faturaNo))
            .order('stok_kod');

        if (error) {
            return res.status(500).json({
                success: false,
                message: 'Fatura sorgu hatası: ' + error.message
            });
        }

        if (!data || data.length === 0) {
            // Supabase'de yok, Mikro'dan çekmeyi dene
            try {
                const config = await sqlConfigYukle();
                if (!config) {
                    return res.status(404).json({ success: false, message: 'Fatura bulunamadı ve SQL bağlantı bilgileri yüklenemedi' });
                }

                const pool = await sql.connect(config);
                const sorgu = `
                    SELECT
                        sth.sth_evrakno_seri,
                        sth.sth_evrakno_sira,
                        CONVERT(DATE, sth.sth_tarih) AS tarih,
                        sth.sth_stok_kod,
                        sth.sth_miktar,
                        sth.sth_cikis_depo_no,
                        dbo.fn_StokHarEvrTip(sth.sth_evraktip) AS evrak_adi,
                        cha.cha_kod AS cari_kodu,
                        dbo.fn_CarininIsminiBul(cha.cha_cari_cins, cha.cha_kod) AS cari_adi,
                        bar.bar_serino_veya_bagkodu AS bag_kodu,
                        sto.sto_isim AS malzeme_adi
                    FROM dbo.STOK_HAREKETLERI sth WITH (NOLOCK)
                    LEFT JOIN dbo.CARI_HESAP_HAREKETLERI cha WITH (NOLOCK)
                        ON sth.sth_evrakno_seri = cha.cha_evrakno_seri
                        AND sth.sth_evrakno_sira = cha.cha_evrakno_sira
                        AND cha.cha_evrak_tip = 63
                    LEFT JOIN dbo.BARKOD_TANIMLARI bar WITH (NOLOCK)
                        ON sth.sth_stok_kod = bar.bar_stokkodu
                    LEFT JOIN dbo.STOKLAR sto WITH (NOLOCK)
                        ON sto.sto_kod = sth.sth_stok_kod
                        AND (sto.sto_pasif_fl IS NULL OR sto.sto_pasif_fl = 0)
                    WHERE sth.sth_evraktip = 4
                        AND (sth.sth_evrakno_sira = @faturaNo OR sth.sth_evrakno_sira = @faturaNoNeg)
                    ORDER BY sth.sth_stok_kod
                `;

                const faturaNoInt = parseInt(faturaNo);
                const result = await pool.request()
                    .input('faturaNo', sql.Int, faturaNoInt)
                    .input('faturaNoNeg', sql.Int, -Math.abs(faturaNoInt))
                    .query(sorgu);
                const faturalar = result.recordset;
                await pool.close();

                if (faturalar.length === 0) {
                    return res.status(404).json({ success: false, message: 'Fatura bulunamadı' });
                }

                // Doğtaş API'den paket bilgilerini çek
                const productCodeSet = new Set();
                for (const f of faturalar) {
                    if (f.sth_stok_kod) productCodeSet.add(f.sth_stok_kod.substring(0, 10));
                }

                let paketBilgileri = {};
                try {
                    const dogtasResponse = await fetch('http://localhost:3000/api/dogtas/urun-paketleri', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ stokKodlari: Array.from(productCodeSet) })
                    });
                    const dogtasData = await dogtasResponse.json();
                    if (dogtasData.success && dogtasData.sonuclar) {
                        for (const sonuc of dogtasData.sonuclar) {
                            if (sonuc.basarili && sonuc.veri) {
                                paketBilgileri[sonuc.stokKod] = {
                                    productDesc: sonuc.veri.productDesc,
                                    paketSayisi: sonuc.veri.paketSayisi
                                };
                            }
                        }
                    }
                } catch (apiError) {
                    console.error('Doğtaş API hatası:', apiError.message);
                }

                // Supabase'e kaydet
                for (const f of faturalar) {
                    const productCode = f.sth_stok_kod ? f.sth_stok_kod.substring(0, 10) : null;
                    const paketBilgisi = productCode ? paketBilgileri[productCode] : null;

                    await client.from('satis_faturasi').upsert({
                        evrakno_seri: f.sth_evrakno_seri || '',
                        evrakno_sira: f.sth_evrakno_sira,
                        tarih: f.tarih,
                        stok_kod: f.sth_stok_kod,
                        miktar: f.sth_miktar,
                        cikis_depo_no: f.sth_cikis_depo_no,
                        evrak_adi: f.evrak_adi || 'Satış Faturası',
                        cari_kodu: f.cari_kodu || '',
                        cari_adi: f.cari_adi || '',
                        product_code: productCode,
                        product_desc: paketBilgisi?.productDesc || null,
                        paket_sayisi: paketBilgisi?.paketSayisi || 1,
                        bag_kodu: f.bag_kodu || null,
                        malzeme_adi: f.malzeme_adi || null
                    }, { onConflict: 'evrakno_seri,evrakno_sira,stok_kod' });
                }

                // Kaydedilen faturayı Supabase'den tekrar çek
                const { data: yeniData } = await client
                    .from('satis_faturasi')
                    .select('*')
                    .eq('evrakno_sira', parseInt(faturaNo))
                    .order('stok_kod');

                if (!yeniData || yeniData.length === 0) {
                    return res.status(404).json({ success: false, message: 'Fatura Mikro\'dan çekildi ancak kaydedilemedi' });
                }

                // Başarıyla import edildi, aşağıda gösterilecek
                data = yeniData;

            } catch (mikroError) {
                console.error('Mikro\'dan fatura çekme hatası:', mikroError.message);
                return res.status(500).json({ success: false, message: 'Mikro bağlantı hatası: ' + mikroError.message });
            }
        }

        // Toplam miktar ve paket sayısı hesapla
        let toplamMiktar = 0;
        let toplamPaket = 0;
        data.forEach(kalem => {
            toplamMiktar += parseFloat(kalem.miktar) || 0;
            toplamPaket += parseInt(kalem.paket_sayisi) || 1;
        });

        return res.json({
            success: true,
            fatura: {
                evrakno_seri: data[0].evrakno_seri,
                evrakno_sira: data[0].evrakno_sira,
                tarih: data[0].tarih,
                cari_kodu: data[0].cari_kodu,
                cari_adi: data[0].cari_adi,
                evrak_adi: data[0].evrak_adi,
                toplam_kalem: Math.ceil(toplamMiktar),
                toplam_miktar: toplamMiktar,
                toplam_paket: toplamPaket
            },
            kalemler: data
        });

    } catch (error) {
        console.error('Fatura detay hatası:', error);
        return res.status(500).json({
            success: false,
            message: 'Sunucu hatası: ' + error.message
        });
    }
});

/**
 * GET /api/mikro/acik-faturalar
 * Okutulması bitmemiş faturaları listele
 */
router.get('/acik-faturalar', async (req, res) => {
    try {
        const client = await getSupabaseClient();
        if (!client) {
            return res.status(500).json({
                success: false,
                message: 'Veritabanı bağlantısı kurulamadı'
            });
        }

        // Tüm faturaları grupla
        const { data: faturalar, error } = await client
            .from('satis_faturasi')
            .select('evrakno_seri, evrakno_sira, tarih, cari_adi, miktar, paket_sayisi')
            .order('evrakno_sira', { ascending: false });

        if (error) {
            return res.status(500).json({
                success: false,
                message: 'Fatura listesi hatası: ' + error.message
            });
        }

        // Faturaları grupla
        const faturaGruplari = {};
        for (const kayit of faturalar || []) {
            const key = `${kayit.evrakno_seri}-${kayit.evrakno_sira}`;
            if (!faturaGruplari[key]) {
                faturaGruplari[key] = {
                    evrakno_seri: kayit.evrakno_seri,
                    evrakno_sira: kayit.evrakno_sira,
                    tarih: kayit.tarih,
                    cari_adi: kayit.cari_adi,
                    toplam_paket: 0
                };
            }
            // Her kalem için miktar * paket_sayisi
            const miktar = parseFloat(kayit.miktar) || 1;
            const paketSayisi = parseInt(kayit.paket_sayisi) || 1;
            faturaGruplari[key].toplam_paket += Math.ceil(miktar * paketSayisi);
        }

        // Her fatura için okunan paket sayısını al
        const acikFaturalar = [];
        for (const key of Object.keys(faturaGruplari)) {
            const fatura = faturaGruplari[key];

            // satis_faturasi_okumalari tablosundan okunan sayısını al
            const { count, error: countError } = await client
                .from('satis_faturasi_okumalari')
                .select('*', { count: 'exact', head: true })
                .eq('fatura_no', fatura.evrakno_sira);

            const okunanPaket = countError ? 0 : (count || 0);

            // Açık fatura = okunan < toplam
            if (okunanPaket < fatura.toplam_paket) {
                acikFaturalar.push({
                    ...fatura,
                    okunan_paket: okunanPaket,
                    kalan_paket: fatura.toplam_paket - okunanPaket
                });
            }
        }

        // Tarihe göre sırala
        acikFaturalar.sort((a, b) => b.evrakno_sira - a.evrakno_sira);

        return res.json({
            success: true,
            faturalar: acikFaturalar,
            toplam: acikFaturalar.length
        });

    } catch (error) {
        console.error('Açık faturalar hatası:', error);
        return res.status(500).json({
            success: false,
            message: 'Sunucu hatası: ' + error.message
        });
    }
});

/**
 * GET /api/mikro/fatura-durumu/:faturaNo
 * Faturanın okutma durumunu getir
 */
router.get('/fatura-durumu/:faturaNo', async (req, res) => {
    try {
        const { faturaNo } = req.params;

        const client = await getSupabaseClient();
        if (!client) {
            return res.status(500).json({
                success: false,
                message: 'Veritabanı bağlantısı kurulamadı'
            });
        }

        // Fatura kalemlerini al
        const { data: kalemler, error } = await client
            .from('satis_faturasi')
            .select('*')
            .eq('evrakno_sira', parseInt(faturaNo))
            .order('stok_kod');

        if (error) {
            return res.status(500).json({
                success: false,
                message: 'Fatura sorgu hatası: ' + error.message
            });
        }

        if (!kalemler || kalemler.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Fatura bulunamadı'
            });
        }

        // Her kalem için okunan paket sayısını hesapla
        let toplamPaket = 0;
        let okunanPaket = 0;

        const kalemlerDetay = [];
        for (const kalem of kalemler) {
            const miktar = parseFloat(kalem.miktar) || 1;
            const paketSayisi = parseInt(kalem.paket_sayisi) || 1;
            const beklenenPaket = Math.ceil(miktar * paketSayisi);
            toplamPaket += beklenenPaket;

            // Bu kalem için okunan paket sayısını al
            const { count, error: countError } = await client
                .from('satis_faturasi_okumalari')
                .select('*', { count: 'exact', head: true })
                .eq('fatura_no', parseInt(faturaNo))
                .eq('kalem_id', kalem.id);

            const kalemOkunan = countError ? 0 : (count || 0);
            okunanPaket += kalemOkunan;

            kalemlerDetay.push({
                id: kalem.id,
                stok_kod: kalem.stok_kod,
                malzeme_adi: kalem.malzeme_adi,
                product_desc: kalem.product_desc,
                miktar: kalem.miktar,
                beklenen_paket: beklenenPaket,
                okunan_paket: kalemOkunan,
                cikis_depo_no: kalem.cikis_depo_no
            });
        }

        const kalanPaket = toplamPaket - okunanPaket;
        const tamamlanmaYuzdesi = toplamPaket > 0 ? Math.round((okunanPaket / toplamPaket) * 100) : 0;

        return res.json({
            success: true,
            fatura: {
                evrakno_seri: kalemler[0].evrakno_seri,
                evrakno_sira: kalemler[0].evrakno_sira,
                tarih: kalemler[0].tarih,
                cari_kodu: kalemler[0].cari_kodu,
                cari_adi: kalemler[0].cari_adi,
                evrak_adi: kalemler[0].evrak_adi
            },
            kalemler: kalemlerDetay,
            toplam_paket: toplamPaket,
            okunan_paket: okunanPaket,
            kalan_paket: kalanPaket,
            tamamlanma_yuzdesi: tamamlanmaYuzdesi
        });

    } catch (error) {
        console.error('Fatura durumu hatası:', error);
        return res.status(500).json({
            success: false,
            message: 'Sunucu hatası: ' + error.message
        });
    }
});

/**
 * GET /api/mikro/okunan-qrler/:faturaNo
 * Fatura için okunan QR kodları listele (cache senkronizasyonu için)
 */
router.get('/okunan-qrler/:faturaNo', async (req, res) => {
    try {
        const { faturaNo } = req.params;

        const client = await getSupabaseClient();
        if (!client) {
            return res.status(500).json({
                success: false,
                message: 'Veritabanı bağlantısı kurulamadı'
            });
        }

        const { data, error } = await client
            .from('satis_faturasi_okumalari')
            .select('qr_kod')
            .eq('fatura_no', parseInt(faturaNo));

        if (error) {
            return res.status(500).json({
                success: false,
                message: 'Sorgu hatası: ' + error.message
            });
        }

        const okunanQrler = (data || []).map(d => d.qr_kod);

        return res.json({
            success: true,
            okunan_qrler: okunanQrler
        });

    } catch (error) {
        console.error('Okunan QR listesi hatası:', error);
        return res.status(500).json({
            success: false,
            message: 'Sunucu hatası: ' + error.message
        });
    }
});

/**
 * POST /api/mikro/qr-okut
 * QR kod okutma - PRD uyumlu (cache + QR parser + limit kontrolü)
 */
router.post('/qr-okut', async (req, res) => {
    try {
        let { fatura_no, qr_kod, kullanici } = req.body;

        // 1. Parametre kontrolü
        if (!fatura_no) {
            return res.json({
                success: false,
                message: 'Fatura numarası gerekli',
                hata_tipi: 'MISSING_FATURA'
            });
        }

        if (!qr_kod) {
            return res.json({
                success: false,
                message: 'QR kod gerekli',
                hata_tipi: 'MISSING_QR'
            });
        }

        const client = await getSupabaseClient();
        if (!client) {
            return res.json({
                success: false,
                message: 'Veritabanı bağlantısı kurulamadı',
                hata_tipi: 'DB_CONNECTION'
            });
        }

        // 2. QR kodu parse et ve validate et
        const qrBilgi = qrKodValidasyon(qr_kod);

        let stokKod, paketSira, paketToplam;

        if (qrBilgi.basarili) {
            // GS1 formatında QR kod (Doğtaş gibi)
            // Normalize edilmiş QR kodu kullan (tarayıcı prefix'leri temizlenmiş)
            qr_kod = qrBilgi.qrKodHam;
            // malzemeNo 18 hane, son 10 hanesi stok_kod olabilir
            stokKod = qrBilgi.malzemeNo.slice(-10); // Son 10 hane
            paketSira = qrBilgi.paketSira;
            paketToplam = qrBilgi.paketToplam;
            console.log(`GS1 QR parse edildi: stok=${stokKod}, paket=${paketSira}/${paketToplam}`);
        } else {
            // Basit format: STOK_KOD|PAKET_SIRA|TOPLAM veya sadece STOK_KOD
            const qrParcalari = qr_kod.split('|');
            stokKod = qrParcalari[0] || qr_kod;
            paketSira = parseInt(qrParcalari[1]) || 1;
            paketToplam = parseInt(qrParcalari[2]) || 1;
            console.log(`Basit QR parse edildi: stok=${stokKod}, paket=${paketSira}/${paketToplam}`);
        }

        // 3. Cache'i yükle (yoksa veritabanından çeker)
        const cache = await faturaCacheYukle(fatura_no, client);
        if (!cache) {
            return res.json({
                success: false,
                message: 'Fatura bilgileri yüklenemedi',
                hata_tipi: 'CACHE_ERROR'
            });
        }

        // 4. HIZLI KONTROL: Bu QR daha önce okunmuş mu? (Cache'den - O(1))
        if (cachedeQrVarMi(fatura_no, qr_kod)) {
            return res.json({
                success: false,
                message: 'Bu paket zaten okundu!',
                hata_tipi: 'DUPLICATE_QR',
                from_cache: true
            });
        }

        // 5. Eşleşen kalemi bul (Cache'den)
        let eslesenKalem = null;

        // Önce product_code ile dene (GS1 için)
        if (qrBilgi.basarili) {
            eslesenKalem = cachedeProductCodeBul(fatura_no, qrBilgi.malzemeNo);
        }

        // Bulunamadıysa stok_kod ile dene - önce var mı kontrol et
        if (!eslesenKalem) {
            const herhangiKalem = cachedeStokKodBul(fatura_no, stokKod);
            if (!herhangiKalem) {
                return res.json({
                    success: false,
                    message: `Bu ürün (${stokKod}) faturada bulunamadı!`,
                    hata_tipi: 'NOT_FOUND_STANDARD',
                    detay: { stok_kod: stokKod }
                });
            }
            // Kapasitesi olan uygun kalemi bul (aynı üründen birden fazla satır olabilir)
            eslesenKalem = uygunKalemBulStokKod(fatura_no, stokKod, paketSira);
            if (!eslesenKalem) eslesenKalem = herhangiKalem;
        }

        // 6. PAKET OKUMA LİMİT KONTROLÜ
        // Aynı stok_kod'dan birden fazla satır olabilir, TOPLAM miktarı hesapla
        const toplamMiktar = toplamMiktarBulStokKod(fatura_no, stokKod);

        if (!paketOkumasiYapilabilirMi(fatura_no, stokKod, paketSira, toplamMiktar)) {
            const mevcutOkuma = paketOkumaSayisi(fatura_no, stokKod, paketSira);
            return res.json({
                success: false,
                message: `${eslesenKalem.malzeme_adi || eslesenKalem.product_desc || stokKod} (${paketSira}/${paketToplam}) için tüm okumalar tamamlandı!`,
                hata_tipi: 'PAKET_LIMIT_ASILDI',
                detay: {
                    stok_kod: stokKod,
                    paket_sira: paketSira,
                    paket_toplam: paketToplam,
                    miktar: toplamMiktar,
                    okunan: mevcutOkuma
                }
            });
        }

        // 7. Okumayı veritabanına kaydet
        const okumaKaydi = {
            fatura_no: parseInt(fatura_no),
            kalem_id: eslesenKalem.id,
            qr_kod: qr_kod,
            qr_hash: qrKodHash(qr_kod),
            stok_kod: stokKod,
            paket_sira: paketSira,
            paket_toplam: paketToplam,
            kullanici: kullanici || 'bilinmiyor',
            created_at: new Date().toISOString()
        };

        const { error: insertError } = await client
            .from('satis_faturasi_okumalari')
            .insert(okumaKaydi);

        if (insertError) {
            // Unique constraint hatası - duplicate
            if (insertError.code === '23505') {
                cacheyeOkumaEkle(fatura_no, qr_kod, stokKod, paketSira, eslesenKalem.id);
                return res.json({
                    success: false,
                    message: 'Bu paket zaten okundu!',
                    hata_tipi: 'DUPLICATE_QR'
                });
            }

            console.error('Okuma kayıt hatası:', insertError);
            return res.json({
                success: false,
                message: 'Okuma kaydedilemedi: ' + insertError.message,
                hata_tipi: 'INSERT_ERROR'
            });
        }

        // 8. Başarılı! Cache'i güncelle
        cacheyeOkumaEkle(fatura_no, qr_kod, stokKod, paketSira, eslesenKalem.id);

        // Güncel cache'den istatistik al
        const guncelCache = faturaCache.get(fatura_no);

        return res.json({
            success: true,
            message: `${eslesenKalem.malzeme_adi || eslesenKalem.product_desc || stokKod} (${paketSira}/${paketToplam})`,
            eslesen_kalem: {
                id: eslesenKalem.id,
                stok_kod: stokKod,
                malzeme_adi: eslesenKalem.malzeme_adi || eslesenKalem.product_desc || stokKod,
                miktar: eslesenKalem.miktar
            },
            paket_bilgi: {
                sira: paketSira,
                toplam: paketToplam
            },
            fatura_kalan_paket: guncelCache ? (guncelCache.toplamPaket - guncelCache.okunanPaket) : 0,
            fatura_okunan_paket: guncelCache?.okunanPaket || 0
        });

    } catch (error) {
        console.error('QR okutma hatası:', error);
        return res.json({
            success: false,
            message: 'Sunucu hatası: ' + error.message,
            hata_tipi: 'SERVER_ERROR'
        });
    }
});

/**
 * GET /api/mikro/malzeme-paketler/:faturaNo/:kalemId
 * Bir kalem için paket detayları
 */
router.get('/malzeme-paketler/:faturaNo/:kalemId', async (req, res) => {
    try {
        const { faturaNo, kalemId } = req.params;

        const client = await getSupabaseClient();
        if (!client) {
            return res.status(500).json({
                success: false,
                message: 'Veritabanı bağlantısı kurulamadı'
            });
        }

        // Kalem bilgisini al
        const { data: kalem, error: kalemError } = await client
            .from('satis_faturasi')
            .select('*')
            .eq('id', parseInt(kalemId))
            .single();

        if (kalemError || !kalem) {
            return res.status(404).json({
                success: false,
                message: 'Kalem bulunamadı'
            });
        }

        const miktar = parseFloat(kalem.miktar) || 1;
        const miktarInt = Math.ceil(miktar);
        const paketSayisi = parseInt(kalem.paket_sayisi) || 1;

        // Bu kalem için okunan paketleri al
        const { data: okumalar, error: okumaError } = await client
            .from('satis_faturasi_okumalari')
            .select('paket_sira')
            .eq('fatura_no', parseInt(faturaNo))
            .eq('kalem_id', parseInt(kalemId));

        // Her paket_sira icin okuma sayisini hesapla
        const okumaSayilari = {};
        (okumalar || []).forEach(o => {
            const ps = o.paket_sira;
            okumaSayilari[ps] = (okumaSayilari[ps] || 0) + 1;
        });

        // Paket listesi: P1...P{paketSayisi}, her biri beklenen=miktarInt
        const paketler = [];
        for (let i = 1; i <= paketSayisi; i++) {
            paketler.push({
                paket_sira: i,
                beklenen: miktarInt,
                okunan: okumaSayilari[i] || 0
            });
        }

        return res.json({
            success: true,
            paketler
        });

    } catch (error) {
        console.error('Malzeme paketler hatası:', error);
        return res.status(500).json({
            success: false,
            message: 'Sunucu hatası: ' + error.message
        });
    }
});

/**
 * POST /api/mikro/toplu-okut
 * Bir kalemin okunmamış paketlerini toplu olarak okunmuş say
 */
router.post('/toplu-okut', async (req, res) => {
    try {
        const { fatura_no, kalem_id, kullanici } = req.body;

        if (!fatura_no || !kalem_id) {
            return res.json({
                success: false,
                message: 'Fatura numarası ve kalem ID gerekli'
            });
        }

        const client = await getSupabaseClient();
        if (!client) {
            return res.json({
                success: false,
                message: 'Veritabanı bağlantısı kurulamadı'
            });
        }

        // Kalem bilgisini al
        const { data: kalem, error: kalemError } = await client
            .from('satis_faturasi')
            .select('*')
            .eq('id', parseInt(kalem_id))
            .eq('evrakno_sira', parseInt(fatura_no))
            .single();

        if (kalemError || !kalem) {
            return res.json({
                success: false,
                message: 'Kalem bulunamadı'
            });
        }

        const miktar = parseFloat(kalem.miktar) || 1;
        const miktarInt = Math.ceil(miktar);
        const paketSayisi = parseInt(kalem.paket_sayisi) || 1;

        // Bu kalem için mevcut okumaları al
        const { data: mevcutOkumalar, error: okumaError } = await client
            .from('satis_faturasi_okumalari')
            .select('paket_sira')
            .eq('fatura_no', parseInt(fatura_no))
            .eq('kalem_id', parseInt(kalem_id));

        // Her paket_sira icin mevcut okuma sayisini hesapla
        const okumaSayilari = {};
        (mevcutOkumalar || []).forEach(o => {
            const ps = o.paket_sira;
            okumaSayilari[ps] = (okumaSayilari[ps] || 0) + 1;
        });

        // Benzersiz batch ID: zaman damgası + rastgele suffix
        const batchId = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;

        // Eksik okumalari bul: her paket_sira icin miktarInt kadar okuma olmali
        const kayitlar = [];
        for (let ps = 1; ps <= paketSayisi; ps++) {
            const mevcut = okumaSayilari[ps] || 0;
            const eksik = miktarInt - mevcut;
            for (let k = 0; k < eksik; k++) {
                const qrKod = `MANUEL_TOPLU_${fatura_no}_${kalem.id}_P${ps}_${batchId}_${k}`;
                kayitlar.push({
                    fatura_no: parseInt(fatura_no),
                    kalem_id: parseInt(kalem_id),
                    qr_kod: qrKod,
                    qr_hash: qrKodHash(qrKod),
                    stok_kod: kalem.stok_kod,
                    paket_sira: ps,
                    paket_toplam: paketSayisi,
                    kullanici: kullanici || 'bilinmiyor',
                    created_at: new Date().toISOString()
                });
            }
        }

        if (kayitlar.length === 0) {
            return res.json({
                success: false,
                message: 'Bu kalemin tüm paketleri zaten okunmuş'
            });
        }

        const { error: insertError } = await client
            .from('satis_faturasi_okumalari')
            .insert(kayitlar);

        if (insertError) {
            console.error('Toplu okutma kayıt hatası:', insertError);
            return res.json({
                success: false,
                message: 'Kayıt hatası: ' + insertError.message
            });
        }

        // Cache'i güncelle
        kayitlar.forEach(k => {
            cacheyeOkumaEkle(fatura_no.toString(), k.qr_kod, k.stok_kod, k.paket_sira, k.kalem_id);
        });

        return res.json({
            success: true,
            message: `${kalem.malzeme_adi || kalem.product_desc || kalem.stok_kod} - ${kayitlar.length} paket okundu sayıldı`,
            eklenen_paket: kayitlar.length,
            malzeme_adi: kalem.malzeme_adi || kalem.product_desc || kalem.stok_kod
        });

    } catch (error) {
        console.error('Toplu okutma hatası:', error);
        return res.json({
            success: false,
            message: 'Sunucu hatası: ' + error.message
        });
    }
});

/**
 * GET /api/mikro/kapatilan-faturalar
 * Tamamlanmış faturaları listele
 */
router.get('/kapatilan-faturalar', async (req, res) => {
    try {
        const client = await getSupabaseClient();
        if (!client) {
            return res.status(500).json({
                success: false,
                message: 'Veritabanı bağlantısı kurulamadı'
            });
        }

        // Tüm faturaları grupla
        const { data: faturalar, error } = await client
            .from('satis_faturasi')
            .select('evrakno_seri, evrakno_sira, tarih, cari_adi, miktar, paket_sayisi')
            .order('evrakno_sira', { ascending: false });

        if (error) {
            return res.status(500).json({
                success: false,
                message: 'Fatura listesi hatası: ' + error.message
            });
        }

        // Faturaları grupla
        const faturaGruplari = {};
        for (const kayit of faturalar || []) {
            const key = `${kayit.evrakno_seri}-${kayit.evrakno_sira}`;
            if (!faturaGruplari[key]) {
                faturaGruplari[key] = {
                    evrakno_seri: kayit.evrakno_seri,
                    evrakno_sira: kayit.evrakno_sira,
                    tarih: kayit.tarih,
                    cari_adi: kayit.cari_adi,
                    toplam_paket: 0
                };
            }
            const miktar = parseFloat(kayit.miktar) || 1;
            const paketSayisi = parseInt(kayit.paket_sayisi) || 1;
            faturaGruplari[key].toplam_paket += Math.ceil(miktar * paketSayisi);
        }

        // Her fatura için okunan paket sayısını al
        const kapatilanFaturalar = [];
        for (const key of Object.keys(faturaGruplari)) {
            const fatura = faturaGruplari[key];

            const { count, error: countError } = await client
                .from('satis_faturasi_okumalari')
                .select('*', { count: 'exact', head: true })
                .eq('fatura_no', fatura.evrakno_sira);

            const okunanPaket = countError ? 0 : (count || 0);

            // Kapatılan fatura = okunan >= toplam
            if (okunanPaket >= fatura.toplam_paket && fatura.toplam_paket > 0) {
                kapatilanFaturalar.push({
                    ...fatura,
                    okunan_paket: okunanPaket
                });
            }
        }

        // Sırala
        kapatilanFaturalar.sort((a, b) => b.evrakno_sira - a.evrakno_sira);

        return res.json({
            success: true,
            faturalar: kapatilanFaturalar,
            toplam: kapatilanFaturalar.length
        });

    } catch (error) {
        console.error('Kapatılan faturalar hatası:', error);
        return res.status(500).json({
            success: false,
            message: 'Sunucu hatası: ' + error.message
        });
    }
});

/**
 * GET /api/mikro/cari-adres/:cariKod
 * Cari hesabın adres ve telefon bilgilerini getir (Supabase'den)
 */
router.get('/cari-adres/:cariKod', async (req, res) => {
    try {
        const { cariKod } = req.params;

        const client = await getSupabaseClient();
        if (!client) {
            return res.status(500).json({
                success: false,
                message: 'Veritabanı bağlantısı kurulamadı'
            });
        }

        const { data, error } = await client
            .from('satis_faturasi_adres')
            .select('*')
            .eq('cari_kod', cariKod)
            .limit(1)
            .single();

        if (error || !data) {
            return res.json({
                success: false,
                message: 'Adres bilgisi bulunamadı'
            });
        }

        return res.json({
            success: true,
            adres: data
        });

    } catch (error) {
        console.error('Cari adres hatası:', error);
        return res.status(500).json({
            success: false,
            message: 'Sunucu hatası: ' + error.message
        });
    }
});

module.exports = router;
