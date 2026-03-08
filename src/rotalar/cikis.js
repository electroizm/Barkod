/**
 * Çıkış Fişi Route'ları
 * Sadece Supabase kullanır (SQL Server bağımlılığı yok)
 * Veri barkod_module.py ile Mikro'dan Supabase'e sync edilir
 */

const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');
const { qrKodParsele, qrKodHash, qrKodValidasyon } = require('../utils/qr-parser');

// Supabase client
let supabase = null;

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

// ============================================
// FİŞ CACHE SİSTEMİ (30 dakika TTL)
// ============================================
const fisCache = new Map();
const CACHE_SURESI_MS = 30 * 60 * 1000;

async function fisCacheYukle(fisNo, client, zorlaYenile = false) {
    const mevcutCache = fisCache.get(fisNo);
    const simdi = Date.now();

    if (mevcutCache && !zorlaYenile && (simdi - mevcutCache.sonGuncelleme < CACHE_SURESI_MS)) {
        return mevcutCache;
    }

    const { data: kalemler, error: kalemHata } = await client
        .from('cikis_fisi')
        .select('*')
        .eq('evrakno_sira', parseInt(fisNo))
        .order('stok_kod');

    if (kalemHata) {
        console.error('Fiş cache yükleme hatası:', kalemHata);
        return null;
    }

    const { data: okumalar, error: okumaHata } = await client
        .from('cikis_fisi_okumalari')
        .select('qr_kod, stok_kod, paket_sira, kalem_id')
        .eq('fis_no', parseInt(fisNo));

    const okunanQrler = new Set();
    const paketOkumaSayilari = new Map();
    const kalemOkumaSayilari = new Map();

    if (!okumaHata && okumalar) {
        okumalar.forEach(o => {
            okunanQrler.add(o.qr_kod);

            if (o.stok_kod && o.paket_sira) {
                const key = `${o.stok_kod}:${o.paket_sira}`;
                paketOkumaSayilari.set(key, (paketOkumaSayilari.get(key) || 0) + 1);
            }

            if (o.kalem_id && o.paket_sira) {
                const kalemKey = `${o.kalem_id}:${o.paket_sira}`;
                kalemOkumaSayilari.set(kalemKey, (kalemOkumaSayilari.get(kalemKey) || 0) + 1);
            }
        });
    }

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

    fisCache.set(fisNo, cacheData);
    console.log(`Çıkış fişi cache yüklendi: ${fisNo} - ${kalemler?.length || 0} kalem, ${okunanQrler.size} okuma`);

    return cacheData;
}

function cacheyeOkumaEkle(fisNo, qrKod, stokKod, paketSira, kalemId) {
    const cache = fisCache.get(fisNo);
    if (cache) {
        cache.okunanQrler.add(qrKod);
        cache.okunanPaket = cache.okunanQrler.size;
        cache.sonGuncelleme = Date.now();

        if (stokKod && paketSira) {
            const key = `${stokKod}:${paketSira}`;
            cache.paketOkumaSayilari.set(key, (cache.paketOkumaSayilari.get(key) || 0) + 1);
        }

        if (kalemId && paketSira) {
            const kalemKey = `${kalemId}:${paketSira}`;
            cache.kalemOkumaSayilari.set(kalemKey, (cache.kalemOkumaSayilari.get(kalemKey) || 0) + 1);
        }
    }
}

function cachedeQrVarMi(fisNo, qrKod) {
    const cache = fisCache.get(fisNo);
    return cache ? cache.okunanQrler.has(qrKod) : false;
}

function stokKodEslesiyor(kalem, stokKod) {
    return kalem.stok_kod === stokKod ||
        kalem.stok_kod.startsWith(stokKod + '-');
}

function cachedeStokKodBul(fisNo, stokKod) {
    const cache = fisCache.get(fisNo);
    if (!cache) return null;
    return cache.kalemler.find(k => stokKodEslesiyor(k, stokKod));
}

