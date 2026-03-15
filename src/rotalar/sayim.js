/**
 * Sayim (Stok Sayim) Route
 * Lokasyon bazli stok sayimi: QR okutma + manuel giris + fark raporu + CSV export
 */

const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');
const { qrKodValidasyon, qrKodHash } = require('../utils/qr-parser');

// Supabase client (lazy singleton)
let supabase = null;

async function getSupabaseClient() {
    if (supabase) return supabase;
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_ANON_KEY;
    if (!url || !key) {
        console.error('Sayim: Supabase baglanti bilgileri eksik');
        return null;
    }
    supabase = createClient(url, key);
    return supabase;
}

// Sayim cache: oturum_id -> { okunanQrler, stokSayilari, sonGuncelleme, ... }
const sayimCache = new Map();
const CACHE_SURESI_MS = 30 * 60 * 1000; // 30 dk

// Lokasyon kodu mapping
const LOKASYON_KODLARI = { 'DEPO': 100, 'SUBE': 200, 'EXC': 300 };

// ─── Sayim Kodu Yardimci ────────────────────────────────────────────

/**
 * YYMMDD formatinda tarih uret
 */
function bugunKodu() {
    var simdi = new Date();
    var yy = String(simdi.getFullYear()).slice(-2);
    var mm = String(simdi.getMonth() + 1).padStart(2, '0');
    var dd = String(simdi.getDate()).padStart(2, '0');
    return yy + mm + dd;
}

/**
 * Sayim kodu uret: YYMMDD-NN (ornek: 260315-01, 260315-02)
 */
async function sayimKoduUret(client) {
    var tarihKodu = bugunKodu();
    var prefix = tarihKodu + '-';

    // O gune ait mevcut sayimlari say
    var { data, error } = await client
        .from('sayim_oturumlari')
        .select('sayim_kodu')
        .like('sayim_kodu', prefix + '%')
        .order('sayim_kodu', { ascending: false })
        .limit(1);

    var sira = 1;
    if (!error && data && data.length > 0) {
        var sonKod = data[0].sayim_kodu;
        var sonSira = parseInt(sonKod.split('-')[1]) || 0;
        sira = sonSira + 1;
    }

    return prefix + String(sira).padStart(2, '0');
}

/**
 * Parametre UUID mi yoksa sayim_kodu mu? Cozumle ve UUID dondur.
 */
async function oturumIdCozumle(parametre, client) {
    if (!parametre) return null;

    // UUID formati: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
    var uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (uuidRegex.test(parametre)) {
        return parametre;
    }

    // sayim_kodu olarak ara
    var { data, error } = await client
        .from('sayim_oturumlari')
        .select('id')
        .eq('sayim_kodu', parametre)
        .single();

    if (error || !data) return null;
    return data.id;
}

/**
 * Eski kayitlara sayim_kodu ata (null olanlari doldur)
 */
async function sayimKoduBackfill(sayimlar, client) {
    if (!sayimlar || sayimlar.length === 0) return sayimlar;
    for (var i = 0; i < sayimlar.length; i++) {
        var s = sayimlar[i];
        if (!s.sayim_kodu) {
            // Oturum baslangic tarihinden sayim_kodu uret
            var tarih = new Date(s.baslangic || s.created_at || Date.now());
            var yy = String(tarih.getFullYear()).slice(-2);
            var mm = String(tarih.getMonth() + 1).padStart(2, '0');
            var dd = String(tarih.getDate()).padStart(2, '0');
            var tarihKodu = yy + mm + dd;
            var yeniKod = await sayimKoduUretTarihli(tarihKodu, client);

            var { error } = await client
                .from('sayim_oturumlari')
                .update({ sayim_kodu: yeniKod })
                .eq('id', s.id);

            if (!error) {
                s.sayim_kodu = yeniKod;
            }
        }
    }
    return sayimlar;
}

/**
 * Belirli bir tarih kodu icin sayim_kodu uret
 */
async function sayimKoduUretTarihli(tarihKodu, client) {
    var prefix = tarihKodu + '-';
    var { data } = await client
        .from('sayim_oturumlari')
        .select('sayim_kodu')
        .like('sayim_kodu', prefix + '%')
        .order('sayim_kodu', { ascending: false })
        .limit(1);

    var sira = 1;
    if (data && data.length > 0 && data[0].sayim_kodu) {
        var sonSira = parseInt(data[0].sayim_kodu.split('-')[1]) || 0;
        sira = sonSira + 1;
    }
    return prefix + String(sira).padStart(2, '0');
}

// ─── Cache Fonksiyonlari ───────────────────────────────────────────

