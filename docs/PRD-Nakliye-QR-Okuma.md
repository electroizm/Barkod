# PRD: Nakliye QR Kod Okuma ve Eşleştirme Sistemi

## 1. Özet

Nakliye yüklemelerindeki paketlerin QR kodlarını okuyarak, doğru ürünlerin doğru miktarda teslim alındığını doğrulayan bir sistem.

---

## 2. Veritabanı Yapısı

### 2.1 Mevcut Tablo: `nakliye_yuklemeleri`

```sql
-- Yeni sütun ekle
ALTER TABLE nakliye_yuklemeleri
ADD COLUMN IF NOT EXISTS satinalma_kalem_id TEXT;

-- Index ekle (hızlı eşleştirme için)
CREATE INDEX IF NOT EXISTS idx_satinalma_kalem_id ON nakliye_yuklemeleri(satinalma_kalem_id);
CREATE INDEX IF NOT EXISTS idx_malzeme_no ON nakliye_yuklemeleri(malzeme_no);
```

**Mevcut sütunlar:**
| Sütun | Açıklama |
|-------|----------|
| `id` | Primary key |
| `oturum_id` | Yükleme oturumu (20260107-001) |
| `nakliye_no` | Nakliye numarası |
| `malzeme_no` | Malzeme numarası (standart ürün eşleştirmesi) |
| `satinalma_no` | Satınalma numarası |
| `satinalma_kalem_no` | Satınalma kalem numarası |
| `satinalma_kalem_id` | **YENİ** - satinalma_no + satinalma_kalem_no birleşimi |
| `miktar` | Kaç adet ürün (örn: "2,000" = 2 adet) |
| `paket_sayisi_toplam` | **GÜNCELLEME** - Toplam paket sayısı (miktar × birim paket) |
| `paket_sayisi` | **YENİ** - Birim başına paket sayısı (paket_sayisi_toplam / miktar) |

### 2.2 Yeni Tablo: `paket_okumalari`

```sql
CREATE TABLE paket_okumalari (
    id BIGSERIAL PRIMARY KEY,

    -- Hangi oturuma/kaleme ait
    oturum_id TEXT NOT NULL,
    nakliye_kalem_id BIGINT NOT NULL REFERENCES nakliye_yuklemeleri(id),

    -- QR kod bilgileri
    qr_kod TEXT NOT NULL UNIQUE,  -- Benzersiz! Aynı QR tekrar okunamaz
    qr_hash TEXT,                  -- Opsiyonel: QR'ın hash'i (hızlı karşılaştırma)

    -- QR'dan çıkarılan bilgiler
    ozel_uretim_kodu TEXT,         -- 16 haneli kod (0000...=standart)
    paket_toplam INTEGER,          -- 91 sonrası 2 hane
    paket_sira INTEGER,            -- 92 sonrası 2 hane
    malzeme_no_qr TEXT,            -- QR'dan çıkarılan malzeme no
    satinalma_kalem_id_qr TEXT,    -- QR'dan çıkarılan (kişiye özel için)

    -- Meta bilgiler
    okuyan_kullanici TEXT,
    okuma_zamani TIMESTAMPTZ DEFAULT NOW(),

    -- Indexler
    CONSTRAINT unique_qr_per_oturum UNIQUE (oturum_id, qr_kod)
);

-- Indexler
CREATE INDEX idx_paket_oturum ON paket_okumalari(oturum_id);
CREATE INDEX idx_paket_kalem ON paket_okumalari(nakliye_kalem_id);
CREATE INDEX idx_paket_qr ON paket_okumalari(qr_kod);
```

---

## 3. QR Kod Yapısı ve Parsing

### 3.1 QR Kod Formatı

```
01286814037892532104202550030446631000000000000000009103920393019410200780629510200770609600102007706097000009800000000220026727699000000003200395024
|____________||________||________||________________||__||__|                                                           ||__________________|
     EAN       Tarih     Seri No   Özel Üretim Kodu  91  92                                                            99  Malzeme No (18 hane)
     (14)      (8)       (11)      (16 hane)         XX  XX                                                                DB malzeme_no ile birebir eşleşir
```

