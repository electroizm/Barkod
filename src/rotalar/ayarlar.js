/**
 * Ayarlar API Rotaları
 * Uygulama ayarlarını Supabase'den okuma ve kaydetme
 */

const express = require('express');
const router = express.Router();

// Supabase client - dinamik import için
let supabase = null;

async function getSupabaseClient() {
    if (!supabase) {
        const { createClient } = await import('@supabase/supabase-js');
        supabase = createClient(
            process.env.SUPABASE_URL,
            process.env.SUPABASE_ANON_KEY
        );
    }
    return supabase;
}

/**
 * GET /api/ayarlar/getir
 * Kullanıcıya özel ayarları getir, yoksa varsayılanları getir
 */
router.get('/getir', async (istek, yanit) => {
    try {
        // Oturumdan kullanıcı adını al
        const kullaniciAdi = istek.session?.kullanici?.kullaniciAdi;
        const client = await getSupabaseClient();

        // 1. Varsayılan ayarları getir
        const { data: varsayilanAyarlar, error: varsayilanHata } = await client
            .from('ayarlar')
            .select('anahtar, deger, aciklama, kategori, gizli')
            .eq('kullanici_id', 'default')
            .order('kategori', { ascending: true });

        if (varsayilanHata) {
            console.error('Varsayılan ayarlar getirme hatası:', varsayilanHata);
            return yanit.status(500).json({
                success: false,
                message: 'Ayarlar getirilemedi: ' + varsayilanHata.message
            });
        }

        // Eğer kullanıcı giriş yapmamışsa sadece varsayılanları döndür
        if (!kullaniciAdi) {
            return yanit.json({
                success: true,
                ayarlar: varsayilanAyarlar || [],
                kaynak: 'varsayilan'
            });
        }

        // 2. Kullanıcıya özel ayarları getir
        const { data: kullaniciAyarlari, error: kullaniciHata } = await client
            .from('ayarlar')
            .select('anahtar, deger')
            .eq('kullanici_id', kullaniciAdi);

        if (kullaniciHata) {
            console.error('Kullanıcı ayarları getirme hatası:', kullaniciHata);
            // Hata olsa bile varsayılanlarla devam et
        }

        // 3. Ayarları birleştir (Varsayılanların üzerine kullanıcı ayarlarını yaz)
        const birlesikAyarlar = varsayilanAyarlar.map(ayar => {
            const kullaniciAyari = kullaniciAyarlari?.find(ka => ka.anahtar === ayar.anahtar);
            return {
                ...ayar,
                deger: kullaniciAyari ? kullaniciAyari.deger : ayar.deger,
                // Kaynağı belirt (frontend'de göstermek istersen)
                ozellestirilmis: !!kullaniciAyari
            };
        });

        yanit.json({
            success: true,
            ayarlar: birlesikAyarlar,
            kaynak: 'birlesik'
        });

    } catch (hata) {
        console.error('Ayarlar getirme exception:', hata);
        yanit.status(500).json({
            success: false,
            message: 'Sunucu hatası: ' + hata.message
        });
    }
});

/**
 * POST /api/ayarlar/kaydet
 * Kullanıcıya özel ayarları kaydet
 */
router.post('/kaydet', async (istek, yanit) => {
    try {
        const { ayarlar } = istek.body;

        if (!ayarlar || typeof ayarlar !== 'object') {
            return yanit.status(400).json({
                success: false,
                message: 'Geçersiz ayarlar verisi'
            });
        }

        // Oturumdan kullanıcı adını al
        const kullaniciAdi = istek.session?.kullanici?.kullaniciAdi;

        if (!kullaniciAdi) {
            return yanit.status(401).json({
                success: false,
                message: 'Ayarları kaydetmek için giriş yapmalısınız'
            });
        }

        const client = await getSupabaseClient();

        // Her ayarı kullanıcı adıyla kaydet (upsert)
        const guncellemeler = Object.entries(ayarlar).map(async ([anahtar, deger]) => {
            const { error } = await client
                .from('ayarlar')
                .upsert(
                    {
                        anahtar: anahtar,
                        deger: String(deger),
                        kullanici_id: kullaniciAdi,
                        updated_at: new Date().toISOString()
                    },
                    { onConflict: 'anahtar,kullanici_id' }
                );

            if (error) {
                console.error(`Ayar güncelleme hatası (${anahtar}):`, error);
                throw error;
            }
        });

        await Promise.all(guncellemeler);

        yanit.json({
            success: true,
            message: 'Ayarlar başarıyla kaydedildi'
        });

    } catch (hata) {
        console.error('Ayarlar kaydetme exception:', hata);
        yanit.status(500).json({
            success: false,
            message: 'Ayarlar kaydedilemedi: ' + hata.message
        });
    }
});