async function sayimCacheYukle(oturumId, client, zorlaYenile) {
    var cache = sayimCache.get(oturumId);
    if (cache && !zorlaYenile && (Date.now() - cache.sonGuncelleme < CACHE_SURESI_MS)) {
        return cache;
    }

    // Mevcut okumalari cek
    var { data: okumalar, error } = await client
        .from('sayim_okumalari')
        .select('id, stok_kod, malzeme_adi, qr_kod, paket_sira, paket_toplam, manuel, adet')
        .eq('oturum_id', oturumId);

    if (error) {
        console.error('Sayim cache yukleme hatasi:', error.message);
        return null;
    }

    var okunanQrler = new Set();
    var stokSayilari = new Map();

    (okumalar || []).forEach(function(okuma) {
        if (okuma.qr_kod) {
            okunanQrler.add(okuma.qr_kod);
        }

        var mevcut = stokSayilari.get(okuma.stok_kod);
        if (!mevcut) {
            mevcut = { qrOkumalar: [], manuelAdet: 0, malzemeAdi: okuma.malzeme_adi || okuma.stok_kod };
            stokSayilari.set(okuma.stok_kod, mevcut);
        }

        if (okuma.manuel) {
            mevcut.manuelAdet += (okuma.adet || 1);
        } else {
            mevcut.qrOkumalar.push({
                paketSira: okuma.paket_sira,
                paketToplam: okuma.paket_toplam
            });
        }

        if (okuma.malzeme_adi) {
            mevcut.malzemeAdi = okuma.malzeme_adi;
        }
    });

    cache = {
        okunanQrler: okunanQrler,
        stokSayilari: stokSayilari,
        sonGuncelleme: Date.now(),
        toplamOkuma: (okumalar || []).length
    };

    sayimCache.set(oturumId, cache);
    return cache;
}

function cachedeQrVarMi(oturumId, qrKod) {
    var cache = sayimCache.get(oturumId);
    return cache ? cache.okunanQrler.has(qrKod) : false;
}

function cacheyeOkumaEkle(oturumId, qrKod, stokKod, malzemeAdi, paketSira, paketToplam, manuel, adet) {
    var cache = sayimCache.get(oturumId);
    if (!cache) return;

    if (qrKod) {
        cache.okunanQrler.add(qrKod);
    }

    var mevcut = cache.stokSayilari.get(stokKod);
    if (!mevcut) {
        mevcut = { qrOkumalar: [], manuelAdet: 0, malzemeAdi: malzemeAdi || stokKod };
        cache.stokSayilari.set(stokKod, mevcut);
    }

    if (manuel) {
        mevcut.manuelAdet += (adet || 1);
    } else {
        mevcut.qrOkumalar.push({ paketSira: paketSira, paketToplam: paketToplam });
    }

    if (malzemeAdi) {
        mevcut.malzemeAdi = malzemeAdi;
    }

    cache.toplamOkuma++;
    cache.sonGuncelleme = Date.now();
}

// ─── Yardimci Fonksiyonlar ─────────────────────────────────────────

function urunSayisiHesapla(stokBilgi) {
    var toplam = stokBilgi.manuelAdet;

    if (stokBilgi.qrOkumalar.length > 0) {
        var paketGruplari = new Map();
        stokBilgi.qrOkumalar.forEach(function(okuma) {
            var pt = okuma.paketToplam || 1;
            if (!paketGruplari.has(pt)) {
                paketGruplari.set(pt, []);
            }
            paketGruplari.get(pt).push(okuma.paketSira);
        });

        paketGruplari.forEach(function(siralar, paketToplam) {
            var siraSet = {};
            siralar.forEach(function(s) {
                siraSet[s] = (siraSet[s] || 0) + 1;
            });

            var tamSetler = Infinity;
            for (var s = 1; s <= paketToplam; s++) {
                var sayi = siraSet[s] || 0;
                if (sayi < tamSetler) tamSetler = sayi;
            }
            if (tamSetler === Infinity) tamSetler = 0;
            toplam += tamSetler;
        });
    }

    return toplam;
}

// ─── Endpoint'ler ──────────────────────────────────────────────────

/**
 * POST /api/sayim/oturum-olustur
 * Yeni sayim oturumu olustur
 */
router.post('/oturum-olustur', async function(req, res) {
    try {
        var lokasyon = (req.body.lokasyon || '').toUpperCase();
        var kullanici = req.body.kullanici || req.session.kullanici?.kullaniciAdi || 'bilinmiyor';

        if (!LOKASYON_KODLARI[lokasyon]) {
            return res.json({ success: false, message: 'Gecersiz lokasyon. DEPO, SUBE veya EXC olmali.' });
        }

        var client = await getSupabaseClient();
        if (!client) return res.json({ success: false, message: 'Veritabani baglantisi kurulamadi' });

        // Sayim kodu uret
        var sayimKodu = await sayimKoduUret(client);

        var { data, error } = await client
            .from('sayim_oturumlari')
            .insert({
                lokasyon: lokasyon,
                lokasyon_kodu: LOKASYON_KODLARI[lokasyon],
                kullanici: kullanici,
                durum: 'acik',
                sayim_kodu: sayimKodu
            })
            .select()
            .single();

        if (error) {
            console.error('Sayim oturum olusturma hatasi:', error.message);
            return res.json({ success: false, message: 'Oturum olusturulamadi: ' + error.message });
        }

        return res.json({ success: true, oturum_id: data.id, sayim_kodu: sayimKodu, lokasyon: lokasyon });

    } catch (err) {
        console.error('Sayim oturum olusturma hata:', err);
        return res.json({ success: false, message: 'Sunucu hatasi: ' + err.message });
    }
});

/**
 * GET /api/sayim/acik-sayimlar/:lokasyon
 */
