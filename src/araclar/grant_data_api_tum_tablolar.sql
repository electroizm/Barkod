-- ============================================================
-- DATA API GRANT MIGRATION — tüm tablolar
--
-- Sebep (Supabase duyurusu):
--   30 Ekim 2026'dan itibaren mevcut projelerde de public şemadaki
--   tablolar Data API'ye (supabase-js / PostgREST / GraphQL) varsayılan
--   olarak AÇIK olmayacak. Bir tablonun API'den erişilebilmesi için
--   ilgili role açık GRANT verilmesi gerekiyor. GRANT yoksa PostgREST
--   "42501" hatası döner.
--
--   Mevcut tablolar şu anki grant'lerini korur; fakat repo'daki CREATE
--   scriptleri DROP+CREATE yaptığından, tablolar yeniden oluşturulduğunda
--   (veya yeni ortamda) grant'siz kalır. Bu migration tüm tabloları
--   garanti altına alır.
--
-- Davranış:
--   Uygulama anon key ile SUNUCU TARAFINDA çalışıyor ve tablolarda RLS
--   KAPALI. Mevcut davranışı bozmamak için burada RLS AÇILMIYOR; yalnızca
--   eksik olabilecek GRANT'ler veriliyor. (RLS + policy ile sıkılaştırma
--   ayrı bir güvenlik çalışmasıdır.)
--
-- Çalıştırma: Supabase SQL Editor'de bir kez. Idempotent'tir
--   (GRANT tekrar verilebilir; olmayan tablo güvenle atlanır).
-- ============================================================

DO $$
DECLARE
    t TEXT;
    tablolar TEXT[] := ARRAY[
        'ayarlar',
        'cikis_fisi',
        'cikis_fisi_okumalari',
        'giris_fisi',
        'giris_fisi_okumalari',
        'nakliye_fisleri',
        'nakliye_fisleri_okumalari',
        'on_kayit_okumalar',
        'satis_faturasi',
        'satis_faturasi_adres',
        'satis_faturasi_okumalari',
        'sayim_okumalari',
        'sayim_oturumlari',
        'sevk_fisi',
        'sevk_fisi_okumalari',
        'sevk_on_kayit'
    ];
BEGIN
    FOREACH t IN ARRAY tablolar LOOP
        -- Tablo gerçekten varsa grant ver (yoksa sessizce atla)
        IF to_regclass('public.' || t) IS NOT NULL THEN
            EXECUTE format(
                'GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO anon, authenticated, service_role',
                t
            );
            RAISE NOTICE 'GRANT verildi: public.%', t;
        ELSE
            RAISE NOTICE 'Tablo bulunamadı, atlandı: public.%', t;
        END IF;
    END LOOP;
END $$;

-- BIGSERIAL / IDENTITY kolonların INSERT'te nextval() çağırabilmesi için
-- sequence'lere de erişim gerekir.
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