function toplamMiktarBulStokKod(fisNo, stokKod) {
    const cache = fisCache.get(fisNo);
    if (!cache) return 1;
    return cache.kalemler
        .filter(k => stokKodEslesiyor(k, stokKod))
        .reduce((toplam, k) => toplam + (parseFloat(k.miktar) || 1), 0);
}

function uygunKalemBulStokKod(fisNo, stokKod, paketSira) {
    const cache = fisCache.get(fisNo);
    if (!cache) return null;

    const eslesenKalemler = cache.kalemler.filter(k => stokKodEslesiyor(k, stokKod));
    if (eslesenKalemler.length === 0) return null;
    if (eslesenKalemler.length === 1) return eslesenKalemler[0];

    for (const kalem of eslesenKalemler) {
        const kalemMiktar = parseFloat(kalem.miktar) || 1;
        const kalemKey = `${kalem.id}:${paketSira}`;
        const kalemOkuma = cache.kalemOkumaSayilari.get(kalemKey) || 0;
        if (kalemOkuma < kalemMiktar) {
            return kalem;
        }
    }

    return eslesenKalemler[0];
}

function paketOkumasiYapilabilirMi(fisNo, stokKod, paketSira, maxMiktar) {
    const cache = fisCache.get(fisNo);
    if (!cache) return true;
    const key = `${stokKod}:${paketSira}`;
    const mevcutOkuma = cache.paketOkumaSayilari.get(key) || 0;
    return mevcutOkuma < maxMiktar;
}

function paketOkumaSayisi(fisNo, stokKod, paketSira) {
    const cache = fisCache.get(fisNo);
    if (!cache) return 0;
    const key = `${stokKod}:${paketSira}`;
    return cache.paketOkumaSayilari.get(key) || 0;
}

// ============================================
// ROUTE'LAR
// ============================================

/**
 * GET /api/cikis/fis/:fisNo
 * Çıkış fişi detaylarını getir (sadece Supabase)
 */
router.get('/fis/:fisNo', async (req, res) => {
    try {
        const { fisNo } = req.params;

        const client = await getSupabaseClient();
        if (!client) {
            return res.status(500).json({ success: false, message: 'Veritabanı bağlantısı kurulamadı' });
        }

        const { data, error } = await client
            .from('cikis_fisi')
            .select('*')
            .eq('evrakno_sira', parseInt(fisNo))
            .order('stok_kod');

        if (error) {
            return res.status(500).json({ success: false, message: 'Fiş sorgu hatası: ' + error.message });
        }

        if (!data || data.length === 0) {
            return res.status(404).json({ success: false, message: 'Çıkış fişi bulunamadı' });
        }

        let toplamMiktar = 0;
        let toplamPaket = 0;
        data.forEach(kalem => {
            toplamMiktar += parseFloat(kalem.miktar) || 0;
            toplamPaket += Math.ceil((parseFloat(kalem.miktar) || 1) * (parseInt(kalem.paket_sayisi) || 1));
        });

        return res.json({
            success: true,
            fis: {
                evrakno_seri: data[0].evrakno_seri,
                evrakno_sira: data[0].evrakno_sira,
                tarih: data[0].tarih,
                evrak_adi: data[0].evrak_adi,
                toplam_kalem: Math.ceil(toplamMiktar),
                toplam_miktar: toplamMiktar,
                toplam_paket: toplamPaket
            },
            kalemler: data
        });

    } catch (error) {
        console.error('Çıkış fişi detay hatası:', error);
        return res.status(500).json({ success: false, message: 'Sunucu hatası: ' + error.message });
    }
});

/**
 * GET /api/cikis/fis-durumu/:fisNo
 * Fişin okutma durumunu getir
 */
