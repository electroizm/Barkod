-- Ayarlar tablosu (kullanıcı bazlı)
CREATE TABLE IF NOT EXISTS ayarlar (
    id SERIAL PRIMARY KEY,
    anahtar VARCHAR(100) NOT NULL,
    deger TEXT,
    aciklama VARCHAR(255),
    kategori VARCHAR(50),
    gizli BOOLEAN DEFAULT FALSE,
    kullanici_id VARCHAR(100) DEFAULT 'default',
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE (anahtar, kullanici_id)
);

-- Varsayılan değerler (default kullanıcı için)
INSERT INTO ayarlar (anahtar, deger, aciklama, kategori, gizli, kullanici_id) VALUES
('PRGsheet_ID', '14Et1NH_yBrwymluEkL0_Ic7BCWev-FrCO-SuDVzkRPA', 'Google Sheets ID', 'google', false, 'default'),
('base_url', 'https://connectapi.doganlarmobilyagrubu.com/api', 'API Base URL', 'api', false, 'default'),
('nakliye_endpoint', '/SapDealer/GetShipments', 'Nakliye Endpoint', 'api', false, 'default'),
('CustomerNo', '1600703', 'Müşteri Numarası', 'api', false, 'default'),
('userName', 'gunesler.bayi', 'API Kullanıcı Adı', 'api', false, 'default'),
('password', 'Dogtas2025&*', 'API Şifresi', 'api', true, 'default'),
('clientId', 'External', 'OAuth Client ID', 'api', false, 'default'),
('clientSecret', 'externaldMG2024@!', 'OAuth Client Secret', 'api', true, 'default'),
('applicationCode', 'Connect', 'Uygulama Kodu', 'api', false, 'default'),
('kullanici_adi_soyadi', 'İsmail Güneş', 'Kullanıcı Adı & Soyadı', 'kullanici', false, 'default'),
('depo_bilgisi', 'GÜNEŞLER BATMAN DEPO', 'Depo Adı', 'depo', false, 'default')
ON CONFLICT (anahtar, kullanici_id) DO NOTHING;

-- Mevcut tabloya kullanici_id eklemek için (ALTER)
-- ALTER TABLE ayarlar ADD COLUMN IF NOT EXISTS kullanici_id VARCHAR(100) DEFAULT 'default';
-- UPDATE ayarlar SET kullanici_id = 'default' WHERE kullanici_id IS NULL;
-- ALTER TABLE ayarlar DROP CONSTRAINT IF EXISTS ayarlar_anahtar_key;
-- ALTER TABLE ayarlar ADD CONSTRAINT ayarlar_anahtar_kullanici_unique UNIQUE (anahtar, kullanici_id);

-- Sadece depo_bilgisi eklemek için (mevcut tabloya)
-- INSERT INTO ayarlar (anahtar, deger, aciklama, kategori, kullanici_id)
-- VALUES ('depo_bilgisi', 'GÜNEŞLER BATMAN DEPO', 'Depo Adı', 'depo', 'default')
-- ON CONFLICT (anahtar, kullanici_id) DO NOTHING;

-- Varsayılan fabrika depoları
INSERT INTO ayarlar (anahtar, deger, aciklama, kategori, gizli, kullanici_id) VALUES
('fabrika_depo_1', '0002 - Biga', 'Fabrika Deposu 1', 'fabrika_depo', false, 'default'),
('fabrika_depo_2', '0200 - İnegöl', 'Fabrika Deposu 2', 'fabrika_depo', false, 'default')
ON CONFLICT (anahtar, kullanici_id) DO NOTHING;
