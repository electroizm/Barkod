-- ============================================================
-- sevk_fisi + sevk_fisi_okumalari tabloları
-- Depolar arası sevk fişleri ve okuma kayıtları
-- satis_faturasi / satis_faturasi_okumalari ile aynı pattern
-- ============================================================

-- Önce varsa düşür (baştan oluşturmak için)
DROP TABLE IF EXISTS sevk_fisi_okumalari;
DROP TABLE IF EXISTS sevk_fisi;

-- ────────────────────────────────────────────────────────────
-- sevk_fisi
-- PRG'den aktarılan sevk fişi kalemleri
-- ────────────────────────────────────────────────────────────
CREATE TABLE sevk_fisi (
    id               BIGSERIAL PRIMARY KEY,

    -- Fiş kimlik bilgileri
    evrakno_seri     TEXT,
    evrakno_sira     INTEGER NOT NULL,
    tarih            DATE,
    evrak_adi        TEXT,

    -- Cari bilgisi
    cari_kodu        TEXT,
    cari_adi         TEXT,

    -- Depo bilgisi
    cikis_depo_no    INTEGER,   -- 100 = DEPO
    giris_depo_no    INTEGER,   -- 200 = ŞUBE, 300 = EXC

    -- Malzeme bilgisi
    stok_kod         TEXT NOT NULL,
    malzeme_adi      TEXT,
    product_desc     TEXT,

    -- Miktar / Paket
    miktar           NUMERIC,
    birim            TEXT,
    paket_sayisi     INTEGER DEFAULT 1,   -- paket başına adet
    paket_sayisi_toplam INTEGER,           -- toplam paket (miktar × paket_sayisi)

    -- Meta
    kullanici        TEXT,
    created_at       TIMESTAMPTZ DEFAULT NOW(),
    updated_at       TIMESTAMPTZ DEFAULT NOW()
);

-- Hızlı sorgular için index
CREATE INDEX idx_sevk_fisi_evrakno ON sevk_fisi(evrakno_sira);
CREATE INDEX idx_sevk_fisi_stok_kod ON sevk_fisi(stok_kod);
CREATE INDEX idx_sevk_fisi_depolar ON sevk_fisi(cikis_depo_no, giris_depo_no);

-- RLS kapat
ALTER TABLE sevk_fisi DISABLE ROW LEVEL SECURITY;

-- Data API erişimi (30 Ekim 2026 sonrası grant zorunlu)
GRANT SELECT, INSERT, UPDATE, DELETE ON sevk_fisi TO anon, authenticated, service_role;
GRANT USAGE, SELECT ON SEQUENCE sevk_fisi_id_seq TO anon, authenticated, service_role;


-- ────────────────────────────────────────────────────────────
-- sevk_fisi_okumalari
-- Sevk fişi kalemlerinin QR/barkod okuma kayıtları
-- ────────────────────────────────────────────────────────────
CREATE TABLE sevk_fisi_okumalari (
    id           BIGSERIAL PRIMARY KEY,

    fis_no       INTEGER NOT NULL,        -- sevk_fisi.evrakno_sira
    kalem_id     BIGINT REFERENCES sevk_fisi(id) ON DELETE CASCADE,

    qr_kod       TEXT NOT NULL,           -- duplicate koruması fiş bazında (aşağıdaki UNIQUE)
    stok_kod     TEXT,

    paket_sira   INTEGER DEFAULT 1,
    paket_toplam INTEGER DEFAULT 1,

    depo         INTEGER,                 -- okutma yapılan depo

    kullanici    TEXT DEFAULT 'bilinmiyor',
    created_at   TIMESTAMPTZ DEFAULT NOW(),

    -- Duplicate koruması FİŞ BAZINDA: aynı fiş içinde bir QR iki kez okunamaz,
    -- fakat farklı fişlerde (farklı oturum/sevkiyat) aynı QR tekrar edebilir.
    -- (GS1 QR seri no içermediği için aynı ürün farklı sevkiyatlarda aynı qr_kod'a sahip olabilir.)
    CONSTRAINT sevk_fisi_okumalari_fis_qr_key UNIQUE (fis_no, qr_kod)
);

-- Index
CREATE INDEX idx_sevk_fisi_okumalari_fis_no  ON sevk_fisi_okumalari(fis_no);
CREATE INDEX idx_sevk_fisi_okumalari_kalem_id ON sevk_fisi_okumalari(kalem_id);

-- RLS kapat
ALTER TABLE sevk_fisi_okumalari DISABLE ROW LEVEL SECURITY;

-- Data API erişimi (30 Ekim 2026 sonrası grant zorunlu)
GRANT SELECT, INSERT, UPDATE, DELETE ON sevk_fisi_okumalari TO anon, authenticated, service_role;
GRANT USAGE, SELECT ON SEQUENCE sevk_fisi_okumalari_id_seq TO anon, authenticated, service_role;