router.get('/fis-durumu/:fisNo', async (req, res) => {
    try {
        const { fisNo } = req.params;

        const client = await getSupabaseClient();
        if (!client) {
            return res.status(500).json({ success: false, message: 'Veritabanı bağlantısı kurulamadı' });
        }

        const { data: kalemler, error } = await client
            .from('cikis_fisi')
            .select('*')
            .eq('evrakno_sira', parseInt(fisNo))
            .order('stok_kod');

        if (error) {
            return res.status(500).json({ success: false, message: 'Fiş sorgu hatası: ' + error.message });
        }

        if (!kalemler || kalemler.length === 0) {
            return res.status(404).json({ success: false, message: 'Çıkış fişi bulunamadı' });
        }

        let toplamPaket = 0;
        let okunanPaket = 0;

        const kalemlerDetay = [];
        for (const kalem of kalemler) {
            const miktar = parseFloat(kalem.miktar) || 1;
            const paketSayisi = parseInt(kalem.paket_sayisi) || 1;
            const beklenenPaket = Math.ceil(miktar * paketSayisi);
            toplamPaket += beklenenPaket;

            const { count, error: countError } = await client
                .from('cikis_fisi_okumalari')
                .select('*', { count: 'exact', head: true })
                .eq('fis_no', parseInt(fisNo))
                .eq('kalem_id', kalem.id);

            const kalemOkunan = countError ? 0 : (count || 0);
            okunanPaket += kalemOkunan;

            kalemlerDetay.push({
                id: kalem.id,
                stok_kod: kalem.stok_kod,
                malzeme_adi: kalem.malzeme_adi,
                miktar: kalem.miktar,
                beklenen_paket: beklenenPaket,
                okunan_paket: kalemOkunan,
                depo: kalem.depo
            });
        }

        const kalanPaket = toplamPaket - okunanPaket;
        const tamamlanmaYuzdesi = toplamPaket > 0 ? Math.round((okunanPaket / toplamPaket) * 100) : 0;

        return res.json({
            success: true,
            fis: {
                evrakno_seri: kalemler[0].evrakno_seri,
                evrakno_sira: kalemler[0].evrakno_sira,
                tarih: kalemler[0].tarih,
                evrak_adi: kalemler[0].evrak_adi
            },
            kalemler: kalemlerDetay,
            toplam_paket: toplamPaket,
            okunan_paket: okunanPaket,
            kalan_paket: kalanPaket,
            tamamlanma_yuzdesi: tamamlanmaYuzdesi
        });

    } catch (error) {
        console.error('Çıkış fişi durumu hatası:', error);
        return res.status(500).json({ success: false, message: 'Sunucu hatası: ' + error.message });
    }
});

/**
 * GET /api/cikis/okunan-qrler/:fisNo
 * Fiş için okunan QR kodları listele (cache senkronizasyonu)
 */
router.get('/okunan-qrler/:fisNo', async (req, res) => {
    try {
        const { fisNo } = req.params;

        const client = await getSupabaseClient();
        if (!client) {
            return res.status(500).json({ success: false, message: 'Veritabanı bağlantısı kurulamadı' });
        }

        const { data, error } = await client
            .from('cikis_fisi_okumalari')
            .select('qr_kod')
            .eq('fis_no', parseInt(fisNo));

        if (error) {
            return res.status(500).json({ success: false, message: 'Sorgu hatası: ' + error.message });
        }

        return res.json({
            success: true,
            okunan_qrler: (data || []).map(d => d.qr_kod)
        });

    } catch (error) {
        console.error('Okunan QR listesi hatası:', error);
        return res.status(500).json({ success: false, message: 'Sunucu hatası: ' + error.message });
    }
});

/**
 * POST /api/cikis/qr-okut
 * QR kod okutma (cache + QR parser + limit kontrolü)
 */