router.get('/acik-sayimlar/:lokasyon', async function(req, res) {
    try {
        var lokasyon = (req.params.lokasyon || '').toUpperCase();
        var client = await getSupabaseClient();
        if (!client) return res.json({ success: false, message: 'Veritabani baglantisi kurulamadi' });

        var { data, error } = await client
            .from('sayim_oturumlari')
            .select('*')
            .eq('lokasyon', lokasyon)
            .eq('durum', 'acik')
            .order('baslangic', { ascending: false });

        if (error) {
            return res.json({ success: false, message: 'Sayimlar yuklenemedi: ' + error.message });
        }

        // Eski kayitlara sayim_kodu ata
        await sayimKoduBackfill(data, client);

        return res.json({ success: true, sayimlar: data || [] });

    } catch (err) {
        console.error('Acik sayimlar hatasi:', err);
        return res.json({ success: false, message: 'Sunucu hatasi: ' + err.message });
    }
});

/**
 * GET /api/sayim/kapatilan-sayimlar/:lokasyon
 */
router.get('/kapatilan-sayimlar/:lokasyon', async function(req, res) {
    try {
        var lokasyon = (req.params.lokasyon || '').toUpperCase();
        var client = await getSupabaseClient();
        if (!client) return res.json({ success: false, message: 'Veritabani baglantisi kurulamadi' });

        var tarihSinir = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();

        var { data, error } = await client
            .from('sayim_oturumlari')
            .select('*')
            .eq('lokasyon', lokasyon)
            .eq('durum', 'tamamlandi')
            .gte('bitis', tarihSinir)
            .order('bitis', { ascending: false });

        if (error) {
            return res.json({ success: false, message: 'Sayimlar yuklenemedi: ' + error.message });
        }

        // Eski kayitlara sayim_kodu ata
        await sayimKoduBackfill(data, client);

        return res.json({ success: true, sayimlar: data || [] });

    } catch (err) {
        console.error('Kapatilan sayimlar hatasi:', err);
        return res.json({ success: false, message: 'Sunucu hatasi: ' + err.message });
    }
});

/**
 * POST /api/sayim/qr-okut
 * QR kod okut ve kaydet
 */
router.post('/qr-okut', async function(req, res) {
    try {
        var oturum_param = req.body.oturum_id;
        var qr_kod = req.body.qr_kod;
        var kullanici = req.body.kullanici || req.session.kullanici?.kullaniciAdi || 'bilinmiyor';

        if (!oturum_param) return res.json({ success: false, message: 'Oturum ID eksik', hata_tipi: 'MISSING_OTURUM' });
        if (!qr_kod) return res.json({ success: false, message: 'QR kod eksik', hata_tipi: 'MISSING_QR' });

        var client = await getSupabaseClient();
        if (!client) return res.json({ success: false, message: 'Veritabani baglantisi kurulamadi', hata_tipi: 'DB_CONNECTION' });

        var oturum_id = await oturumIdCozumle(oturum_param, client);
        if (!oturum_id) return res.json({ success: false, message: 'Sayim oturumu bulunamadi', hata_tipi: 'INVALID_OTURUM' });

        // QR validasyon (GS1 only)
        var qrBilgi = qrKodValidasyon(qr_kod);
        if (!qrBilgi.basarili) {
            return res.json({
                success: false,
                message: 'QR kod okunamadi: ' + qrBilgi.hata,
                hata_tipi: 'INVALID_QR'
            });
        }
        qr_kod = qrBilgi.qrKodHam;

        var stokKod = qrBilgi.malzemeNo.slice(-10);

        // Cache yukle
        var cache = await sayimCacheYukle(oturum_id, client);
        if (!cache) return res.json({ success: false, message: 'Cache yuklenemedi', hata_tipi: 'CACHE_ERROR' });

        // Duplicate kontrol
        if (cachedeQrVarMi(oturum_id, qr_kod)) {
            return res.json({
                success: false,
                message: 'Bu paket zaten okundu!',
                hata_tipi: 'DUPLICATE_QR',
                from_cache: true
            });
        }

        // Urun adini bulmak icin stok API'sinden ara
        var malzemeAdi = stokKod;
        try {
            var { stokVerisiYukle } = require('./stok');
            var stokData = await stokVerisiYukle();
            if (stokData && stokData.veriler) {
                var bulunan = stokData.veriler.find(function(k) {
                    var kod = Object.values(k)[0]?.toString() || '';
                    return kod === stokKod;
                });
                if (bulunan && bulunan['Malzeme Ad\u0131']) {
                    malzemeAdi = bulunan['Malzeme Ad\u0131'];
                }
            }
        } catch (e) {
            // Stok verisine ulasilamazsa stokKod kullan
        }

        // DB'ye kaydet
        var okumaKaydi = {
            oturum_id: oturum_id,
            stok_kod: stokKod,
            malzeme_adi: malzemeAdi,
            qr_kod: qr_kod,
            qr_hash: qrKodHash(qr_kod),
            paket_sira: qrBilgi.paketSira,
            paket_toplam: qrBilgi.paketToplam,
            malzeme_no_qr: qrBilgi.malzemeNo,
            manuel: false,
            adet: 1,
            kullanici: kullanici,
            created_at: new Date().toISOString()
        };

        var { data: yeniOkuma, error: insertError } = await client
            .from('sayim_okumalari')
            .insert(okumaKaydi)
            .select()
            .single();

        if (insertError) {
            if (insertError.code === '23505') {
                cacheyeOkumaEkle(oturum_id, qr_kod, stokKod, malzemeAdi, qrBilgi.paketSira, qrBilgi.paketToplam, false, 1);
                return res.json({
                    success: false,
                    message: 'Bu paket zaten okundu!',
                    hata_tipi: 'DUPLICATE_QR'
                });
            }
            return res.json({ success: false, message: 'Kayit hatasi: ' + insertError.message, hata_tipi: 'INSERT_ERROR' });
        }

        // Cache guncelle
        cacheyeOkumaEkle(oturum_id, qr_kod, stokKod, malzemeAdi, qrBilgi.paketSira, qrBilgi.paketToplam, false, 1);

        // Oturum istatistiklerini guncelle
        var guncelCache = sayimCache.get(oturum_id);
        var toplamCesit = guncelCache ? guncelCache.stokSayilari.size : 0;
        var toplamOkuma = guncelCache ? guncelCache.toplamOkuma : 0;

        await client
            .from('sayim_oturumlari')
            .update({ toplam_cesit: toplamCesit, toplam_adet: toplamOkuma })
            .eq('id', oturum_id);

        return res.json({
            success: true,
            message: malzemeAdi + ' (P' + qrBilgi.paketSira + '/' + qrBilgi.paketToplam + ')',
            stok_kod: stokKod,
            malzeme_adi: malzemeAdi,
            paket_bilgi: { sira: qrBilgi.paketSira, toplam: qrBilgi.paketToplam },
            toplam_cesit: toplamCesit,
            toplam_okuma: toplamOkuma,
            okuma_id: yeniOkuma?.id
        });

    } catch (err) {
        console.error('Sayim QR okutma hatasi:', err);
        return res.json({ success: false, message: 'Sunucu hatasi: ' + err.message, hata_tipi: 'SERVER_ERROR' });
    }
});