/**
 * GET /api/ayarlar/fabrika-depolar
 * Fabrika depo listesini getir
 */
router.get('/fabrika-depolar', async (istek, yanit) => {
    try {
        const kullaniciAdi = istek.session?.kullanici?.kullaniciAdi;
        const client = await getSupabaseClient();

        // Önce kullanıcıya özel depoları kontrol et
        if (kullaniciAdi) {
            const { data: kullaniciDepolari } = await client
                .from('ayarlar')
                .select('anahtar, deger')
                .eq('kullanici_id', kullaniciAdi)
                .like('anahtar', 'fabrika_depo_%');

            if (kullaniciDepolari && kullaniciDepolari.length > 0) {
                const depolar = kullaniciDepolari.map(d => {
                    const [kod, ...adParcalari] = d.deger.split(' - ');
                    return { kod: kod.trim(), ad: adParcalari.join(' - ').trim() };
                });
                return yanit.json({ success: true, depolar });
            }
        }

        // Varsayılan depoları getir
        const { data: varsayilanDepolar } = await client
            .from('ayarlar')
            .select('anahtar, deger')
            .eq('kullanici_id', 'default')
            .like('anahtar', 'fabrika_depo_%');

        const depolar = (varsayilanDepolar || []).map(d => {
            const [kod, ...adParcalari] = d.deger.split(' - ');
            return { kod: kod.trim(), ad: adParcalari.join(' - ').trim() };
        });

        yanit.json({ success: true, depolar });

    } catch (hata) {
        console.error('Fabrika depoları getirme hatası:', hata);
        yanit.status(500).json({
            success: false,
            message: 'Sunucu hatası: ' + hata.message
        });
    }
});

/**
 * POST /api/ayarlar/fabrika-depolar
 * Fabrika depo listesini kaydet
 */
router.post('/fabrika-depolar', async (istek, yanit) => {
    try {
        const { depolar } = istek.body;
        const kullaniciAdi = istek.session?.kullanici?.kullaniciAdi;

        if (!kullaniciAdi) {
            return yanit.status(401).json({
                success: false,
                message: 'Giriş yapmalısınız'
            });
        }

        if (!Array.isArray(depolar)) {
            return yanit.status(400).json({
                success: false,
                message: 'Geçersiz veri formatı'
            });
        }

        const client = await getSupabaseClient();

        // Önce mevcut kullanıcı depolarını sil
        await client
            .from('ayarlar')
            .delete()
            .eq('kullanici_id', kullaniciAdi)
            .like('anahtar', 'fabrika_depo_%');

        // Yeni depoları ekle
        for (let i = 0; i < depolar.length; i++) {
            const depo = depolar[i];
            await client
                .from('ayarlar')
                .upsert({
                    anahtar: `fabrika_depo_${i + 1}`,
                    deger: `${depo.kod} - ${depo.ad}`,
                    aciklama: `Fabrika Deposu ${i + 1}`,
                    kategori: 'fabrika_depo',
                    kullanici_id: kullaniciAdi,
                    updated_at: new Date().toISOString()
                }, { onConflict: 'anahtar,kullanici_id' });
        }

        yanit.json({
            success: true,
            message: `${depolar.length} fabrika deposu kaydedildi`
        });

    } catch (hata) {
        console.error('Fabrika depoları kaydetme hatası:', hata);
        yanit.status(500).json({
            success: false,
            message: 'Sunucu hatası: ' + hata.message
        });
    }
});

/**
 * GET /api/ayarlar/:anahtar
 * Tek bir ayarı getir
 */
router.get('/:anahtar', async (istek, yanit) => {
    try {
        const { anahtar } = istek.params;
        const client = await getSupabaseClient();

        const { data, error } = await client
            .from('ayarlar')
            .select('anahtar, deger, aciklama, kategori, gizli')
            .eq('anahtar', anahtar)
            .single();

        if (error) {
            if (error.code === 'PGRST116') {
                return yanit.status(404).json({
                    success: false,
                    message: 'Ayar bulunamadı'
                });
            }
            throw error;
        }

        yanit.json({
            success: true,
            ayar: data
        });

    } catch (hata) {
        console.error('Ayar getirme exception:', hata);
        yanit.status(500).json({
            success: false,
            message: 'Sunucu hatası: ' + hata.message
        });
    }
});

module.exports = router;