### 3.2 Kritik Alanlar

| Alan | Pozisyon | Uzunluk | Açıklama |
|------|----------|---------|----------|
| Özel Üretim Kodu | "10" sonrası | 16 hane | `0000000000000000` = Standart ürün |
| Paket Toplam | "91" sonrası | 2 hane | Bir üründeki paket sayısı |
| Paket Sıra | "92" sonrası | 2 hane | Kaçıncı paket |
| Malzeme No | "99" sonrası | 18 hane | DB'deki malzeme_no ile birebir eşleşir (ör: `000000003200395024`) |
| Satınalma Kalem ID | Özel üretim kodu | 16 hane | Kişiye özel ürünlerde |

### 3.3 Parsing Algoritması

```javascript
function qrKodParsele(qrKod) {
    // GS1 Format:
    // 01 + GTIN(14) + 21 + SeriNo(değişken) + 10 + ÖzelKod(16) + 91XX + 92XX + ... + 99 + MalzemeNo(18)
    //
    // DİKKAT: "10" kodu seri numarasının içinde de geçebilir!
    // Bu yüzden doğru "10"yu bulmak için: "10" + 16 hane + "91" pattern'ini ara

    // 1. "21" AI kodunu bul
    const yirmiBirPos = qrKod.indexOf('21', 14);

    // 2. "10" AI kodunu bul - "10" + 16 hane + "91" pattern'ini ara
    let onPos = -1;
    let searchPos = yirmiBirPos + 2;
    while (searchPos < qrKod.length - 18) {
        const pos = qrKod.indexOf('10', searchPos);
        if (pos === -1) break;
        const sonrasi = qrKod.substring(pos + 2, pos + 18);
        const sonrakiIki = qrKod.substring(pos + 18, pos + 20);
        if (sonrasi.length === 16 && /^\d{16}$/.test(sonrasi) && sonrakiIki === '91') {
            onPos = pos;
            break;
        }
        searchPos = pos + 1;
    }

    // 3. Özel üretim kodu
    const ozelUretimKodu = qrKod.substring(onPos + 2, onPos + 18); // 16 hane
    const kisiyeOzel = ozelUretimKodu !== '0000000000000000';

    // 4. Paket bilgilerini çıkar
    const dokuzbirPos = onPos + 18; // "91" hemen sonra
    const paketToplam = parseInt(qrKod.substring(dokuzbirPos + 2, dokuzbirPos + 4));

    const dokuzikiPos = qrKod.indexOf('92', dokuzbirPos + 4);
    const paketSira = parseInt(qrKod.substring(dokuzikiPos + 2, dokuzikiPos + 4));

    // 5. Malzeme No çıkar ("99" sonrası 18 hane - DB ile birebir eşleşir)
    const doksandokuzPos = qrKod.lastIndexOf('99');
    const malzemeNo = qrKod.substring(doksandokuzPos + 2, doksandokuzPos + 20); // 18 hane

    return {
        kisiyeOzel,
        ozelUretimKodu,      // Kişiye özel ise satinalma_kalem_id olarak kullan
        paketToplam,
        paketSira,
        malzemeNo,           // 18 hane (DB eşleştirme için: 000000003200395024)
        satinalmaKalemId: kisiyeOzel ? ozelUretimKodu : null
    };
}
```

---

## 4. Eşleştirme Mantığı

### 4.1 Akış Diyagramı