/**
 * POST /api/sayim/manuel-ekle
 */
router.post('/manuel-ekle', async function(req, res) {
    try {
        var oturum_param = req.body.oturum_id;
        var stok_kod = (req.body.stok_kod || '').trim();
        var malzeme_adi = (req.body.malzeme_adi || '').trim();
        var adet = parseInt(req.body.adet) || 1;
        var kullanici = req.body.kullanici || req.session.kullanici?.kullaniciAdi || 'bilinmiyor';

        if (!oturum_param) return res.json({ success: false, message: 'Oturum ID eksik' });
        if (!stok_kod) return res.json({ success: false, message: 'Stok kodu eksik' });
        if (adet < 1) return res.json({ success: false, message: 'Adet en az 1 olmali' });

        var client = await getSupabaseClient();
        if (!client) return res.json({ success: false, message: 'Veritabani baglantisi kurulamadi' });

        var oturum_id = await oturumIdCozumle(oturum_param, client);
        if (!oturum_id) return res.json({ success: false, message: 'Sayim oturumu bulunamadi' });

        var okumaKaydi = {
            oturum_id: oturum_id,
            stok_kod: stok_kod,
            malzeme_adi: malzeme_adi || stok_kod,
            qr_kod: null,
            qr_hash: null,
            paket_sira: null,
            paket_toplam: null,
            malzeme_no_qr: null,
            manuel: true,
            adet: adet,
            kullanici: kullanici,
            created_at: new Date().toISOString()
        };

        var { data: yeniOkuma, error: insertError } = await client
            .from('sayim_okumalari')
            .insert(okumaKaydi)
            .select()
            .single();

        if (insertError) {
            return res.json({ success: false, message: 'Kayit hatasi: ' + insertError.message });
        }

        // Cache guncelle
        var cache = await sayimCacheYukle(oturum_id, client);
        if (cache) {
            cacheyeOkumaEkle(oturum_id, null, stok_kod, malzeme_adi || stok_kod, null, null, true, adet);
        }

        var guncelCache = sayimCache.get(oturum_id);
        var toplamCesit = guncelCache ? guncelCache.stokSayilari.size : 0;
        var toplamOkuma = guncelCache ? guncelCache.toplamOkuma : 0;

        await client
            .from('sayim_oturumlari')
            .update({ toplam_cesit: toplamCesit, toplam_adet: toplamOkuma })
            .eq('id', oturum_id);

        return res.json({
            success: true,
            message: (malzeme_adi || stok_kod) + ' x' + adet + ' eklendi',
            stok_kod: stok_kod,
            malzeme_adi: malzeme_adi || stok_kod,
            adet: adet,
            toplam_cesit: toplamCesit,
            toplam_okuma: toplamOkuma,
            okuma_id: yeniOkuma?.id
        });

    } catch (err) {
        console.error('Sayim manuel ekleme hatasi:', err);
        return res.json({ success: false, message: 'Sunucu hatasi: ' + err.message });
    }
});

/**
 * GET /api/sayim/oturum-durumu/:id
 * id = UUID veya sayim_kodu
 */
