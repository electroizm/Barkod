-- ============================================================
-- MIGRATION: sevk_on_kayit tablosuna cikis_depo (kaynak depo) eklenir
--
-- Sebep:
--   Ön kayıt rotaları şimdiye kadar yalnızca hedef depoyu (depo) tutuyordu
--   ve kaynağın her zaman 100 (DEPO) olduğu varsayılıyordu. Yeni rotalar
--   200->300 (ŞUBE->EXC) ve 300->200 (EXC->ŞUBE) eklendiğinde, hedef depo
--   mevcut rotalarla çakışıyor (200->300 ile 100->300 ikisi de hedef=300).
--   Rotaların ayrışması için kaynak depo da kaydedilmeli.
--
-- Geriye uyumluluk:
--   Mevcut tüm kayıtlar DEFAULT 100 (DEPO) alır — bu, eski rotaların
--   (100->300, 100->200) doğru kaynağıdır. Veri kaybı/davranış değişikliği
--   olmaz.
--
-- Çalıştırma: Supabase SQL Editor'de bir kez. Idempotent'tir.
-- ============================================================

ALTER TABLE sevk_on_kayit
    ADD COLUMN IF NOT EXISTS cikis_depo INTEGER DEFAULT 100;

-- Olası NULL kayıtları 100'e çek (eski satırlar için güvence)
UPDATE sevk_on_kayit SET cikis_depo = 100 WHERE cikis_depo IS NULL;
