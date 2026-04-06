-- nakliye_acik_oturumlar_getir ve nakliye_kapatilan_oturumlar_getir
-- fonksiyonlarını güncelle:
-- HATA: toplam_paket = SUM(paket_sayisi)        → birim başına paket (233)
-- DÜZELTME: toplam_paket = SUM(paket_sayisi_toplam) → gerçek toplam paket (356)

CREATE OR REPLACE FUNCTION nakliye_acik_oturumlar_getir(gun_sayisi INT DEFAULT 17)
RETURNS TABLE(
    oturum_id TEXT,
    plaka TEXT,
    tarih TIMESTAMPTZ,
    toplam_paket NUMERIC,
    okunan_paket BIGINT
) AS $$
BEGIN
    RETURN QUERY
    WITH oturum_paketler AS (
        SELECT
            nf.oturum_id,
            MAX(nf.plaka) AS plaka,
            MAX(nf.created_at) AS tarih,
            SUM(COALESCE(nf.paket_sayisi_toplam::NUMERIC, 0)) AS toplam_paket
        FROM nakliye_fisleri nf
        WHERE nf.created_at >= NOW() - (gun_sayisi || ' days')::INTERVAL
        GROUP BY nf.oturum_id
    ),
    oturum_okumalar AS (
        SELECT
            nfo.oturum_id,
            COUNT(*) AS okunan_paket
        FROM nakliye_fisleri_okumalari nfo
        GROUP BY nfo.oturum_id
    )
    SELECT
        op.oturum_id,
        op.plaka,
        op.tarih,
        op.toplam_paket,
        COALESCE(oo.okunan_paket, 0) AS okunan_paket
    FROM oturum_paketler op
    LEFT JOIN oturum_okumalar oo ON op.oturum_id = oo.oturum_id
    WHERE op.toplam_paket > COALESCE(oo.okunan_paket, 0)
    ORDER BY op.tarih DESC;
END;
$$ LANGUAGE plpgsql;


CREATE OR REPLACE FUNCTION nakliye_kapatilan_oturumlar_getir(gun_sayisi INT DEFAULT 17)
RETURNS TABLE(
    oturum_id TEXT,
    plaka TEXT,
    tarih TIMESTAMPTZ,
    toplam_paket NUMERIC,
    okunan_paket BIGINT
) AS $$
BEGIN
    RETURN QUERY
    WITH oturum_paketler AS (
        SELECT
            nf.oturum_id,
            MAX(nf.plaka) AS plaka,
            MAX(nf.created_at) AS tarih,
            SUM(COALESCE(nf.paket_sayisi_toplam::NUMERIC, 0)) AS toplam_paket
        FROM nakliye_fisleri nf
        WHERE nf.created_at >= NOW() - (gun_sayisi || ' days')::INTERVAL
        GROUP BY nf.oturum_id
    ),
    oturum_okumalar AS (
        SELECT
            nfo.oturum_id,
            COUNT(*) AS okunan_paket
        FROM nakliye_fisleri_okumalari nfo
        GROUP BY nfo.oturum_id
    )
    SELECT
        op.oturum_id,
        op.plaka,
        op.tarih,
        op.toplam_paket,
        COALESCE(oo.okunan_paket, 0) AS okunan_paket
    FROM oturum_paketler op
    LEFT JOIN oturum_okumalar oo ON op.oturum_id = oo.oturum_id
    WHERE op.toplam_paket <= COALESCE(oo.okunan_paket, 0)
    ORDER BY op.tarih DESC;
END;
$$ LANGUAGE plpgsql;
