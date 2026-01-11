/**
 * Mikro SQL Server Entegrasyonu
 * PRGsheet'ten SQL bağlantı bilgilerini okur ve satış faturalarını Supabase'e aktarır
 */

const express = require('express');
const router = express.Router();
const sql = require('mssql');
const { google } = require('googleapis');
const { createClient } = require('@supabase/supabase-js');

// Google Sheets bilgileri (.env'den)
const GOOGLE_SERVICE_ACCOUNT_EMAIL = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
const GOOGLE_PRIVATE_KEY = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n');
const PRGSHEET_NAME = 'PRGsheet';

// SQL Server config cache
let SQL_CONFIG = null;
let configYuklendi = false;

// Supabase client
let supabase = null;

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
        console.log('SQL Server config PRGsheet\'ten yüklendi:', SQL_CONFIG.server);
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

        // SQL Server'a bağlan
        console.log('Mikro SQL Server\'a bağlanılıyor...');
        const pool = await sql.connect(config);

        // Faturaları çek
        const sorgu = `
            SELECT
                sth.sth_evrakno_seri,
                sth.sth_evrakno_sira,
                CONVERT(DATE, sth.sth_tarih) AS tarih,
                sth.sth_stok_kod,
                sth.sth_miktar,
                dbo.fn_StokHarEvrTip(sth.sth_evraktip) AS evrak_adi,
                cha.cha_kod AS cari_kodu,
                dbo.fn_CarininIsminiBul(cha.cha_cari_cins, cha.cha_kod) AS cari_adi
            FROM dbo.STOK_HAREKETLERI sth WITH (NOLOCK)
            LEFT JOIN dbo.CARI_HESAP_HAREKETLERI cha WITH (NOLOCK)
                ON sth.sth_evrakno_seri = cha.cha_evrakno_seri
                AND sth.sth_evrakno_sira = cha.cha_evrakno_sira
                AND cha.cha_evrak_tip = 63
            WHERE sth.sth_evraktip = 4
                AND sth.sth_tarih > '2026-01-01'
            ORDER BY sth.sth_evrakno_sira DESC
        `;

        const result = await pool.request().query(sorgu);
        const faturalar = result.recordset;

        console.log(`Mikro'dan ${faturalar.length} kayıt çekildi`);

        // Bağlantıyı kapat
        await pool.close();

        if (faturalar.length === 0) {
            return res.json({
                success: true,
                message: 'Yeni fatura bulunamadı',
                eklenen: 0
            });
        }

        // Supabase'e kaydet (upsert)
        let eklenen = 0;
        let atlanan = 0;

        for (const fatura of faturalar) {
            const kayit = {
                evrakno_seri: fatura.sth_evrakno_seri || '',
                evrakno_sira: fatura.sth_evrakno_sira,
                tarih: fatura.tarih,
                stok_kod: fatura.sth_stok_kod,
                miktar: fatura.sth_miktar,
                evrak_adi: fatura.evrak_adi || 'Satış Faturası',
                cari_kodu: fatura.cari_kodu || '',
                cari_adi: fatura.cari_adi || ''
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

        return res.json({
            success: true,
            message: `${eklenen} fatura kaydedildi, ${atlanan} atlandi`,
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

        const { data, error } = await client
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
            return res.status(404).json({
                success: false,
                message: 'Fatura bulunamadı'
            });
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
                toplam_kalem: data.length,
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

            // fatura_okumalari tablosundan okunan sayısını al
            const { count, error: countError } = await client
                .from('fatura_okumalari')
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
                .from('fatura_okumalari')
                .select('*', { count: 'exact', head: true })
                .eq('fatura_no', parseInt(faturaNo))
                .eq('kalem_id', kalem.id);

            const kalemOkunan = countError ? 0 : (count || 0);
            okunanPaket += kalemOkunan;

            kalemlerDetay.push({
                id: kalem.id,
                stok_kod: kalem.stok_kod,
                malzeme_adi: kalem.stok_kod,
                miktar: kalem.miktar,
                beklenen_paket: beklenenPaket,
                okunan_paket: kalemOkunan
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
            .from('fatura_okumalari')
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
 * QR kod okutma
 */
router.post('/qr-okut', async (req, res) => {
    try {
        const { fatura_no, qr_kod, kullanici } = req.body;

        if (!fatura_no || !qr_kod) {
            return res.status(400).json({
                success: false,
                message: 'Fatura no ve QR kod gerekli'
            });
        }

        const client = await getSupabaseClient();
        if (!client) {
            return res.status(500).json({
                success: false,
                message: 'Veritabanı bağlantısı kurulamadı'
            });
        }

        // QR kodun daha önce okutulup okutulmadığını kontrol et
        const { data: mevcutOkuma, error: kontrolError } = await client
            .from('fatura_okumalari')
            .select('id')
            .eq('fatura_no', parseInt(fatura_no))
            .eq('qr_kod', qr_kod)
            .single();

        if (mevcutOkuma) {
            return res.json({
                success: false,
                message: 'Bu QR kod zaten okunmuş!',
                hata_tipi: 'DUPLICATE_QR'
            });
        }

        // QR koddan bilgileri parse et (örnek: MALZEME_KODU|PAKET_SIRA|TOPLAM_PAKET)
        const qrParcalari = qr_kod.split('|');
        const stokKod = qrParcalari[0] || qr_kod;
        const paketSira = parseInt(qrParcalari[1]) || 1;
        const toplamPaket = parseInt(qrParcalari[2]) || 1;

        // Bu stok kodu faturada var mı kontrol et
        const { data: kalem, error: kalemError } = await client
            .from('satis_faturasi')
            .select('*')
            .eq('evrakno_sira', parseInt(fatura_no))
            .eq('stok_kod', stokKod)
            .single();

        if (kalemError || !kalem) {
            return res.json({
                success: false,
                message: `Bu stok kodu (${stokKod}) faturada bulunamadı`,
                hata_tipi: 'STOK_BULUNAMADI'
            });
        }

        // Okuma kaydını oluştur
        const { error: insertError } = await client
            .from('fatura_okumalari')
            .insert({
                fatura_no: parseInt(fatura_no),
                kalem_id: kalem.id,
                qr_kod: qr_kod,
                stok_kod: stokKod,
                paket_sira: paketSira,
                kullanici: kullanici || 'bilinmiyor',
                created_at: new Date().toISOString()
            });

        if (insertError) {
            console.error('Okuma kayıt hatası:', insertError);
            return res.status(500).json({
                success: false,
                message: 'Okuma kaydedilemedi: ' + insertError.message
            });
        }

        return res.json({
            success: true,
            message: `${stokKod} (${paketSira}/${toplamPaket}) okundu`,
            eslesen_kalem: {
                id: kalem.id,
                stok_kod: stokKod,
                malzeme_adi: stokKod
            },
            paket_bilgi: {
                sira: paketSira,
                toplam: toplamPaket
            }
        });

    } catch (error) {
        console.error('QR okutma hatası:', error);
        return res.status(500).json({
            success: false,
            message: 'Sunucu hatası: ' + error.message
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
        const paketSayisi = parseInt(kalem.paket_sayisi) || 1;
        const toplamPaket = Math.ceil(miktar * paketSayisi);

        // Bu kalem için okunan paketleri al
        const { data: okumalar, error: okumaError } = await client
            .from('fatura_okumalari')
            .select('paket_sira')
            .eq('fatura_no', parseInt(faturaNo))
            .eq('kalem_id', parseInt(kalemId));

        const okunanPaketler = new Set((okumalar || []).map(o => o.paket_sira));

        // Paket listesi oluştur
        const paketler = [];
        for (let i = 1; i <= toplamPaket; i++) {
            paketler.push({
                paket_sira: i,
                beklenen: 1,
                okunan: okunanPaketler.has(i) ? 1 : 0
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
                .from('fatura_okumalari')
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

module.exports = router;
