/**
 * Supabase API Rotaları
 * Nakliye yüklemelerini veritabanına kaydetme
 * QR kod okutma ve paket takibi
 */

const express = require('express');
const router = express.Router();
const { qrKodParsele, qrKodHash, qrKodValidasyon } = require('../utils/qr-parser');

// Supabase client - dinamik import için
let supabase = null;

async function getSupabaseClient() {
    if (supabase) return supabase;

    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
        console.error('Supabase bağlantı bilgileri eksik! .env dosyasını kontrol edin.');
        return null;
    }

    // Supabase client oluştur
    const { createClient } = require('@supabase/supabase-js');
    supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    return supabase;
}

/**
 * Bugünün tarihine göre yeni oturum_id oluştur
 * Format: YYYYMMDD-XXX (örn: 20260107-001)
 */
async function yeniOturumIdOlustur(client) {
    const bugun = new Date();
    const yil = bugun.getFullYear();
    const ay = String(bugun.getMonth() + 1).padStart(2, '0');
    const gun = String(bugun.getDate()).padStart(2, '0');
    const tarihOneki = `${yil}${ay}${gun}`;

    // Bugünkü en son oturum_id'yi bul
    const { data, error } = await client
        .from('nakliye_yuklemeleri')
        .select('oturum_id')
        .like('oturum_id', `${tarihOneki}-%`)
        .order('oturum_id', { ascending: false })
        .limit(1);

    let siraNo = 1;
    if (!error && data && data.length > 0) {
        // Mevcut en son numarayı al ve 1 artır
        const sonOturumId = data[0].oturum_id;
        const sonSira = parseInt(sonOturumId.split('-')[1]) || 0;
        siraNo = sonSira + 1;
    }

    return `${tarihOneki}-${String(siraNo).padStart(3, '0')}`;
}

/**
 * Birim başına paket sayısını hesapla
 * paket_sayisi = paket_sayisi_toplam / miktar
 */
function hesaplaPaketSayisi(paketSayisiToplam, miktar) {
    const toplam = parseInt(paketSayisiToplam) || 0;
    const adet = parseFloat((miktar || '0').replace(',', '.')) || 1;

    if (toplam === 0 || adet === 0) return '0';

    const birimPaket = Math.round(toplam / adet);
    return String(birimPaket);
}

/**
 * Nakliye Yükleme Kaydet
 * POST /api/supabase/nakliye-yukle
 *
 * Body: { nakliyeler: [...], kalemler: [...], kullanici: "..." }
 */
