-- sevk_on_kayit tablosu
-- on_kayit_okumalar'dan bağımsız, sadece Sevk Ön Kayıt sayfası için

CREATE TABLE IF NOT EXISTS sevk_on_kayit (
    id          BIGSERIAL PRIMARY KEY,
    stok_kod    TEXT NOT NULL,
    malzeme_adi TEXT,
    product_desc TEXT,
    paket_sayisi INTEGER DEFAULT 1,
    paket_sira   INTEGER DEFAULT 1,
    qr_kod       TEXT,
    kullanici    TEXT DEFAULT 'bilinmiyor',
    depo         INTEGER,          -- 300=EXC, 200=SUBE
    durum        TEXT DEFAULT 'bekliyor',
    created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- RLS kapat (on_kayit_okumalar ile aynı yaklaşım)
ALTER TABLE sevk_on_kayit DISABLE ROW LEVEL SECURITY;

-- Data API erişimi (30 Ekim 2026 sonrası grant zorunlu)
GRANT SELECT, INSERT, UPDATE, DELETE ON sevk_on_kayit TO anon, authenticated, service_role;
GRANT USAGE, SELECT ON SEQUENCE sevk_on_kayit_id_seq TO anon, authenticated, service_role;
