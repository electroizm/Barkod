/**
 * Satış Faturası Route'ları
 * Fatura verileri Python sync scripti ile Supabase'e aktarılır
 */

const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');
const { qrKodParsele, qrKodHash, qrKodValidasyon } = require('../utils/qr-parser');

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
 * product_code ile direkt eşleşme (Nakliye'deki malzeme_no eşleşmesi gibi)
 */
function productCodeEslesiyor(kalem, productCode) {
    return kalem.product_code === productCode;
}

/**
 * Cache'den kalem bul (product_code ile) - ilk eşleşeni döndürür
 */
function cachedeProductCodeBul(faturaNo, productCode) {
    const cache = faturaCache.get(faturaNo);
    if (!cache) return null;
    return cache.kalemler.find(k => productCodeEslesiyor(k, productCode));
}

/**
 * Cache'den kalem bul (bag_kodu ile - kişiye özel ürünler)
 */
function cachedeSatinalmaKalemIdBul(faturaNo, satinalmaKalemId) {
    const cache = faturaCache.get(faturaNo);
    if (!cache) return null;
    return cache.kalemler.find(k => k.bag_kodu === satinalmaKalemId);
}

/**
 * Aynı product_code'a sahip TÜM kalemlerin toplam miktarını hesapla
 */
function toplamMiktarBulProductCode(faturaNo, productCode) {
    const cache = faturaCache.get(faturaNo);
    if (!cache) return 1;

    return cache.kalemler
        .filter(k => productCodeEslesiyor(k, productCode))
        .reduce((toplam, k) => toplam + (parseFloat(k.miktar) || 1), 0);
}

/**
 * Aynı product_code'a sahip kalemlerden kapasitesi olan ilkini bul
 */
function uygunKalemBulProductCode(faturaNo, productCode, paketSira) {
    const cache = faturaCache.get(faturaNo);
    if (!cache) return null;

    const eslesenKalemler = cache.kalemler.filter(k => productCodeEslesiyor(k, productCode));
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
            return res.status(404).json({
                success: false,
                message: 'Fatura bulunamadı. Lütfen önce Python sync scriptini çalıştırın.'
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
                plasiyer_kodu: data[0].plasiyer_kodu,
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
            .select('evrakno_seri, evrakno_sira, tarih, cari_adi, miktar, paket_sayisi, malzeme_adi, product_desc')
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
                    toplam_paket: 0,
                    kalemler: []
                };
            }
            // Her kalem için miktar * paket_sayisi
            const miktar = parseFloat(kayit.miktar) || 1;
            const paketSayisi = parseInt(kayit.paket_sayisi) || 1;
            faturaGruplari[key].toplam_paket += Math.ceil(miktar * paketSayisi);
            faturaGruplari[key].kalemler.push(Math.ceil(miktar) + ' - ' + (kayit.malzeme_adi || kayit.product_desc || 'Bilinmeyen'));
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

        // 2. QR kodu parse et ve validate et (sadece GS1 formatı)
        const qrBilgi = qrKodValidasyon(qr_kod);
        if (qrBilgi.basarili) {
            // Normalize edilmiş QR kodu kullan (tarayıcı prefix'leri temizlenmiş)
            qr_kod = qrBilgi.qrKodHam;
        }
        if (!qrBilgi.basarili) {
            return res.json({
                success: false,
                message: 'QR kod okunamadı: ' + qrBilgi.hata,
                hata_tipi: 'INVALID_QR'
            });
        }

        // product_code: malzemeNo'nun son 10 hanesi (satis_faturasi.product_code ile eşleşir)
        const productCode = qrBilgi.malzemeNo.slice(-10);
        const paketSira = qrBilgi.paketSira;
        const paketToplam = qrBilgi.paketToplam;

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

        if (qrBilgi.kisiyeOzel) {
            // Kişiye özel ürün: satinalma_kalem_id ile eşleştir
            eslesenKalem = cachedeSatinalmaKalemIdBul(fatura_no, qrBilgi.satinalmaKalemId);

            if (!eslesenKalem) {
                return res.json({
                    success: false,
                    message: 'Bu kişiye özel ürün bu faturada bulunamadı!',
                    hata_tipi: 'NOT_FOUND_CUSTOM',
                    detay: {
                        satinalma_kalem_id: qrBilgi.satinalmaKalemId
                    }
                });
            }
        } else {
            // Standart ürün: product_code ile eşleştir
            const herhangiKalem = cachedeProductCodeBul(fatura_no, productCode);

            if (!herhangiKalem) {
                return res.json({
                    success: false,
                    message: `Bu ürün (${productCode}) faturada bulunamadı!`,
                    hata_tipi: 'NOT_FOUND_STANDARD',
                    detay: { product_code: productCode }
                });
            }

            // Kapasitesi olan uygun kalemi bul (aynı üründen birden fazla satır olabilir)
            eslesenKalem = uygunKalemBulProductCode(fatura_no, productCode, paketSira);
            if (!eslesenKalem) eslesenKalem = herhangiKalem;
        }

        // 5.5. Paket sayısı uyumsuzluk düzeltmesi
        // QR barkod fiziksel etikettir → her zaman doğru kaynaktır
        const dbBirimPaket = parseInt(eslesenKalem.paket_sayisi) || 0;
        if (dbBirimPaket > 0 && paketToplam !== dbBirimPaket) {

            const cacheRef = faturaCache.get(fatura_no);
            const eslesenKalemler = cacheRef ? cacheRef.kalemler.filter(k => productCodeEslesiyor(k, productCode)) : [];
            let guncellenenSatir = 0;
            let toplamPaketFark = 0;

            for (const kalem of eslesenKalemler) {
                const miktar = parseFloat(kalem.miktar) || 1;
                const eskiPaket = parseInt(kalem.paket_sayisi) || 0;

                const { data: guncelData, error: guncelHata } = await client
                    .from('satis_faturasi')
                    .update({ paket_sayisi: paketToplam })
                    .eq('id', kalem.id)
                    .select('id');

                if (guncelHata) {
                    console.error(`Fatura paket güncelleme hatası (id=${kalem.id}):`, guncelHata);
                } else if (!guncelData || guncelData.length === 0) {
                    console.error(`FATURA_PAKET_SAYISI_DUZELTME: 0 satır güncellendi (id=${kalem.id}) - RLS UPDATE policy eksik olabilir!`);
                } else {
                    guncellenenSatir++;
                    toplamPaketFark += Math.ceil(miktar * paketToplam) - Math.ceil(miktar * eskiPaket);
                    kalem.paket_sayisi = paketToplam;
                }
            }

            if (cacheRef && toplamPaketFark !== 0) {
                cacheRef.toplamPaket += toplamPaketFark;
            }
        }

        // 6. PAKET OKUMA LİMİT KONTROLÜ
        // Aynı product_code'dan birden fazla satır olabilir, TOPLAM miktarı hesapla
        const toplamMiktar = toplamMiktarBulProductCode(fatura_no, productCode);

        if (!paketOkumasiYapilabilirMi(fatura_no, productCode, paketSira, toplamMiktar)) {
            // Cache stale olabilir - DB'den yenileyip tekrar kontrol et
            await faturaCacheYukle(fatura_no, client, true);
            const toplamMiktarYeni = toplamMiktarBulProductCode(fatura_no, productCode);
            if (!paketOkumasiYapilabilirMi(fatura_no, productCode, paketSira, toplamMiktarYeni)) {
                const mevcutOkuma = paketOkumaSayisi(fatura_no, productCode, paketSira);
                return res.json({
                    success: false,
                    message: `${eslesenKalem.malzeme_adi || eslesenKalem.product_desc || productCode} (${paketSira}/${paketToplam}) için tüm okumalar tamamlandı!`,
                    hata_tipi: 'PAKET_LIMIT_ASILDI',
                    detay: {
                        product_code: productCode,
                        paket_sira: paketSira,
                        paket_toplam: paketToplam,
                        miktar: toplamMiktarYeni,
                        okunan: mevcutOkuma
                    }
                });
            }
        }

        // 7. Okumayı veritabanına kaydet
        const okumaKaydi = {
            fatura_no: parseInt(fatura_no),
            kalem_id: eslesenKalem.id,
            qr_kod: qr_kod,
            qr_hash: qrKodHash(qr_kod),
            stok_kod: productCode,
            paket_sira: paketSira,
            paket_toplam: paketToplam,
            ozel_uretim_kodu: qrBilgi.ozelUretimKodu,
            malzeme_no_qr: qrBilgi.malzemeNo,
            satinalma_kalem_id_qr: qrBilgi.satinalmaKalemId,
            kullanici: kullanici || 'bilinmiyor',
            created_at: new Date().toISOString()
        };

        const { data: yeniOkuma, error: insertError } = await client
            .from('satis_faturasi_okumalari')
            .insert(okumaKaydi)
            .select()
            .single();

        if (insertError) {
            // Unique constraint hatası - duplicate
            if (insertError.code === '23505') {
                cacheyeOkumaEkle(fatura_no, qr_kod, productCode, paketSira, eslesenKalem.id);
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
        cacheyeOkumaEkle(fatura_no, qr_kod, productCode, paketSira, eslesenKalem.id);

        // Güncel cache'den istatistik al
        const guncelCache = faturaCache.get(fatura_no);

        return res.json({
            success: true,
            message: `${eslesenKalem.malzeme_adi || eslesenKalem.product_desc || productCode} (${paketSira}/${paketToplam})`,
            eslesen_kalem: {
                id: eslesenKalem.id,
                product_code: productCode,
                malzeme_adi: eslesenKalem.malzeme_adi || eslesenKalem.product_desc || productCode,
                miktar: eslesenKalem.miktar
            },
            paket_bilgi: {
                sira: paketSira,
                toplam: paketToplam
            },
            fatura_kalan_paket: guncelCache ? (guncelCache.toplamPaket - guncelCache.okunanPaket) : 0,
            fatura_okunan_paket: guncelCache?.okunanPaket || 0,
            okuma_id: yeniOkuma?.id
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

        // Son 2 günün faturalarını getir
        const ikiGunOnce = new Date();
        ikiGunOnce.setDate(ikiGunOnce.getDate() - 2);
        const tarihFiltre = ikiGunOnce.toISOString().split('T')[0];

        const { data: faturalar, error } = await client
            .from('satis_faturasi')
            .select('evrakno_seri, evrakno_sira, tarih, cari_adi, miktar, paket_sayisi, malzeme_adi, product_desc')
            .gte('tarih', tarihFiltre)
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
                    toplam_paket: 0,
                    kalemler: []
                };
            }
            const miktar = parseFloat(kayit.miktar) || 1;
            const paketSayisi = parseInt(kayit.paket_sayisi) || 1;
            faturaGruplari[key].toplam_paket += Math.ceil(miktar * paketSayisi);
            faturaGruplari[key].kalemler.push(Math.ceil(miktar) + ' - ' + (kayit.malzeme_adi || kayit.product_desc || 'Bilinmeyen'));
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

// ==========================================
// BARKOD ÖN KAYIT ENDPOINT'LERİ
// ==========================================

/**
 * POST /api/mikro/on-kayit-barkod-bilgi
 * QR'dan parse edilen stok_kod için Doğtaş API'den bilgi çek
 * Sadece GS1 formatındaki barkodları kabul eder
 */
router.post('/on-kayit-barkod-bilgi', async (req, res) => {
    try {
        const { qr_kod } = req.body;

        if (!qr_kod) {
            return res.json({ success: false, message: 'QR kod gerekli' });
        }

        // QR kodu parse et - sadece GS1 format kabul edilir
        const qrBilgi = qrKodValidasyon(qr_kod);

        if (!qrBilgi.basarili) {
            return res.json({ success: false, message: 'Geçersiz barkod formatı: ' + (qrBilgi.hata || 'GS1 formatı bulunamadı') });
        }

        const normalizedQr = qrBilgi.qrKodHam;
        const stokKod = qrBilgi.malzemeNo.slice(-10);
        const paketSira = qrBilgi.paketSira;
        const paketToplam = qrBilgi.paketToplam;

        // Doğtaş API'den paket bilgisi al
        let malzemeAdi = stokKod;
        let productDesc = null;
        let paketSayisi = paketToplam;

        try {
            const dogtasResponse = await fetch(`http://localhost:${process.env.PORT || 3000}/api/dogtas/urun-paketleri`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ stokKodlari: [stokKod] })
            });
            const dogtasData = await dogtasResponse.json();

            if (dogtasData.success && dogtasData.sonuclar && dogtasData.sonuclar.length > 0) {
                const sonuc = dogtasData.sonuclar[0];
                if (sonuc.basarili && sonuc.veri) {
                    productDesc = sonuc.veri.productDesc;
                    paketSayisi = sonuc.veri.paketSayisi || paketToplam;
                }
            }
        } catch (apiError) {
            console.error('Doğtaş API hatası (ön kayıt):', apiError.message);
        }

        // Stok arama ile malzeme adını bul
        try {
            const stokResponse = await fetch(`http://localhost:${process.env.PORT || 3000}/api/stok/ara?q=${encodeURIComponent(stokKod)}`);
            const stokData = await stokResponse.json();
            if (stokData.success && stokData.sonuclar && stokData.sonuclar.length > 0) {
                malzemeAdi = stokData.sonuclar[0]['Malzeme Adı'] || stokKod;
            }
        } catch (e) { /* fallback to stokKod */ }

        return res.json({
            success: true,
            stok_kod: stokKod,
            malzeme_adi: malzemeAdi,
            product_desc: productDesc,
            paket_sayisi: paketSayisi,
            paket_sira: paketSira,
            paket_toplam: paketToplam,
            qr_kod_normalized: normalizedQr
        });

    } catch (error) {
        console.error('Ön kayıt barkod bilgi hatası:', error);
        return res.json({ success: false, message: 'Sunucu hatası: ' + error.message });
    }
});

/**
 * POST /api/mikro/on-kayit-okuma-kaydet
 * Ön kayıt: Barkod okutma sonrası her paketi kaydet
 */
router.post('/on-kayit-okuma-kaydet', async (req, res) => {
    try {
        const { stok_kod, malzeme_adi, product_desc, paket_sayisi, paket_sira, qr_kod, kullanici } = req.body;

        if (!stok_kod || !paket_sira) {
            return res.json({ success: false, message: 'Stok kodu ve paket sırası gerekli' });
        }

        const client = await getSupabaseClient();
        if (!client) {
            return res.json({ success: false, message: 'Veritabanı bağlantısı kurulamadı' });
        }

        // Duplicate QR kontrolü
        if (qr_kod) {
            const { data: existing } = await client
                .from('on_kayit_okumalar')
                .select('id')
                .eq('qr_kod', qr_kod)
                .eq('durum', 'bekliyor')
                .limit(1);

            if (existing && existing.length > 0) {
                return res.json({ success: false, message: 'Bu QR kod zaten okutulmuş!' });
            }
        }

        const { data, error } = await client
            .from('on_kayit_okumalar')
            .insert({
                stok_kod,
                malzeme_adi: malzeme_adi || stok_kod,
                product_desc: product_desc || null,
                paket_sayisi: paket_sayisi || 1,
                paket_sira,
                qr_kod: qr_kod || null,
                kullanici: kullanici || 'bilinmiyor',
                durum: 'bekliyor'
            })
            .select();

        if (error) {
            console.error('Ön kayıt okuma kayıt hatası:', error);
            return res.json({ success: false, message: 'Kayıt hatası: ' + error.message });
        }

        return res.json({
            success: true,
            message: `${malzeme_adi || stok_kod} P${paket_sira} kaydedildi`,
            kayit: data?.[0]
        });

    } catch (error) {
        console.error('Ön kayıt okuma hatası:', error);
        return res.json({ success: false, message: 'Sunucu hatası: ' + error.message });
    }
});

/**
 * POST /api/mikro/on-kayit-manuel-okuma
 * Ön kayıt: Manuel ürün seçimi sonrası tüm paketleri tek seferde kaydet
 */
router.post('/on-kayit-manuel-okuma', async (req, res) => {
    try {
        const { stok_kod, malzeme_adi, product_desc, paket_sayisi, kullanici } = req.body;

        if (!stok_kod) {
            return res.json({ success: false, message: 'Stok kodu gerekli' });
        }

        const client = await getSupabaseClient();
        if (!client) {
            return res.json({ success: false, message: 'Veritabanı bağlantısı kurulamadı' });
        }

        const batchId = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
        const paketAdet = parseInt(paket_sayisi) || 1;
        const kayitlar = [];

        for (let ps = 1; ps <= paketAdet; ps++) {
            kayitlar.push({
                stok_kod,
                malzeme_adi: malzeme_adi || stok_kod,
                product_desc: product_desc || null,
                paket_sayisi: paketAdet,
                paket_sira: ps,
                qr_kod: `MANUEL_ONKAYIT_${stok_kod}_P${ps}_${batchId}`,
                kullanici: kullanici || 'bilinmiyor',
                durum: 'bekliyor'
            });
        }

        const { error } = await client
            .from('on_kayit_okumalar')
            .insert(kayitlar);

        if (error) {
            console.error('Ön kayıt manuel okuma hatası:', error);
            return res.json({ success: false, message: 'Kayıt hatası: ' + error.message });
        }

        return res.json({
            success: true,
            message: `${malzeme_adi || stok_kod} - ${paketAdet} paket eklendi`,
            eklenen_paket: paketAdet
        });

    } catch (error) {
        console.error('Ön kayıt manuel okuma hatası:', error);
        return res.json({ success: false, message: 'Sunucu hatası: ' + error.message });
    }
});

/**
 * GET /api/mikro/on-kayit-bekleyenler
 * Ön kayıt: Bekleyen okumaları tek tek listele
 */
router.get('/on-kayit-bekleyenler', async (req, res) => {
    try {
        const client = await getSupabaseClient();
        if (!client) {
            return res.json({ success: false, message: 'Veritabanı bağlantısı kurulamadı' });
        }

        const { data, error } = await client
            .from('on_kayit_okumalar')
            .select('*')
            .eq('durum', 'bekliyor')
            .order('created_at', { ascending: false });

        if (error) {
            return res.json({ success: false, message: 'Sorgu hatası: ' + error.message });
        }

        return res.json({
            success: true,
            okumalar: data || [],
            toplam: (data || []).length
        });

    } catch (error) {
        console.error('Ön kayıt bekleyenler hatası:', error);
        return res.json({ success: false, message: 'Sunucu hatası: ' + error.message });
    }
});

/**
 * POST /api/mikro/on-kayit-depo-kaydet
 * Ön kayıt: Bekleyen okuma için depo bilgisini kaydet
 */
router.post('/on-kayit-depo-kaydet', async (req, res) => {
    try {
        const { id, depo } = req.body;

        if (!id || !depo) {
            return res.json({ success: false, message: 'ID ve depo gerekli' });
        }

        const client = await getSupabaseClient();
        if (!client) {
            return res.json({ success: false, message: 'Veritabanı bağlantısı kurulamadı' });
        }

        const { data: updated, error } = await client
            .from('on_kayit_okumalar')
            .update({ depo: parseInt(depo) })
            .eq('id', id)
            .select('malzeme_adi, stok_kod')
            .single();

        if (error) {
            console.error('Depo kaydetme hatası:', error);
            return res.json({ success: false, message: 'Kayıt hatası: ' + error.message });
        }

        const DEPO_ADLARI = { 100: 'DEPO', 200: 'SUBE', 300: 'EXC' };
        const depoAdi = DEPO_ADLARI[depo] || depo;
        const urunAdi = updated?.malzeme_adi || updated?.stok_kod || '';
        return res.json({ success: true, message: `${urunAdi} / ${depo} - ${depoAdi} olarak kaydedildi.` });

    } catch (error) {
        console.error('Depo kaydetme hatası:', error);
        return res.json({ success: false, message: 'Sunucu hatası: ' + error.message });
    }
});

/**
 * DELETE /api/mikro/on-kayit-okuma/:id
 * Bekleyen okumayı sil
 */
router.delete('/on-kayit-okuma/:id', async (req, res) => {
    try {
        const { id } = req.params;

        const client = await getSupabaseClient();
        if (!client) {
            return res.json({ success: false, message: 'Veritabanı bağlantısı kurulamadı' });
        }

        const { error } = await client
            .from('on_kayit_okumalar')
            .delete()
            .eq('id', parseInt(id))
            .eq('durum', 'bekliyor');

        if (error) {
            return res.json({ success: false, message: 'Silme hatası: ' + error.message });
        }

        return res.json({ success: true, message: 'Okuma silindi' });

    } catch (error) {
        console.error('Ön kayıt okuma silme hatası:', error);
        return res.json({ success: false, message: 'Sunucu hatası: ' + error.message });
    }
});

/**
 * DELETE /api/mikro/on-kayit-grup-sil/:stokKod
 * Bir ürünün tüm bekleyen okumalarını sil
 */
router.delete('/on-kayit-grup-sil/:stokKod', async (req, res) => {
    try {
        const { stokKod } = req.params;

        const client = await getSupabaseClient();
        if (!client) {
            return res.json({ success: false, message: 'Veritabanı bağlantısı kurulamadı' });
        }

        const { data, error } = await client
            .from('on_kayit_okumalar')
            .delete()
            .eq('stok_kod', stokKod)
            .eq('durum', 'bekliyor')
            .select();

        if (error) {
            return res.json({ success: false, message: 'Silme hatası: ' + error.message });
        }

        return res.json({
            success: true,
            message: `${(data || []).length} okuma silindi`
        });

    } catch (error) {
        console.error('Ön kayıt grup silme hatası:', error);
        return res.json({ success: false, message: 'Sunucu hatası: ' + error.message });
    }
});

/**
 * POST /api/mikro/on-kayit-eslestir
 * Evrak no ile eşleştir ve satis_faturasi_okumalari'na aktar
 * secili_idler: [id1, id2, ...] formatında - depo bilgisi on_kayit_okumalar tablosundan okunur
 * Eşleştirme: stok_kod + cikis_depo_no == depo kontrolü
 */
router.post('/on-kayit-eslestir', async (req, res) => {
    try {
        const { evrakno_sira, kullanici, secili_idler } = req.body;

        if (!evrakno_sira) {
            return res.json({ success: false, message: 'Evrak numarası gerekli' });
        }

        if (!secili_idler || !Array.isArray(secili_idler) || secili_idler.length === 0) {
            return res.json({ success: false, message: 'Eşleştirilecek ürün seçilmedi' });
        }

        const client = await getSupabaseClient();
        if (!client) {
            return res.json({ success: false, message: 'Veritabanı bağlantısı kurulamadı' });
        }

        // 1. Seçili bekleyen okumaları al (ID bazlı)
        const { data: bekleyenler, error: bekleyenError } = await client
            .from('on_kayit_okumalar')
            .select('*')
            .eq('durum', 'bekliyor')
            .in('id', secili_idler);

        if (bekleyenError || !bekleyenler || bekleyenler.length === 0) {
            return res.json({
                success: false,
                message: 'Bekleyen okuma bulunamadı'
            });
        }

        // Depo kontrolü - tüm seçili okumalarda depo kaydedilmiş mi?
        const deposuzlar = bekleyenler.filter(b => !b.depo);
        if (deposuzlar.length > 0) {
            const adlar = deposuzlar.map(b => b.malzeme_adi || b.stok_kod);
            return res.json({
                success: false,
                message: `Depo kaydedilmemiş ürünler var: ${adlar.join(', ')}. Önce depo seçip kaydedin.`
            });
        }

        // 2. Fatura kalemlerini al
        const { data: kalemler, error: kalemError } = await client
            .from('satis_faturasi')
            .select('*')
            .eq('evrakno_sira', parseInt(evrakno_sira));

        if (kalemError || !kalemler || kalemler.length === 0) {
            return res.json({
                success: false,
                message: `Evrak no ${evrakno_sira} için fatura bulunamadı. Faturanın Supabase'e aktarıldığından emin olun.`
            });
        }

        // 3. Her okumayı fatura kalemiyle eşleştir (stok_kod + cikis_depo_no)
        const eslesen = [];
        const eslesmeyen = [];
        const batchId = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;

        for (const bekleyen of bekleyenler) {
            const stokKod = bekleyen.stok_kod;
            const bekleyenDepo = parseInt(bekleyen.depo);

            const kalem = kalemler.find(k => {
                if (!k.stok_kod) return false;
                const dbKod = k.stok_kod.trim();
                const onKayitKod = stokKod.trim();
                const stokEslesme = dbKod === onKayitKod ||
                    dbKod.startsWith(onKayitKod) ||
                    onKayitKod.startsWith(dbKod) ||
                    dbKod.substring(0, 10) === onKayitKod.substring(0, 10);

                // cikis_depo_no kontrolü
                const depoEslesme = !k.cikis_depo_no || parseInt(k.cikis_depo_no) === bekleyenDepo;

                return stokEslesme && depoEslesme;
            });

            if (kalem) {
                eslesen.push({ bekleyen, kalem });
            } else {
                eslesmeyen.push(bekleyen);
            }
        }

        if (eslesen.length === 0) {
            const eslesemeyenAdlar = [...new Set(eslesmeyen.map(e => e.malzeme_adi || e.stok_kod))];
            return res.json({
                success: false,
                message: `${eslesemeyenAdlar.join(', ')} - Doğru Depo seçimini yapmanız gerekiyor.`
            });
        }

        // 4. satis_faturasi_okumalari'na aktar
        const okumaKayitlari = eslesen.map((e, index) => ({
            fatura_no: parseInt(evrakno_sira),
            kalem_id: e.kalem.id,
            qr_kod: e.bekleyen.qr_kod || `ONKAYIT_ESLESTIR_${evrakno_sira}_${e.kalem.id}_P${e.bekleyen.paket_sira}_${batchId}_${index}`,
            qr_hash: qrKodHash(e.bekleyen.qr_kod || `ONKAYIT_${e.kalem.id}_P${e.bekleyen.paket_sira}`),
            stok_kod: e.kalem.stok_kod,
            paket_sira: e.bekleyen.paket_sira,
            paket_toplam: e.bekleyen.paket_sayisi,
            depo: parseInt(e.bekleyen.depo),
            kullanici: kullanici || e.bekleyen.kullanici || 'bilinmiyor',
            created_at: new Date().toISOString()
        }));

        const { error: insertError } = await client
            .from('satis_faturasi_okumalari')
            .insert(okumaKayitlari);

        if (insertError) {
            console.error('Ön kayıt eşleştirme insert hatası:', insertError);
            if (insertError.code === '23505') {
                return res.json({ success: false, message: 'Eşleşecek Ürün Bulunamadı. Eşleştirme Yapılmış Olabilir.' });
            }
            return res.json({ success: false, message: 'Okuma kayıt hatası: ' + insertError.message });
        }

        // 5. on_kayit_okumalar'ı güncelle
        const eslesenIdler = eslesen.map(e => e.bekleyen.id);
        const { error: updateError } = await client
            .from('on_kayit_okumalar')
            .update({
                durum: 'eslesti',
                evrakno_sira: parseInt(evrakno_sira)
            })
            .in('id', eslesenIdler);

        if (updateError) {
            console.error('Ön kayıt durum güncelleme hatası:', updateError);
        }

        // Fatura cache'ini temizle (yeni okumalar eklendi)
        faturaCache.delete(evrakno_sira.toString());

        const eslesemeyenAdlar = [...new Set(eslesmeyen.map(e => e.malzeme_adi || e.stok_kod))];

        return res.json({
            success: true,
            message: `${eslesen.length} paket eşleştirildi ve faturaya aktarıldı` +
                (eslesmeyen.length > 0 ? `. ${eslesmeyen.length} paket eşleşemedi: ${eslesemeyenAdlar.join(', ')}` : ''),
            eslesen_sayisi: eslesen.length,
            eslesmeyen_sayisi: eslesmeyen.length,
            eslesmeyen_urunler: eslesemeyenAdlar
        });

    } catch (error) {
        console.error('Ön kayıt eşleştirme hatası:', error);
        return res.json({ success: false, message: 'Sunucu hatası: ' + error.message });
    }
});

module.exports = router;
