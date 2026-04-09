-- sevk_fisi açık/kapatılan fişler fonksiyonları
-- cikis_depo_no / giris_depo_no sütun adları düzeltildi

DROP FUNCTION IF EXISTS sevk_acik_fisler_getir(integer);
DROP FUNCTION IF EXISTS sevk_kapatilan_fisler_getir(integer);

CREATE FUNCTION sevk_acik_fisler_getir(gun_sayisi INTEGER DEFAULT 17)
RETURNS TABLE (
    evrakno_seri    TEXT,
    evrakno_sira    INTEGER,
    tarih           DATE,
    evrak_adi       TEXT,
    cikis_depo      INTEGER,
    giris_depo      INTEGER,
    toplam_paket    INTEGER,
    okunan_paket    BIGINT,
    kalan_paket     INTEGER,
    kalemler        TEXT[]
) AS $$
BEGIN
    RETURN QUERY
    WITH fis_gruplari AS (
        SELECT
            sf.evrakno_seri,
            sf.evrakno_sira,
            sf.tarih,
            MAX(sf.evrak_adi)       AS evrak_adi,
            MAX(sf.cikis_depo_no)   AS cikis_depo,
            MAX(sf.giris_depo_no)   AS giris_depo,
            SUM(CEIL(COALESCE(NULLIF(sf.miktar::numeric,0),1) *
                     COALESCE(NULLIF(sf.paket_sayisi::numeric,0),1)))::INT AS toplam_paket,
            ARRAY_AGG(DISTINCT
                CEIL(sf.miktar::numeric)::TEXT || ' - ' ||
                COALESCE(NULLIF(sf.malzeme_adi,''),'Bilinmeyen')
            ) AS kalemler
        FROM sevk_fisi sf
        WHERE sf.tarih >= CURRENT_DATE - gun_sayisi
        GROUP BY sf.evrakno_seri, sf.evrakno_sira, sf.tarih
    ),
    fis_okumalar AS (
        SELECT o.fis_no, COUNT(o.id)::BIGINT AS okunan_paket
        FROM sevk_fisi_okumalari o
        GROUP BY o.fis_no
    )
    SELECT
        fg.evrakno_seri,
        fg.evrakno_sira,
        fg.tarih,
        fg.evrak_adi,
        fg.cikis_depo,
        fg.giris_depo,
        fg.toplam_paket,
        COALESCE(fo.okunan_paket, 0),
        (fg.toplam_paket - COALESCE(fo.okunan_paket, 0))::INT,
        fg.kalemler
    FROM fis_gruplari fg
    LEFT JOIN fis_okumalar fo ON fo.fis_no = fg.evrakno_sira
    WHERE fg.toplam_paket > COALESCE(fo.okunan_paket, 0)
    ORDER BY fg.evrakno_sira DESC;
END;
$$ LANGUAGE plpgsql;


CREATE FUNCTION sevk_kapatilan_fisler_getir(gun_sayisi INTEGER DEFAULT 17)
RETURNS TABLE (
    evrakno_seri    TEXT,
    evrakno_sira    INTEGER,
    tarih           DATE,
    evrak_adi       TEXT,
    cikis_depo      INTEGER,
    giris_depo      INTEGER,
    toplam_paket    INTEGER,
    okunan_paket    BIGINT,
    kalan_paket     INTEGER,
    kalemler        TEXT[]
) AS $$
BEGIN
    RETURN QUERY
    WITH fis_gruplari AS (
        SELECT
            sf.evrakno_seri,
            sf.evrakno_sira,
            sf.tarih,
            MAX(sf.evrak_adi)       AS evrak_adi,
            MAX(sf.cikis_depo_no)   AS cikis_depo,
            MAX(sf.giris_depo_no)   AS giris_depo,
            SUM(CEIL(COALESCE(NULLIF(sf.miktar::numeric,0),1) *
                     COALESCE(NULLIF(sf.paket_sayisi::numeric,0),1)))::INT AS toplam_paket,
            ARRAY_AGG(DISTINCT
                CEIL(sf.miktar::numeric)::TEXT || ' - ' ||
                COALESCE(NULLIF(sf.malzeme_adi,''),'Bilinmeyen')
            ) AS kalemler
        FROM sevk_fisi sf
        WHERE sf.tarih >= CURRENT_DATE - gun_sayisi
        GROUP BY sf.evrakno_seri, sf.evrakno_sira, sf.tarih
    ),
    fis_okumalar AS (
        SELECT o.fis_no, COUNT(o.id)::BIGINT AS okunan_paket
        FROM sevk_fisi_okumalari o
        GROUP BY o.fis_no
    )
    SELECT
        fg.evrakno_seri,
        fg.evrakno_sira,
        fg.tarih,
        fg.evrak_adi,
        fg.cikis_depo,
        fg.giris_depo,
        fg.toplam_paket,
        COALESCE(fo.okunan_paket, 0),
        (fg.toplam_paket - COALESCE(fo.okunan_paket, 0))::INT,
        fg.kalemler
    FROM fis_gruplari fg
    LEFT JOIN fis_okumalar fo ON fo.fis_no = fg.evrakno_sira
    WHERE fg.toplam_paket <= COALESCE(fo.okunan_paket, 0)
    ORDER BY fg.evrakno_sira DESC;
END;
$$ LANGUAGE plpgsql;