router.post('/qr-okut', async (req, res) => {
    try {
        let { fis_no, qr_kod, kullanici } = req.body;

        if (!fis_no) {
            return res.json({ success: false, message: 'Fiş numarası gerekli', hata_tipi: 'MISSING_FIS' });
        }
        if (!qr_kod) {
            return res.json({ success: false, message: 'QR kod gerekli', hata_tipi: 'MISSING_QR' });
        }

        const client = await getSupabaseClient();
        if (!client) {
            return res.json({ success: false, message: 'Veritabanı bağlantısı kurulamadı', hata_tipi: 'DB_CONNECTION' });
        }

        // QR kodu parse et
        const qrBilgi = qrKodValidasyon(qr_kod);

        let stokKod, paketSira, paketToplam;

        if (qrBilgi.basarili) {
            qr_kod = qrBilgi.qrKodHam;
            stokKod = qrBilgi.malzemeNo.slice(-10);
            paketSira = qrBilgi.paketSira;
            paketToplam = qrBilgi.paketToplam;
        } else {
            const qrParcalari = qr_kod.split('|');
            stokKod = qrParcalari[0] || qr_kod;
            paketSira = parseInt(qrParcalari[1]) || 1;
            paketToplam = parseInt(qrParcalari[2]) || 1;
        }

        // Cache yükle
        const cache = await fisCacheYukle(fis_no, client);
        if (!cache) {
            return res.json({ success: false, message: 'Fiş bilgileri yüklenemedi', hata_tipi: 'CACHE_ERROR' });
        }

        // Duplicate kontrolü (cache O(1))
        if (cachedeQrVarMi(fis_no, qr_kod)) {
            return res.json({ success: false, message: 'Bu paket zaten okundu!', hata_tipi: 'DUPLICATE_QR', from_cache: true });
        }

        // Eşleşen kalemi bul
        let eslesenKalem = null;

        if (qrBilgi.basarili) {
            // 18 haneli malzemeNo ile bul
            eslesenKalem = cache.kalemler.find(k =>
                k.stok_kod === qrBilgi.malzemeNo ||
                (qrBilgi.malzemeNo.length === 18 && k.stok_kod === qrBilgi.malzemeNo.slice(-10))
            );
        }

        if (!eslesenKalem) {
            const herhangiKalem = cachedeStokKodBul(fis_no, stokKod);
            if (!herhangiKalem) {
                return res.json({
                    success: false,
                    message: `Bu ürün (${stokKod}) fişte bulunamadı!`,
                    hata_tipi: 'NOT_FOUND_STANDARD',
                    detay: { stok_kod: stokKod }
                });
            }
            eslesenKalem = uygunKalemBulStokKod(fis_no, stokKod, paketSira);
            if (!eslesenKalem) eslesenKalem = herhangiKalem;
        }

        // Paket limit kontrolü
        const toplamMiktar = toplamMiktarBulStokKod(fis_no, stokKod);

        if (!paketOkumasiYapilabilirMi(fis_no, stokKod, paketSira, toplamMiktar)) {
            const mevcutOkuma = paketOkumaSayisi(fis_no, stokKod, paketSira);
            return res.json({
                success: false,
                message: `${eslesenKalem.malzeme_adi || stokKod} (${paketSira}/${paketToplam}) için tüm okumalar tamamlandı!`,
                hata_tipi: 'PAKET_LIMIT_ASILDI',
                detay: { stok_kod: stokKod, paket_sira: paketSira, paket_toplam: paketToplam, miktar: toplamMiktar, okunan: mevcutOkuma }
            });
        }

        // Veritabanına kaydet
        const okumaKaydi = {
            fis_no: parseInt(fis_no),
            kalem_id: eslesenKalem.id,
            qr_kod: qr_kod,
            qr_hash: qrKodHash(qr_kod),
            stok_kod: stokKod,
            paket_sira: paketSira,
            kullanici: kullanici || 'bilinmiyor',
            created_at: new Date().toISOString()
        };

        const { error: insertError } = await client
            .from('cikis_fisi_okumalari')
            .insert(okumaKaydi);

        if (insertError) {
            if (insertError.code === '23505') {
                cacheyeOkumaEkle(fis_no, qr_kod, stokKod, paketSira, eslesenKalem.id);
                return res.json({ success: false, message: 'Bu paket zaten okundu!', hata_tipi: 'DUPLICATE_QR' });
            }
            return res.json({ success: false, message: 'Okuma kaydedilemedi: ' + insertError.message, hata_tipi: 'INSERT_ERROR' });
        }

        // Cache güncelle
        cacheyeOkumaEkle(fis_no, qr_kod, stokKod, paketSira, eslesenKalem.id);

        const guncelCache = fisCache.get(fis_no);

        return res.json({
            success: true,
            message: `${eslesenKalem.malzeme_adi || stokKod} (${paketSira}/${paketToplam})`,
            eslesen_kalem: {
                id: eslesenKalem.id,
                stok_kod: stokKod,
                malzeme_adi: eslesenKalem.malzeme_adi || stokKod,
                miktar: eslesenKalem.miktar
            },
            paket_bilgi: { sira: paketSira, toplam: paketToplam },
            fis_kalan_paket: guncelCache ? (guncelCache.toplamPaket - guncelCache.okunanPaket) : 0,
            fis_okunan_paket: guncelCache?.okunanPaket || 0
        });

    } catch (error) {
        console.error('Çıkış fişi QR okutma hatası:', error);
        return res.json({ success: false, message: 'Sunucu hatası: ' + error.message, hata_tipi: 'SERVER_ERROR' });
    }
});