```
QR Okundu
    │
    ▼
┌─────────────────────────┐
│ 1. Daha önce okunmuş mu?│
│    (qr_kod UNIQUE)      │
└───────────┬─────────────┘
            │ Hayır
            ▼
┌─────────────────────────┐
│ 2. Özel üretim kodu     │
│    kontrol et           │
└───────────┬─────────────┘
            │
    ┌───────┴───────┐
    │               │
    ▼               ▼
┌─────────┐   ┌─────────────┐
│STANDART │   │KİŞİYE ÖZEL  │
│(000...0)│   │(≠000...0)   │
└────┬────┘   └──────┬──────┘
     │               │
     ▼               ▼
┌─────────────┐ ┌─────────────────┐
│malzeme_no   │ │satinalma_kalem_id│
│ile eşleştir │ │ile eşleştir     │
└──────┬──────┘ └────────┬────────┘
       │                 │
       └────────┬────────┘
                │
                ▼
┌─────────────────────────────────┐
│ 3. Miktar kontrolü              │
│    - Satırın miktarı dolmuş mu? │
│    - Dolmuşsa sonraki satıra    │
└────────────────┬────────────────┘
                 │
                 ▼
┌─────────────────────────────────┐
│ 4. Paket kontrolü               │
│    - 91: Toplam paket doğru mu? │
│    - 92: Bu paket okunmuş mu?   │
└────────────────┬────────────────┘
                 │
                 ▼
┌─────────────────────────────────┐
│ 5. Kaydet: paket_okumalari      │
└─────────────────────────────────┘
```

### 4.2 Standart Ürün Eşleştirme

```javascript
async function standartUrunEslestir(oturumId, malzemeNo, paketBilgi, client) {
    // Aynı oturumdaki, aynı malzeme_no'lu satırları bul
    const { data: satirlar } = await client
        .from('nakliye_yuklemeleri')
        .select('*')
        .eq('oturum_id', oturumId)
        .eq('malzeme_no', malzemeNo)
        .order('id', { ascending: true }); // Üstten başla

    // Her satır için okuma sayısını kontrol et
    for (const satir of satirlar) {
        const miktar = parseFloat(satir.miktar.replace(',', '.'));

        // Bu satıra yapılmış okuma sayısı
        const { count } = await client
            .from('paket_okumalari')
            .select('*', { count: 'exact' })
            .eq('nakliye_kalem_id', satir.id);

        // Beklenen okuma = miktar × birim paket sayısı
        const birimPaket = parseInt(satir.paket_sayisi) / miktar;
        const beklenenOkuma = miktar * birimPaket;

        if (count < beklenenOkuma) {
            // Bu satıra eklenebilir
            return satir;
        }
    }

    return null; // Eşleşme yok veya tüm satırlar dolu
}
```

### 4.3 Kişiye Özel Ürün Eşleştirme

```javascript
async function kisiyeOzelEslestir(oturumId, satinalmaKalemId, client) {
    // Direkt eşleştir - tek satır olmalı
    const { data } = await client
        .from('nakliye_yuklemeleri')
        .select('*')
        .eq('oturum_id', oturumId)
        .eq('satinalma_kalem_id', satinalmaKalemId)
        .single();

    return data;
}
```

---

## 5. Hata Senaryoları

| Hata | Mesaj | Aksiyon |
|------|-------|---------|
| QR daha önce okunmuş | "Bu paket zaten okundu!" | Okuma yapma, uyarı göster |
| Eşleşme bulunamadı | "Bu ürün bu nakliyede yok!" | Okuma yapma, uyarı göster |
| Yanlış nakliye | "Bu paket başka nakliyeye ait!" | Okuma yapma, uyarı göster |
| Miktar aşıldı | "Bu üründen fazla paket var!" | Okuma yapma, uyarı göster |
| Paket sırası hatalı | "Beklenmeyen paket numarası!" | Uyarı göster (devam?) |

---

## 6. API Endpointleri

### 6.1 QR Okuma

```
POST /api/supabase/qr-okut
Body: {
    oturum_id: "20260107-001",
    qr_kod: "012868419956005121032025...",
    kullanici: "electroizm"
}

Response (Başarılı):
{
    success: true,
    message: "Paket okundu: CALMERA 3 KAPAKLI DOLAP (2/7)",
    eslesen_kalem: { ... },
    paket_bilgi: { toplam: 7, sira: 2 },
    kalan_paket: 12
}

Response (Hata):
{
    success: false,
    message: "Bu paket zaten okundu!",
    hata_tipi: "DUPLICATE_QR"
}
```