router.post('/nakliye-yukle', async (req, res) => {
    try {
        const { nakliyeler, kalemler, kullanici } = req.body;

        if (!kalemler || !Array.isArray(kalemler) || kalemler.length === 0) {
            return res.json({
                success: false,
                message: 'Kaydedilecek kalem bulunamadı'
            });
        }

        const client = await getSupabaseClient();
        if (!client) {
            return res.json({
                success: false,
                message: 'Veritabanı bağlantısı kurulamadı. Supabase ayarlarını kontrol edin.'
            });
        }

        // Gelen kalemlerdeki benzersiz nakliye_no'ları al
        const nakliyeNolari = [...new Set(kalemler.map(k => k.distributionDocumentNumber).filter(Boolean))];

        // Daha önce kaydedilmiş nakliye_no'ları kontrol et
        const { data: mevcutKayitlar, error: kontrolHatasi } = await client
            .from('nakliye_yuklemeleri')
            .select('nakliye_no')
            .in('nakliye_no', nakliyeNolari);

        if (kontrolHatasi) {
            return res.json({
                success: false,
                message: 'Veritabanı kontrol hatası: ' + kontrolHatasi.message
            });
        }

        // Daha önce kaydedilmiş nakliye_no'ları bul
        const kaydedilmisNakliyeler = new Set(mevcutKayitlar?.map(k => k.nakliye_no) || []);

        // Kaydedilmemiş kalemleri filtrele
        const yeniKalemler = kalemler.filter(kalem =>
            !kaydedilmisNakliyeler.has(kalem.distributionDocumentNumber)
        );

        // Tüm nakliyeler zaten kaydedilmişse
        if (yeniKalemler.length === 0) {
            const atlalanNakliyeler = [...kaydedilmisNakliyeler].join(', ');
            return res.json({
                success: false,
                message: `Bu nakliyeler daha önce kaydedilmiş: ${atlalanNakliyeler}`
            });
        }

        // Yeni oturum_id oluştur
        const oturumId = await yeniOturumIdOlustur(client);

        // Her kalemi veritabanına kaydet
        const kayitlar = yeniKalemler.map(kalem => {
            // Satınalma No + Kalem No birleştir (kişiye özel ürün eşleştirmesi için)
            const satinalmaNo = kalem.referenceDocumentNumber || '';
            const satinalmaKalemNo = kalem.referenceItemNumber || '';
            const satinalmaKalemId = satinalmaNo + satinalmaKalemNo;

            return {
                // Oturum ID
                oturum_id: oturumId,

                // Nakliye bilgileri
                nakliye_no: kalem.distributionDocumentNumber || '',
                plaka: kalem.shipmentVehicleLicensePlate || '',
                sofor_adi: kalem.shipmentVehicleDriverName || '',
                belge_tarihi: kalem.documanetDate || '',
                depo_yeri: kalem.storageLocation || '',
                alici: kalem.receiver || '',

                // Kalem bilgileri (Türkçe sütun adları)
                fiili_hareket_tarihi: kalem.actualGoodsMovementDate || '',
                fatura_numarasi: kalem.invoceNumber || '',
                satinalma_no: satinalmaNo,
                satinalma_kalem_no: satinalmaKalemNo,
                satinalma_kalem_id: satinalmaKalemId,
                ean: kalem.ean || '',
                malzeme_no: kalem.materialNumber || '',
                malzeme_adi: kalem.materialName || '',
                miktar: kalem.materialQuantity || '',
                hacim: kalem.materialVolume || '',
                paket_sayisi_toplam: kalem.productPackages || '',
                paket_sayisi: hesaplaPaketSayisi(kalem.productPackages, kalem.materialQuantity),

                // Kullanıcı bilgisi
                kullanici: kullanici || 'bilinmiyor'
            };
        });

        // Toplu insert
        const { data, error } = await client
            .from('nakliye_yuklemeleri')
            .insert(kayitlar)
            .select();

        if (error) {
            return res.json({
                success: false,
                message: 'Veritabanına kayıt sırasında hata oluştu: ' + error.message
            });
        }

        // Atlanan kayıtlar varsa bilgi ver
        const atlalanSayisi = kalemler.length - yeniKalemler.length;
        let mesaj = `${kayitlar.length} kalem başarıyla kaydedildi (Oturum: ${oturumId})`;
        if (atlalanSayisi > 0) {
            mesaj += `. ${atlalanSayisi} kalem daha önce kaydedildiği için atlandı.`;
        }

        return res.json({
            success: true,
            message: mesaj,
            kayitSayisi: kayitlar.length,
            oturumId: oturumId,
            atlalanSayisi: atlalanSayisi,
            data: data
        });

    } catch (error) {
        return res.json({
            success: false,
            message: 'Sunucu hatası: ' + error.message
        });
    }
});

/**
 * Oturum Bilgilerini Getir
 * GET /api/supabase/oturum/:oturumId
 */