/**
 * GET /api/cikis/malzeme-paketler/:fisNo/:kalemId
 * Bir kalem için paket detayları
 */
router.get('/malzeme-paketler/:fisNo/:kalemId', async (req, res) => {
    try {
        const { fisNo, kalemId } = req.params;

        const client = await getSupabaseClient();
        if (!client) {
            return res.status(500).json({ success: false, message: 'Veritabanı bağlantısı kurulamadı' });
        }

        const { data: kalem, error: kalemError } = await client
            .from('cikis_fisi')
            .select('*')
            .eq('id', parseInt(kalemId))
            .single();

        if (kalemError || !kalem) {
            return res.status(404).json({ success: false, message: 'Kalem bulunamadı' });
        }

        const miktar = parseFloat(kalem.miktar) || 1;
        const miktarInt = Math.ceil(miktar);
        const paketSayisi = parseInt(kalem.paket_sayisi) || 1;

        const { data: okumalar, error: okumaError } = await client
            .from('cikis_fisi_okumalari')
            .select('paket_sira')
            .eq('fis_no', parseInt(fisNo))
            .eq('kalem_id', parseInt(kalemId));

        const okumaSayilari = {};
        (okumalar || []).forEach(o => {
            const ps = o.paket_sira;
            okumaSayilari[ps] = (okumaSayilari[ps] || 0) + 1;
        });

        const paketler = [];
        for (let i = 1; i <= paketSayisi; i++) {
            paketler.push({
                paket_sira: i,
                beklenen: miktarInt,
                okunan: okumaSayilari[i] || 0
            });
        }

        return res.json({ success: true, paketler });

    } catch (error) {
        console.error('Malzeme paketler hatası:', error);
        return res.status(500).json({ success: false, message: 'Sunucu hatası: ' + error.message });
    }
});

/**
 * POST /api/cikis/toplu-okut
 * Okunmamış paketleri toplu olarak okunmuş say
 */