### 6.2 Okuma Durumu

```
GET /api/supabase/okuma-durumu/:oturumId

Response:
{
    success: true,
    toplam_kalem: 25,
    toplam_paket: 140,
    okunan_paket: 87,
    kalan_paket: 53,
    tamamlanma_yuzdesi: 62,
    kalemler: [
        {
            id: 78,
            malzeme_adi: "CALMERA 3 KAPAKLI DOLAP",
            beklenen_paket: 14,
            okunan_paket: 10,
            durum: "devam_ediyor"
        },
        ...
    ]
}
```

---

## 7. UI/UX Gereksinimleri

### 7.1 Okuma Ekranı

```
┌─────────────────────────────────┐
│ ← Nakliye Okutma                │
├─────────────────────────────────┤
│ Oturum: 20260107-001            │
│ Şoför: HASAN ALTINKAYA          │
│ Plaka: 17AGJ980                 │
├─────────────────────────────────┤
│                                 │
│   [████████████░░░░░░] 62%      │
│   87 / 140 paket                │
│                                 │
├─────────────────────────────────┤
│                                 │
│   ┌─────────────────────────┐   │
│   │     📷 KAMERA ALANI     │   │
│   │                         │   │
│   │   QR kodu okutun...     │   │
│   │                         │   │
│   └─────────────────────────┘   │
│                                 │
│   veya manuel giriş:            │
│   [________________________]    │
│                                 │
├─────────────────────────────────┤
│ Son Okunan:                     │
│ ✓ CALMERA 3 KAPAKLI DOLAP (2/7) │
│ ✓ CALMERA 3 KAPAKLI DOLAP (1/7) │
│ ✗ Bu paket zaten okundu!        │
└─────────────────────────────────┘
```

### 7.2 Sesli/Titreşimli Geri Bildirim

- **Başarılı okuma:** Kısa "bip" + yeşil flash
- **Hatalı okuma:** Uzun "bip" + kırmızı flash + titreşim
- **Tamamlandı:** Melodi + konfeti animasyonu

---

## 8. Uygulama Planı

### Faz 1: Veritabanı
1. `satinalma_kalem_id` sütunu ekle ✅
2. `paket_okumalari` tablosu oluştur
3. Indexler ekle

### Faz 2: Backend API
1. QR parsing fonksiyonu
2. Eşleştirme fonksiyonları
3. `/api/supabase/qr-okut` endpoint
4. `/api/supabase/okuma-durumu` endpoint

### Faz 3: Frontend
1. Okuma ekranı UI
2. Kamera entegrasyonu (mevcut barkod-okuyucu.js)
3. Geri bildirim sistemi
4. İlerleme göstergesi

### Faz 4: Test & İyileştirme
1. Edge case'ler test
2. Performans optimizasyonu
3. Hata loglama

---

## 9. Örnek Senaryolar

### Senaryo 1: Standart Ürün

**Tablo durumu:**
```
| id | malzeme_no | miktar | paket_sayisi |
|----|------------|--------|--------------|
| 78 | 3200424646 | 2,000  | 14           |
| 79 | 3200424646 | 1,000  | 7            |
```

**QR okundu:** `...3200424646` (standart, 91=07, 92=01)

1. malzeme_no=3200424646 ile eşleş
2. id=78 kontrol: miktar=2, okuma=0 → bu satıra ekle
3. Paket 1/7 kaydedildi (id=78 için)

**7 paket daha okundu (aynı malzeme_no):**
- id=78'in miktarı 2 → 2×7=14 okuma bekleniyor
- 8. okumada hala id=78'e yazılır
- 14. okumadan sonra id=78 dolu
- 15. okuma → id=79'a yazılır

### Senaryo 2: Kişiye Özel Ürün

**QR okundu:** `...1102595525000010...` (özel üretim kodu ≠ 0)

1. satinalma_kalem_id = "1102595525000010"
2. Tabloda `satinalma_kalem_id` ile eşleş
3. Tek satır bulunur → o satıra ekle