router.get('/oturum-durumu/:id', async function(req, res) {
    try {
        var parametre = req.params.id;
        var client = await getSupabaseClient();
        if (!client) return res.json({ success: false, message: 'Veritabani baglantisi kurulamadi' });

        var oturumId = await oturumIdCozumle(parametre, client);
        if (!oturumId) return res.json({ success: false, message: 'Sayim oturumu bulunamadi' });

        // Oturum bilgisi
        var { data: oturum, error: oturumError } = await client
            .from('sayim_oturumlari')
            .select('*')
            .eq('id', oturumId)
            .single();

        if (oturumError || !oturum) {
            return res.json({ success: false, message: 'Sayim oturumu bulunamadi' });
        }

        // Okumalari cek
        var { data: okumalar, error: okumaError } = await client
            .from('sayim_okumalari')
            .select('*')
            .eq('oturum_id', oturumId)
            .order('created_at', { ascending: false });

        if (okumaError) {
            return res.json({ success: false, message: 'Okumalar yuklenemedi: ' + okumaError.message });
        }

        // Stok bazinda grupla
        var stokGruplari = {};
        (okumalar || []).forEach(function(okuma) {
            if (!stokGruplari[okuma.stok_kod]) {
                stokGruplari[okuma.stok_kod] = {
                    stok_kod: okuma.stok_kod,
                    malzeme_adi: okuma.malzeme_adi || okuma.stok_kod,
                    qrOkumalar: [],
                    manuelAdet: 0,
                    okumalar: []
                };
            }
            var grup = stokGruplari[okuma.stok_kod];

            if (okuma.manuel) {
                grup.manuelAdet += (okuma.adet || 1);
            } else {
                grup.qrOkumalar.push({
                    paketSira: okuma.paket_sira,
                    paketToplam: okuma.paket_toplam
                });
            }

            if (okuma.malzeme_adi) {
                grup.malzeme_adi = okuma.malzeme_adi;
            }

            grup.okumalar.push({
                id: okuma.id,
                paket_sira: okuma.paket_sira,
                paket_toplam: okuma.paket_toplam,
                manuel: okuma.manuel,
                adet: okuma.adet,
                created_at: okuma.created_at
            });
        });

        var urunListesi = Object.values(stokGruplari).map(function(grup) {
            var urunAdedi = urunSayisiHesapla({
                qrOkumalar: grup.qrOkumalar,
                manuelAdet: grup.manuelAdet
            });
            return {
                stok_kod: grup.stok_kod,
                malzeme_adi: grup.malzeme_adi,
                urun_adedi: urunAdedi,
                qr_okuma_sayisi: grup.qrOkumalar.length,
                manuel_adet: grup.manuelAdet,
                paket_detay: grup.qrOkumalar,
                okumalar: grup.okumalar
            };
        });

        urunListesi.sort(function(a, b) {
            return (a.malzeme_adi || '').localeCompare(b.malzeme_adi || '', 'tr');
        });

        return res.json({
            success: true,
            oturum: oturum,
            urunler: urunListesi,
            toplam_cesit: urunListesi.length,
            toplam_okuma: (okumalar || []).length,
            toplam_urun: urunListesi.reduce(function(acc, u) { return acc + u.urun_adedi; }, 0)
        });

    } catch (err) {
        console.error('Sayim oturum durumu hatasi:', err);
        return res.json({ success: false, message: 'Sunucu hatasi: ' + err.message });
    }
});

/**
 * POST /api/sayim/kapat/:id
 */
router.post('/kapat/:id', async function(req, res) {
    try {
        var parametre = req.params.id;
        var client = await getSupabaseClient();
        if (!client) return res.json({ success: false, message: 'Veritabani baglantisi kurulamadi' });

        var oturumId = await oturumIdCozumle(parametre, client);
        if (!oturumId) return res.json({ success: false, message: 'Sayim oturumu bulunamadi' });

        var { data: oturum, error: oturumError } = await client
            .from('sayim_oturumlari')
            .select('id, durum')
            .eq('id', oturumId)
            .single();

        if (oturumError || !oturum) {
            return res.json({ success: false, message: 'Sayim oturumu bulunamadi' });
        }

        if (oturum.durum === 'tamamlandi') {
            return res.json({ success: false, message: 'Bu sayim zaten kapatilmis' });
        }

        var { data: okumalar } = await client
            .from('sayim_okumalari')
            .select('stok_kod')
            .eq('oturum_id', oturumId);

        var cesitSet = new Set();
        (okumalar || []).forEach(function(o) { cesitSet.add(o.stok_kod); });

        var { error: updateError } = await client
            .from('sayim_oturumlari')
            .update({
                durum: 'tamamlandi',
                bitis: new Date().toISOString(),
                toplam_cesit: cesitSet.size,
                toplam_adet: (okumalar || []).length
            })
            .eq('id', oturumId);

        if (updateError) {
            return res.json({ success: false, message: 'Sayim kapatilamadi: ' + updateError.message });
        }

        sayimCache.delete(oturumId);

        return res.json({ success: true, message: 'Sayim basariyla kapatildi' });

    } catch (err) {
        console.error('Sayim kapatma hatasi:', err);
        return res.json({ success: false, message: 'Sunucu hatasi: ' + err.message });
    }
});

/**
 * GET /api/sayim/rapor/:id
 */