router.get('/oturum/:oturumId', async (req, res) => {
    try {
        const { oturumId } = req.params;

        if (!oturumId) {
            return res.json({
                success: false,
                message: 'Oturum ID gerekli'
            });
        }

        const client = await getSupabaseClient();
        if (!client) {
            return res.json({
                success: false,
                message: 'Veritabanı bağlantısı kurulamadı'
            });
        }

        // Oturuma ait kayıtları getir
        const { data, error } = await client
            .from('nakliye_yuklemeleri')
            .select('*')
            .eq('oturum_id', oturumId);

        if (error) {
            return res.json({
                success: false,
                message: 'Veri çekme hatası: ' + error.message
            });
        }

        if (!data || data.length === 0) {
            return res.json({
                success: false,
                message: 'Oturum bulunamadı'
            });
        }

        // Özet bilgileri hesapla
        const ilkKayit = data[0];
        const toplamKalem = data.length;
        const toplamPaket = data.reduce((t, k) => t + (parseInt(k.paket_sayisi_toplam) || 0), 0);
        const depoYeriKod = ilkKayit.depo_yeri;
        const depoYeriAdi = depoYeriKod === '0002' ? 'Biga' : depoYeriKod === '0200' ? 'İnegöl' : depoYeriKod;

        return res.json({
            success: true,
            oturum: {
                oturum_id: oturumId,
                plaka: ilkKayit.plaka,
                sofor_adi: ilkKayit.sofor_adi,
                depo_yeri: depoYeriAdi,
                depo_yeri_kod: depoYeriKod,
                kullanici: ilkKayit.kullanici,
                toplam_kalem: toplamKalem,
                toplam_paket: toplamPaket
            },
            kalemler: data
        });

    } catch (error) {
        return res.json({
            success: false,
            message: 'Sunucu hatası: ' + error.message
        });
    }
});

/**
 * Nakliye Yüklemelerini Listele
 * GET /api/supabase/nakliye-listesi
 */
router.get('/nakliye-listesi', async (req, res) => {
    try {
        const client = await getSupabaseClient();
        if (!client) {
            return res.json({
                success: false,
                message: 'Veritabanı bağlantısı kurulamadı'
            });
        }

        const { data, error } = await client
            .from('nakliye_yuklemeleri')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(100);

        if (error) {
            return res.json({
                success: false,
                message: 'Veri çekme hatası: ' + error.message
            });
        }

        return res.json({
            success: true,
            data: data,
            toplam: data.length
        });

    } catch (error) {
        console.error('Nakliye listesi hatası:', error);
        return res.json({
            success: false,
            message: 'Sunucu hatası'
        });
    }
});

/**
 * Standart ürün eşleştirme
 * malzeme_no'ya göre uygun satırı bulur
 */
async function standartUrunEslestir(oturumId, malzemeNo, client) {
    // Aynı oturumdaki, aynı malzeme_no'lu satırları bul
    const { data: satirlar, error } = await client
        .from('nakliye_yuklemeleri')
        .select('*')
        .eq('oturum_id', oturumId)
        .eq('malzeme_no', malzemeNo)
        .order('id', { ascending: true }); // Üstten başla

    if (error || !satirlar || satirlar.length === 0) {
        return null;
    }

    // Her satır için okuma sayısını kontrol et
    for (const satir of satirlar) {
        const miktar = parseFloat((satir.miktar || '0').replace(',', '.')) || 1;
        const birimPaket = parseInt(satir.paket_sayisi) || 1;

        // Bu satıra yapılmış okuma sayısı
        const { count } = await client
            .from('paket_okumalari')
            .select('*', { count: 'exact', head: true })
            .eq('nakliye_kalem_id', satir.id);

        // Beklenen okuma = miktar × birim paket sayısı
        const beklenenOkuma = miktar * birimPaket;

        if ((count || 0) < beklenenOkuma) {
            // Bu satıra eklenebilir
            return satir;
        }
    }

    return null; // Tüm satırlar dolu
}

/**
 * Kişiye özel ürün eşleştirme
 * satinalma_kalem_id'ye göre direkt eşleştirir
 */
async function kisiyeOzelEslestir(oturumId, satinalmaKalemId, client) {
    // Direkt eşleştir - tek satır olmalı
    const { data, error } = await client
        .from('nakliye_yuklemeleri')
        .select('*')
        .eq('oturum_id', oturumId)
        .eq('satinalma_kalem_id', satinalmaKalemId)
        .single();

    if (error) {
        return null;
    }

    return data;
}