router.post('/toplu-okut', async (req, res) => {
    try {
        const { fis_no, kalem_id, kullanici } = req.body;

        if (!fis_no || !kalem_id) {
            return res.json({ success: false, message: 'Fiş numarası ve kalem ID gerekli' });
        }

        const client = await getSupabaseClient();
        if (!client) {
            return res.json({ success: false, message: 'Veritabanı bağlantısı kurulamadı' });
        }

        const { data: kalem, error: kalemError } = await client
            .from('cikis_fisi')
            .select('*')
            .eq('id', parseInt(kalem_id))
            .eq('evrakno_sira', parseInt(fis_no))
            .single();

        if (kalemError || !kalem) {
            return res.json({ success: false, message: 'Kalem bulunamadı' });
        }

        const miktar = parseFloat(kalem.miktar) || 1;
        const miktarInt = Math.ceil(miktar);
        const paketSayisi = parseInt(kalem.paket_sayisi) || 1;

        const { data: mevcutOkumalar } = await client
            .from('cikis_fisi_okumalari')
            .select('paket_sira')
            .eq('fis_no', parseInt(fis_no))
            .eq('kalem_id', parseInt(kalem_id));

        const okumaSayilari = {};
        (mevcutOkumalar || []).forEach(o => {
            const ps = o.paket_sira;
            okumaSayilari[ps] = (okumaSayilari[ps] || 0) + 1;
        });

        const batchId = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;

        const kayitlar = [];
        for (let ps = 1; ps <= paketSayisi; ps++) {
            const mevcut = okumaSayilari[ps] || 0;
            const eksik = miktarInt - mevcut;
            for (let k = 0; k < eksik; k++) {
                const qrKod = `MANUEL_TOPLU_${fis_no}_${kalem.id}_P${ps}_${batchId}_${k}`;
                kayitlar.push({
                    fis_no: parseInt(fis_no),
                    kalem_id: parseInt(kalem_id),
                    qr_kod: qrKod,
                    qr_hash: qrKodHash(qrKod),
                    stok_kod: kalem.stok_kod,
                    paket_sira: ps,
                    kullanici: kullanici || 'bilinmiyor',
                    created_at: new Date().toISOString()
                });
            }
        }

        if (kayitlar.length === 0) {
            return res.json({ success: false, message: 'Bu kalemin tüm paketleri zaten okunmuş' });
        }

        const { error: insertError } = await client
            .from('cikis_fisi_okumalari')
            .insert(kayitlar);

        if (insertError) {
            return res.json({ success: false, message: 'Kayıt hatası: ' + insertError.message });
        }

        kayitlar.forEach(k => {
            cacheyeOkumaEkle(fis_no.toString(), k.qr_kod, k.stok_kod, k.paket_sira, k.kalem_id);
        });

        return res.json({
            success: true,
            message: `${kalem.malzeme_adi || kalem.stok_kod} - ${kayitlar.length} paket okundu sayıldı`,
            eklenen_paket: kayitlar.length
        });

    } catch (error) {
        console.error('Toplu okutma hatası:', error);
        return res.json({ success: false, message: 'Sunucu hatası: ' + error.message });
    }
});

/**
 * GET /api/cikis/acik-fisler
 * Okutulması bitmemiş fişleri listele
 */
