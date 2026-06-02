-- ============================================================
-- MIGRATION: sevk_fisi_okumalari.qr_kod UNIQUE kısıtlamasını
-- GLOBAL'den FİŞ BAZINA (fis_no, qr_kod) taşır.
--
-- Sorun:
--   Global UNIQUE(qr_kod), bir QR kodun tüm sistemde yalnızca bir kez
--   kayıtlı olmasını zorluyordu. Aynı ürünün GS1 QR kodu seri no
--   içermediği için farklı sevkiyatlarda (farklı oturum/fiş) tekrar
--   edebiliyor. Örn. önce 100->200 (DEPO->ŞUBE) eşleştirilen "DARIA GRI P1",
--   sonra 100->300 (DEPO->EXC) eşleştirilmeye çalışıldığında:
--     duplicate key value violates unique constraint
--     "sevk_fisi_okumalari_qr_kod_key"
--
-- Çözüm:
--   Duplicate koruması fiş bazında olmalı → UNIQUE(fis_no, qr_kod).
--   - Aynı fiş içinde aynı paket iki kez okunamaz (koruma korunur).
--   - Farklı fişlerde/oturumlarda aynı QR serbestçe eşleştirilebilir.
--
-- NOT: Supabase SQL Editor'de bir kez çalıştırın. Idempotent'tir.
-- ============================================================

-- 1. Eski global UNIQUE kısıtlamasını düşür (otomatik üretilen ad)
ALTER TABLE sevk_fisi_okumalari
    DROP CONSTRAINT IF EXISTS sevk_fisi_okumalari_qr_kod_key;

-- Bazı kurulumlarda ad farklı olabilir; manuel adlandırılmış olasılık:
ALTER TABLE sevk_fisi_okumalari
    DROP CONSTRAINT IF EXISTS sevk_fisi_okumalari_qr_kod_unique;

-- 2. Yeni fiş bazlı bileşik UNIQUE kısıtlamasını ekle (zaten varsa atla)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'sevk_fisi_okumalari_fis_qr_key'
    ) THEN
        ALTER TABLE sevk_fisi_okumalari
            ADD CONSTRAINT sevk_fisi_okumalari_fis_qr_key UNIQUE (fis_no, qr_kod);
    END IF;
END $$;