/**
 * QR Kod Okut
 * POST /api/supabase/qr-okut
 *
 * Body: { oturum_id: "20260107-001", qr_kod: "...", kullanici: "..." }
 */
router.post('/qr-okut', async (req, res) => {
    try {
        const { oturum_id, qr_kod, kullanici } = req.body;

        // Parametre kontrolü
        if (!oturum_id) {
            return res.json({
                success: false,
                message: 'Oturum ID gerekli',
                hata_tipi: 'MISSING_OTURUM'
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

        // 1. QR kodu parse et ve validate et
        const qrBilgi = qrKodValidasyon(qr_kod);
        if (!qrBilgi.basarili) {
            return res.json({
                success: false,
                message: 'QR kod okunamadı: ' + qrBilgi.hata,
                hata_tipi: 'INVALID_QR'
            });
        }

        // 2. Bu QR daha önce okunmuş mu kontrol et
        const { data: mevcutOkuma } = await client
            .from('paket_okumalari')
            .select('id')
            .eq('qr_kod', qr_kod)
            .single();

        if (mevcutOkuma) {
            return res.json({
                success: false,
                message: 'Bu paket zaten okundu!',
                hata_tipi: 'DUPLICATE_QR'
            });
        }

        // 3. Eşleşen kalemi bul
        let eslesenKalem = null;

        if (qrBilgi.kisiyeOzel) {
            // Kişiye özel ürün: satinalma_kalem_id ile eşleştir
            eslesenKalem = await kisiyeOzelEslestir(oturum_id, qrBilgi.satinalmaKalemId, client);

            if (!eslesenKalem) {
                return res.json({
                    success: false,
                    message: 'Bu kişiye özel ürün bu nakliyede bulunamadı!',
                    hata_tipi: 'NOT_FOUND_CUSTOM',
                    detay: {
                        satinalma_kalem_id: qrBilgi.satinalmaKalemId
                    }
                });
            }
        } else {
            // Standart ürün: malzeme_no ile eşleştir
            eslesenKalem = await standartUrunEslestir(oturum_id, qrBilgi.malzemeNo, client);

            if (!eslesenKalem) {
                return res.json({
                    success: false,
                    message: 'Bu ürün bu nakliyede yok veya tüm paketler okunmuş!',
                    hata_tipi: 'NOT_FOUND_STANDARD',
                    detay: {
                        malzeme_no: qrBilgi.malzemeNo
                    }
                });
            }
        }

        // 4. Paket toplam kontrolü (QR'daki 91 değeri ile DB'deki paket_sayisi karşılaştır)
        const dbBirimPaket = parseInt(eslesenKalem.paket_sayisi) || 0;
        if (dbBirimPaket > 0 && qrBilgi.paketToplam !== dbBirimPaket) {
            // Uyarı ver ama devam et (loglama için)
            console.warn(`Paket sayısı uyumsuzluğu: QR=${qrBilgi.paketToplam}, DB=${dbBirimPaket}`);
        }

        // 5. Okumayı kaydet
        const okumaKaydi = {
            oturum_id: oturum_id,
            nakliye_kalem_id: eslesenKalem.id,
            qr_kod: qr_kod,
            qr_hash: qrKodHash(qr_kod),
            ozel_uretim_kodu: qrBilgi.ozelUretimKodu,
            paket_toplam: qrBilgi.paketToplam,
            paket_sira: qrBilgi.paketSira,
            malzeme_no_qr: qrBilgi.malzemeNo,
            satinalma_kalem_id_qr: qrBilgi.satinalmaKalemId,
            okuyan_kullanici: kullanici || 'bilinmiyor'
        };

        const { data: yeniOkuma, error: okumaHatasi } = await client
            .from('paket_okumalari')
            .insert(okumaKaydi)
            .select()
            .single();

        if (okumaHatasi) {
            // Unique constraint hatası (eşzamanlı okuma durumu)
            if (okumaHatasi.code === '23505') {
                return res.json({
                    success: false,
                    message: 'Bu paket zaten okundu!',
                    hata_tipi: 'DUPLICATE_QR'
                });
            }

            return res.json({
                success: false,
                message: 'Okuma kaydedilemedi: ' + okumaHatasi.message,
                hata_tipi: 'INSERT_ERROR'
            });
        }

        // 6. Bu kalem için kalan paket sayısını hesapla
        const miktar = parseFloat((eslesenKalem.miktar || '0').replace(',', '.')) || 1;
        const birimPaket = parseInt(eslesenKalem.paket_sayisi) || 1;
        const beklenenOkuma = miktar * birimPaket;

        const { count: yapilmisOkuma } = await client
            .from('paket_okumalari')
            .select('*', { count: 'exact', head: true })
            .eq('nakliye_kalem_id', eslesenKalem.id);

        const kalanPaket = beklenenOkuma - (yapilmisOkuma || 0);

        // 7. Oturum geneli kalan paket
        const { data: oturumOzet } = await client
            .from('nakliye_yuklemeleri')
            .select('id, paket_sayisi, miktar')
            .eq('oturum_id', oturum_id);

        let toplamBeklenen = 0;
        if (oturumOzet) {
            for (const k of oturumOzet) {
                const m = parseFloat((k.miktar || '0').replace(',', '.')) || 1;
                const p = parseInt(k.paket_sayisi) || 1;
                toplamBeklenen += m * p;
            }
        }

        const { count: toplamOkunan } = await client
            .from('paket_okumalari')
            .select('*', { count: 'exact', head: true })
            .eq('oturum_id', oturum_id);

        const oturumKalanPaket = toplamBeklenen - (toplamOkunan || 0);

        return res.json({
            success: true,
            message: `Paket okundu: ${eslesenKalem.malzeme_adi} (${qrBilgi.paketSira}/${qrBilgi.paketToplam})`,
            eslesen_kalem: {
                id: eslesenKalem.id,
                malzeme_no: eslesenKalem.malzeme_no,
                malzeme_adi: eslesenKalem.malzeme_adi,
                miktar: eslesenKalem.miktar
            },
            paket_bilgi: {
                toplam: qrBilgi.paketToplam,
                sira: qrBilgi.paketSira
            },
            kalem_kalan_paket: kalanPaket,
            oturum_kalan_paket: oturumKalanPaket,
            okuma_id: yeniOkuma.id
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
 * Okuma Durumu Getir
 * GET /api/supabase/okuma-durumu/:oturumId
 */
router.get('/okuma-durumu/:oturumId', async (req, res) => {
    try {
        const { oturumId } = req.params;

        if (!oturumId) {
            return res.json({
                success: false,
                message: 'Oturum ID gerekli'
            });
        }

        const client = await getSupabaseClient();
        if (!client) {
            return res.json({
                success: false,
                message: 'Veritabanı bağlantısı kurulamadı'
            });
        }

        // Oturuma ait tüm kalemleri getir
        const { data: kalemler, error: kalemHatasi } = await client
            .from('nakliye_yuklemeleri')
            .select('*')
            .eq('oturum_id', oturumId)
            .order('id', { ascending: true });

        if (kalemHatasi) {
            return res.json({
                success: false,
                message: 'Kalem bilgileri alınamadı: ' + kalemHatasi.message
            });
        }

        if (!kalemler || kalemler.length === 0) {
            return res.json({
                success: false,
                message: 'Oturum bulunamadı'
            });
        }

        // Her kalem için okuma durumunu hesapla
        let toplamPaket = 0;
        let toplamOkunan = 0;

        const kalemDurumlari = [];

        for (const kalem of kalemler) {
            const miktar = parseFloat((kalem.miktar || '0').replace(',', '.')) || 1;
            const birimPaket = parseInt(kalem.paket_sayisi) || 1;
            const beklenenPaket = miktar * birimPaket;

            // Bu kaleme yapılmış okuma sayısı
            const { count: okunanPaket } = await client
                .from('paket_okumalari')
                .select('*', { count: 'exact', head: true })
                .eq('nakliye_kalem_id', kalem.id);

            const okunan = okunanPaket || 0;
            toplamPaket += beklenenPaket;
            toplamOkunan += okunan;

            let durum = 'bekliyor';
            if (okunan >= beklenenPaket) {
                durum = 'tamamlandi';
            } else if (okunan > 0) {
                durum = 'devam_ediyor';
            }

            kalemDurumlari.push({
                id: kalem.id,
                malzeme_no: kalem.malzeme_no,
                malzeme_adi: kalem.malzeme_adi,
                miktar: kalem.miktar,
                beklenen_paket: beklenenPaket,
                okunan_paket: okunan,
                kalan_paket: beklenenPaket - okunan,
                durum: durum
            });
        }

        const kalanPaket = toplamPaket - toplamOkunan;
        const tamamlanmaYuzdesi = toplamPaket > 0 ? Math.round((toplamOkunan / toplamPaket) * 100) : 0;

        // Oturum özet bilgileri
        const ilkKalem = kalemler[0];

        return res.json({
            success: true,
            oturum: {
                oturum_id: oturumId,
                plaka: ilkKalem.plaka,
                sofor_adi: ilkKalem.sofor_adi,
                depo_yeri: ilkKalem.depo_yeri
            },
            toplam_kalem: kalemler.length,
            toplam_paket: toplamPaket,
            okunan_paket: toplamOkunan,
            kalan_paket: kalanPaket,
            tamamlanma_yuzdesi: tamamlanmaYuzdesi,
            kalemler: kalemDurumlari
        });

    } catch (error) {
        console.error('Okuma durumu hatası:', error);
        return res.json({
            success: false,
            message: 'Sunucu hatası: ' + error.message
        });
    }
});

/**
 * Son Okumaları Getir
 * GET /api/supabase/son-okumalar/:oturumId
 */
router.get('/son-okumalar/:oturumId', async (req, res) => {
    try {
        const { oturumId } = req.params;
        const limit = parseInt(req.query.limit) || 10;

        if (!oturumId) {
            return res.json({
                success: false,
                message: 'Oturum ID gerekli'
            });
        }

        const client = await getSupabaseClient();
        if (!client) {
            return res.json({
                success: false,
                message: 'Veritabanı bağlantısı kurulamadı'
            });
        }

        // Son okumaları getir (kalem bilgileriyle birlikte)
        const { data: okumalar, error } = await client
            .from('paket_okumalari')
            .select(`
                id,
                paket_sira,
                paket_toplam,
                okuma_zamani,
                okuyan_kullanici,
                nakliye_kalem_id,
                nakliye_yuklemeleri (
                    malzeme_no,
                    malzeme_adi
                )
            `)
            .eq('oturum_id', oturumId)
            .order('okuma_zamani', { ascending: false })
            .limit(limit);

        if (error) {
            return res.json({
                success: false,
                message: 'Okumalar alınamadı: ' + error.message
            });
        }

        const sonuclar = (okumalar || []).map(o => ({
            id: o.id,
            malzeme_adi: o.nakliye_yuklemeleri?.malzeme_adi || 'Bilinmiyor',
            malzeme_no: o.nakliye_yuklemeleri?.malzeme_no || '',
            paket_sira: o.paket_sira,
            paket_toplam: o.paket_toplam,
            okuma_zamani: o.okuma_zamani,
            kullanici: o.okuyan_kullanici
        }));

        return res.json({
            success: true,
            okumalar: sonuclar
        });

    } catch (error) {
        console.error('Son okumalar hatası:', error);
        return res.json({
            success: false,
            message: 'Sunucu hatası: ' + error.message
        });
    }
});

module.exports = router;