router.get('/rapor/:id', async function(req, res) {
    try {
        var parametre = req.params.id;
        var client = await getSupabaseClient();
        if (!client) return res.json({ success: false, message: 'Veritabani baglantisi kurulamadi' });

        var oturumId = await oturumIdCozumle(parametre, client);
        if (!oturumId) return res.json({ success: false, message: 'Sayim oturumu bulunamadi' });

        var { data: oturum } = await client
            .from('sayim_oturumlari')
            .select('lokasyon')
            .eq('id', oturumId)
            .single();

        if (!oturum) {
            return res.json({ success: false, message: 'Sayim oturumu bulunamadi' });
        }

        var { data: okumalar } = await client
            .from('sayim_okumalari')
            .select('stok_kod, malzeme_adi, paket_sira, paket_toplam, manuel, adet')
            .eq('oturum_id', oturumId);

        var sayilanMap = {};
        (okumalar || []).forEach(function(okuma) {
            if (!sayilanMap[okuma.stok_kod]) {
                sayilanMap[okuma.stok_kod] = {
                    malzemeAdi: okuma.malzeme_adi || okuma.stok_kod,
                    qrOkumalar: [],
                    manuelAdet: 0
                };
            }
            var item = sayilanMap[okuma.stok_kod];
            if (okuma.manuel) {
                item.manuelAdet += (okuma.adet || 1);
            } else {
                item.qrOkumalar.push({ paketSira: okuma.paket_sira, paketToplam: okuma.paket_toplam });
            }
            if (okuma.malzeme_adi) item.malzemeAdi = okuma.malzeme_adi;
        });

        var beklenenMap = {};
        var lokasyonKolonu = oturum.lokasyon;
        try {
            var { stokVerisiYukle } = require('./stok');
            var stokData = await stokVerisiYukle();
            if (stokData && stokData.veriler) {
                stokData.veriler.forEach(function(kayit) {
                    var kod = Object.values(kayit)[0]?.toString() || '';
                    if (!kod) return;
                    var beklenenDeger = parseFloat(kayit[lokasyonKolonu]) || 0;
                    if (beklenenDeger > 0 || sayilanMap[kod]) {
                        beklenenMap[kod] = {
                            malzemeAdi: kayit['Malzeme Ad\u0131'] || kod,
                            beklenen: beklenenDeger
                        };
                    }
                });
            }
        } catch (e) {
            console.error('Sayim rapor - stok verisi yuklenemedi:', e.message);
        }

        var rapor = [];
        var tumKodlar = new Set([...Object.keys(sayilanMap), ...Object.keys(beklenenMap)]);

        tumKodlar.forEach(function(kod) {
            var sayilan = sayilanMap[kod];
            var beklenen = beklenenMap[kod];

            var sayilanAdet = 0;
            if (sayilan) {
                sayilanAdet = urunSayisiHesapla({
                    qrOkumalar: sayilan.qrOkumalar,
                    manuelAdet: sayilan.manuelAdet
                });
            }

            var beklenenAdet = beklenen ? beklenen.beklenen : 0;
            var fark = sayilanAdet - beklenenAdet;
            var durum = fark === 0 ? 'esit' : (fark < 0 ? 'eksik' : 'fazla');

            rapor.push({
                stok_kod: kod,
                malzeme_adi: (sayilan && sayilan.malzemeAdi) || (beklenen && beklenen.malzemeAdi) || kod,
                beklenen: beklenenAdet,
                sayilan: sayilanAdet,
                fark: fark,
                durum: durum
            });
        });

        rapor.sort(function(a, b) {
            return (a.malzeme_adi || '').localeCompare(b.malzeme_adi || '', 'tr');
        });

        var ozet = {
            toplam_cesit: rapor.length,
            esit: rapor.filter(function(r) { return r.durum === 'esit'; }).length,
            eksik: rapor.filter(function(r) { return r.durum === 'eksik'; }).length,
            fazla: rapor.filter(function(r) { return r.durum === 'fazla'; }).length
        };

        return res.json({
            success: true,
            lokasyon: oturum.lokasyon,
            rapor: rapor,
            ozet: ozet
        });

    } catch (err) {
        console.error('Sayim rapor hatasi:', err);
        return res.json({ success: false, message: 'Sunucu hatasi: ' + err.message });
    }
});

/**
 * GET /api/sayim/csv-indir/:id
 */