router.get('/acik-fisler', async (req, res) => {
    try {
        const client = await getSupabaseClient();
        if (!client) {
            return res.status(500).json({ success: false, message: 'Veritabanı bağlantısı kurulamadı' });
        }

        const { data: fisler, error } = await client
            .from('cikis_fisi')
            .select('evrakno_seri, evrakno_sira, tarih, evrak_adi, miktar, paket_sayisi')
            .order('evrakno_sira', { ascending: false });

        if (error) {
            return res.status(500).json({ success: false, message: 'Fiş listesi hatası: ' + error.message });
        }

        const fisGruplari = {};
        for (const kayit of fisler || []) {
            const key = `${kayit.evrakno_seri || ''}-${kayit.evrakno_sira}`;
            if (!fisGruplari[key]) {
                fisGruplari[key] = {
                    evrakno_seri: kayit.evrakno_seri,
                    evrakno_sira: kayit.evrakno_sira,
                    tarih: kayit.tarih,
                    evrak_adi: kayit.evrak_adi,
                    toplam_paket: 0
                };
            }
            const miktar = parseFloat(kayit.miktar) || 1;
            const paketSayisi = parseInt(kayit.paket_sayisi) || 1;
            fisGruplari[key].toplam_paket += Math.ceil(miktar * paketSayisi);
        }

        const acikFisler = [];
        for (const key of Object.keys(fisGruplari)) {
            const fis = fisGruplari[key];

            const { count, error: countError } = await client
                .from('cikis_fisi_okumalari')
                .select('*', { count: 'exact', head: true })
                .eq('fis_no', fis.evrakno_sira);

            const okunanPaket = countError ? 0 : (count || 0);

            if (okunanPaket < fis.toplam_paket) {
                acikFisler.push({
                    ...fis,
                    okunan_paket: okunanPaket,
                    kalan_paket: fis.toplam_paket - okunanPaket
                });
            }
        }

        acikFisler.sort((a, b) => b.evrakno_sira - a.evrakno_sira);

        return res.json({ success: true, fisler: acikFisler, toplam: acikFisler.length });

    } catch (error) {
        console.error('Açık fişler hatası:', error);
        return res.status(500).json({ success: false, message: 'Sunucu hatası: ' + error.message });
    }
});

/**
 * GET /api/cikis/kapatilan-fisler
 * Tamamlanmış fişleri listele (son 2 gün)
 */
router.get('/kapatilan-fisler', async (req, res) => {
    try {
        const client = await getSupabaseClient();
        if (!client) {
            return res.status(500).json({ success: false, message: 'Veritabanı bağlantısı kurulamadı' });
        }

        const ikiGunOnce = new Date();
        ikiGunOnce.setDate(ikiGunOnce.getDate() - 2);
        const tarihFiltre = ikiGunOnce.toISOString().split('T')[0];

        const { data: fisler, error } = await client
            .from('cikis_fisi')
            .select('evrakno_seri, evrakno_sira, tarih, evrak_adi, miktar, paket_sayisi')
            .gte('tarih', tarihFiltre)
            .order('evrakno_sira', { ascending: false });

        if (error) {
            return res.status(500).json({ success: false, message: 'Fiş listesi hatası: ' + error.message });
        }

        const fisGruplari = {};
        for (const kayit of fisler || []) {
            const key = `${kayit.evrakno_seri || ''}-${kayit.evrakno_sira}`;
            if (!fisGruplari[key]) {
                fisGruplari[key] = {
                    evrakno_seri: kayit.evrakno_seri,
                    evrakno_sira: kayit.evrakno_sira,
                    tarih: kayit.tarih,
                    evrak_adi: kayit.evrak_adi,
                    toplam_paket: 0
                };
            }
            const miktar = parseFloat(kayit.miktar) || 1;
            const paketSayisi = parseInt(kayit.paket_sayisi) || 1;
            fisGruplari[key].toplam_paket += Math.ceil(miktar * paketSayisi);
        }

        const kapatilanFisler = [];
        for (const key of Object.keys(fisGruplari)) {
            const fis = fisGruplari[key];

            const { count, error: countError } = await client
                .from('cikis_fisi_okumalari')
                .select('*', { count: 'exact', head: true })
                .eq('fis_no', fis.evrakno_sira);

            const okunanPaket = countError ? 0 : (count || 0);

            if (okunanPaket >= fis.toplam_paket && fis.toplam_paket > 0) {
                kapatilanFisler.push({ ...fis, okunan_paket: okunanPaket });
            }
        }

        kapatilanFisler.sort((a, b) => b.evrakno_sira - a.evrakno_sira);

        return res.json({ success: true, fisler: kapatilanFisler, toplam: kapatilanFisler.length });

    } catch (error) {
        console.error('Kapatılan fişler hatası:', error);
        return res.status(500).json({ success: false, message: 'Sunucu hatası: ' + error.message });
    }
});

module.exports = router;