router.get('/csv-indir/:id', async function(req, res) {
    try {
        var parametre = req.params.id;
        var client = await getSupabaseClient();
        if (!client) return res.status(500).send('Veritabani baglantisi kurulamadi');

        var oturumId = await oturumIdCozumle(parametre, client);
        if (!oturumId) return res.status(404).send('Sayim oturumu bulunamadi');

        var { data: oturum } = await client
            .from('sayim_oturumlari')
            .select('lokasyon, baslangic, sayim_kodu')
            .eq('id', oturumId)
            .single();

        if (!oturum) return res.status(404).send('Sayim oturumu bulunamadi');

        var { data: okumalar } = await client
            .from('sayim_okumalari')
            .select('stok_kod, malzeme_adi, paket_sira, paket_toplam, manuel, adet')
            .eq('oturum_id', oturumId);

        var sayilanMap = {};
        (okumalar || []).forEach(function(okuma) {
            if (!sayilanMap[okuma.stok_kod]) {
                sayilanMap[okuma.stok_kod] = { malzemeAdi: okuma.malzeme_adi || okuma.stok_kod, qrOkumalar: [], manuelAdet: 0 };
            }
            var item = sayilanMap[okuma.stok_kod];
            if (okuma.manuel) { item.manuelAdet += (okuma.adet || 1); }
            else { item.qrOkumalar.push({ paketSira: okuma.paket_sira, paketToplam: okuma.paket_toplam }); }
            if (okuma.malzeme_adi) item.malzemeAdi = okuma.malzeme_adi;
        });

        var beklenenMap = {};
        try {
            var { stokVerisiYukle } = require('./stok');
            var stokData = await stokVerisiYukle();
            if (stokData && stokData.veriler) {
                stokData.veriler.forEach(function(kayit) {
                    var kod = Object.values(kayit)[0]?.toString() || '';
                    if (!kod) return;
                    var beklenenDeger = parseFloat(kayit[oturum.lokasyon]) || 0;
                    if (beklenenDeger > 0 || sayilanMap[kod]) {
                        beklenenMap[kod] = { malzemeAdi: kayit['Malzeme Ad\u0131'] || kod, beklenen: beklenenDeger };
                    }
                });
            }
        } catch (e) { /* devam et */ }

        var tumKodlar = new Set([...Object.keys(sayilanMap), ...Object.keys(beklenenMap)]);
        var satirlar = [];

        tumKodlar.forEach(function(kod) {
            var sayilan = sayilanMap[kod];
            var beklenen = beklenenMap[kod];
            var sayilanAdet = 0;
            if (sayilan) {
                sayilanAdet = urunSayisiHesapla({ qrOkumalar: sayilan.qrOkumalar, manuelAdet: sayilan.manuelAdet });
            }
            var beklenenAdet = beklenen ? beklenen.beklenen : 0;
            var fark = sayilanAdet - beklenenAdet;
            var durum = fark === 0 ? 'Esit' : (fark < 0 ? 'Eksik' : 'Fazla');
            var ad = (sayilan && sayilan.malzemeAdi) || (beklenen && beklenen.malzemeAdi) || kod;

            satirlar.push([kod, '"' + ad.replace(/"/g, '""') + '"', beklenenAdet, sayilanAdet, fark, durum].join(';'));
        });

        satirlar.sort(function(a, b) {
            return a.localeCompare(b, 'tr');
        });

        var dosyaAdi = 'sayim_' + (oturum.sayim_kodu || oturum.lokasyon) + '.csv';

        var csvIcerik = '\uFEFF';
        csvIcerik += 'Stok Kod;Urun Adi;Beklenen;Sayilan;Fark;Durum\n';
        csvIcerik += satirlar.join('\n');

        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', 'attachment; filename="' + dosyaAdi + '"');
        return res.send(csvIcerik);

    } catch (err) {
        console.error('Sayim CSV hatasi:', err);
        return res.status(500).send('CSV olusturulamadi: ' + err.message);
    }
});

/**
 * DELETE /api/sayim/okuma-sil/:id
 */
router.delete('/okuma-sil/:id', async function(req, res) {
    try {
        var okumaId = req.params.id;
        var client = await getSupabaseClient();
        if (!client) return res.json({ success: false, message: 'Veritabani baglantisi kurulamadi' });

        var { data: okuma } = await client
            .from('sayim_okumalari')
            .select('oturum_id')
            .eq('id', okumaId)
            .single();

        if (!okuma) {
            return res.json({ success: false, message: 'Okuma bulunamadi' });
        }

        var { error: deleteError } = await client
            .from('sayim_okumalari')
            .delete()
            .eq('id', okumaId);

        if (deleteError) {
            return res.json({ success: false, message: 'Silme hatasi: ' + deleteError.message });
        }

        sayimCache.delete(okuma.oturum_id);

        return res.json({ success: true, message: 'Okuma silindi' });

    } catch (err) {
        console.error('Sayim okuma silme hatasi:', err);
        return res.json({ success: false, message: 'Sunucu hatasi: ' + err.message });
    }
});

/**
 * GET /api/sayim/sayim-durumu/:id
 * Sayim durumu + PRGsheet beklenen verisi (malzeme listesi icin)
 * teslimat-okut'taki fatura-durumu benzeri: kalemler + progress
 */
router.get('/sayim-durumu/:id', async function(req, res) {
    try {
        var parametre = req.params.id;
        var client = await getSupabaseClient();
        if (!client) return res.json({ success: false, message: 'Veritabani baglantisi kurulamadi' });

        var oturumId = await oturumIdCozumle(parametre, client);
        if (!oturumId) return res.json({ success: false, message: 'Sayim oturumu bulunamadi' });

        // Oturum bilgisi
        var { data: oturum } = await client
            .from('sayim_oturumlari')
            .select('*')
            .eq('id', oturumId)
            .single();

        if (!oturum) return res.json({ success: false, message: 'Sayim oturumu bulunamadi' });

        // Okumalari cek
        var { data: okumalar } = await client
            .from('sayim_okumalari')
            .select('*')
            .eq('oturum_id', oturumId)
            .order('created_at', { ascending: false });

        // Stok bazinda grupla (sayilan)
        var sayilanMap = {};
        (okumalar || []).forEach(function(okuma) {
            if (!sayilanMap[okuma.stok_kod]) {
                sayilanMap[okuma.stok_kod] = {
                    malzemeAdi: okuma.malzeme_adi || okuma.stok_kod,
                    qrOkumalar: [],
                    manuelAdet: 0,
                    paketToplam: null
                };
            }
            var item = sayilanMap[okuma.stok_kod];
            if (okuma.manuel) {
                item.manuelAdet += (okuma.adet || 1);
            } else {
                item.qrOkumalar.push({
                    paketSira: okuma.paket_sira,
                    paketToplam: okuma.paket_toplam
                });
                if (okuma.paket_toplam) {
                    item.paketToplam = okuma.paket_toplam;
                }
            }
            if (okuma.malzeme_adi) item.malzemeAdi = okuma.malzeme_adi;
        });

        // PRGsheet stok verisi (beklenen)
        var beklenenMap = {};
        try {
            var { stokVerisiYukle } = require('./stok');
            var stokData = await stokVerisiYukle();
            if (stokData && stokData.veriler) {
                stokData.veriler.forEach(function(kayit) {
                    var kod = Object.values(kayit)[0]?.toString() || '';
                    if (!kod) return;
                    var beklenenDeger = parseFloat(kayit[oturum.lokasyon]) || 0;
                    if (beklenenDeger > 0) {
                        beklenenMap[kod] = {
                            malzemeAdi: kayit['Malzeme Ad\u0131'] || kod,
                            beklenen: beklenenDeger
                        };
                    }
                });
            }
        } catch (e) {
            console.error('Sayim durumu - stok verisi yuklenemedi:', e.message);
        }

        // Kalemleri birlestir
        var tumKodlar = new Set([...Object.keys(beklenenMap), ...Object.keys(sayilanMap)]);
        var kalemler = [];

        tumKodlar.forEach(function(kod) {
            var beklenen = beklenenMap[kod];
            var sayilan = sayilanMap[kod];

            var beklenenAdet = beklenen ? beklenen.beklenen : 0;
            var sayilanAdet = 0;
            var okunanPaket = 0;
            var manuelAdet = 0;

            if (sayilan) {
                sayilanAdet = urunSayisiHesapla({
                    qrOkumalar: sayilan.qrOkumalar,
                    manuelAdet: sayilan.manuelAdet
                });
                okunanPaket = sayilan.qrOkumalar.length;
                manuelAdet = sayilan.manuelAdet;
            }

            var durum = 'status-gray';
            if (sayilanAdet > 0 && sayilanAdet >= beklenenAdet) durum = 'status-green';
            else if (sayilanAdet > 0 || okunanPaket > 0 || manuelAdet > 0) durum = 'status-yellow';

            kalemler.push({
                stok_kod: kod,
                malzeme_adi: (beklenen && beklenen.malzemeAdi) || (sayilan && sayilan.malzemeAdi) || kod,
                beklenen: beklenenAdet,
                sayilan: sayilanAdet,
                okunan_paket: okunanPaket,
                manuel_adet: manuelAdet,
                durum: durum
            });
        });

        // Siralama: yellow -> gray -> green
        var durumSira = { 'status-yellow': 0, 'status-gray': 1, 'status-green': 2 };
        kalemler.sort(function(a, b) {
            var fark = durumSira[a.durum] - durumSira[b.durum];
            if (fark !== 0) return fark;
            return (a.malzeme_adi || '').localeCompare(b.malzeme_adi || '', 'tr');
        });

        // Toplamlar
        var toplamBeklenen = kalemler.reduce(function(t, k) { return t + k.beklenen; }, 0);
        var toplamSayilan = kalemler.reduce(function(t, k) { return t + k.sayilan; }, 0);
        var yuzde = toplamBeklenen > 0 ? Math.round((toplamSayilan / toplamBeklenen) * 100) : 0;
        if (yuzde > 100) yuzde = 100;

        return res.json({
            success: true,
            sayim_kodu: oturum.sayim_kodu,
            lokasyon: oturum.lokasyon,
            durum: oturum.durum,
            tamamlanma_yuzdesi: yuzde,
            toplam_cesit: kalemler.length,
            toplam_urun: toplamBeklenen,
            sayilan_urun: toplamSayilan,
            kalemler: kalemler
        });

    } catch (err) {
        console.error('Sayim durumu hatasi:', err);
        return res.json({ success: false, message: 'Sunucu hatasi: ' + err.message });
    }
});

/**
 * GET /api/sayim/sayim-paket-detay/:oturumId/:stokKod
 * Bir urunun paket detaylari (expand icin)
 */
router.get('/sayim-paket-detay/:oturumId/:stokKod', async function(req, res) {
    try {
        var oturumParam = req.params.oturumId;
        var stokKod = decodeURIComponent(req.params.stokKod);

        var client = await getSupabaseClient();
        if (!client) return res.json({ success: false, message: 'Veritabani baglantisi kurulamadi' });

        var oturumId = await oturumIdCozumle(oturumParam, client);
        if (!oturumId) return res.json({ success: false, message: 'Oturum bulunamadi' });

        var { data: okumalar } = await client
            .from('sayim_okumalari')
            .select('id, paket_sira, paket_toplam, manuel, adet, created_at')
            .eq('oturum_id', oturumId)
            .eq('stok_kod', stokKod)
            .order('created_at', { ascending: true });

        if (!okumalar || okumalar.length === 0) {
            return res.json({ success: true, paketler: [], manuel_adet: 0 });
        }

        var paketToplam = null;
        var manuelAdet = 0;
        var paketSayilari = {};

        okumalar.forEach(function(o) {
            if (o.manuel) {
                manuelAdet += (o.adet || 1);
            } else {
                if (o.paket_toplam) paketToplam = o.paket_toplam;
                var sira = o.paket_sira || 0;
                paketSayilari[sira] = (paketSayilari[sira] || 0) + 1;
            }
        });

        var paketler = [];
        if (paketToplam) {
            for (var i = 1; i <= paketToplam; i++) {
                paketler.push({
                    paket_sira: i,
                    okunan: paketSayilari[i] || 0
                });
            }
        }

        return res.json({
            success: true,
            paketler: paketler,
            manuel_adet: manuelAdet
        });

    } catch (err) {
        console.error('Sayim paket detay hatasi:', err);
        return res.json({ success: false, message: 'Sunucu hatasi: ' + err.message });
    }
});

module.exports = router;
