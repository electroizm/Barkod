# QR/Barkod Okutma Sistemi - Detaylı PRD

## 1. Genel Bakış

**Sayfa:** `/fis/barkod-okut.html`
**Amaç:** Nakliye yüklemelerindeki paketlerin QR kodlarını okutarak takip etmek
**URL Parametresi:** `?oturum=260109-01` (oturum ID)

---

## 2. Sistem Mimarisi

### 2.1 Frontend Bileşenleri
```
barkod-okut.html (UI)
    ├── BarkodOkuyucu (js/barkod-okuyucu.js) - QR/Barkod okuma komponenti
    ├── Frontend Cache (localStorage) - Hızlı duplicate kontrolü
    └── API Çağrıları (/api/supabase/*)
```

### 2.2 Backend Bileşenleri
```
src/rotalar/supabase.js
    ├── Server-side Cache (Map) - Oturum bazlı önbellek
    ├── QR Parser (src/utils/qr-parser.js) - QR kod çözümleme
    └── Supabase Database
```

### 2.3 Veritabanı Tabloları
- **nakliye_yuklemeleri:** Nakliye kalem bilgileri
- **paket_okumalari:** Okunan QR kod kayıtları

---

## 3. QR Kod Formatı ve Parse Mantığı

### 3.1 QR Kod Yapısı (GS1 Format)
```
01286814037892532104202550030446631000000000000000009103920393019410200780629510200770609600102007706097000009800000000220026727699000000003200395024
```

| Bölüm | AI Kodu | Uzunluk | Açıklama |
|-------|---------|---------|----------|
| EAN | 01 | 14 hane | GTIN ürün kodu |
| Seri No | 21 | Değişken | Üretim seri numarası |
| Özel Üretim | 10 | 16 hane | Kişiye özel üretim kodu |
| Paket Toplam | 91 | 2 hane | Toplam paket sayısı |
| Paket Sıra | 92 | 2 hane | Bu paketin sırası |
| Malzeme No | 99 | 18 hane | Veritabanı malzeme_no |

### 3.2 Ürün Tipi Belirleme
- **Standart Ürün:** `ozelUretimKodu === '0000000000000000'`
  - Eşleştirme: `malzeme_no` ile
- **Kişiye Özel Ürün:** `ozelUretimKodu !== '0000000000000000'`
  - Eşleştirme: `satinalma_kalem_id` ile

### 3.3 Parse Fonksiyonu (qr-parser.js)
```javascript
qrKodValidasyon(qrKod) → {
    basarili: true/false,
    kisiyeOzel: boolean,
    ozelUretimKodu: string (16 hane),
    paketToplam: number,
    paketSira: number,
    malzemeNo: string (18 hane),
    satinalmaKalemId: string | null,
    ean: string
}
```

---

## 4. Okuma Akışı (Flow)

### 4.1 Sayfa Yüklenme
```
1. URL'den oturum_id al
2. Frontend cache'i sunucuyla senkronize et
   └── GET /api/supabase/okunan-qrler/:oturumId
3. Durum güncelle (ilerleme, malzeme listesi)
   └── GET /api/supabase/okuma-durumu/:oturumId
4. BarkodOkuyucu bileşenini başlat
```

### 4.2 QR Okuma Akışı
```
[Kullanıcı QR okuttu]
      │
      ▼
┌─────────────────────────────┐
│ 1. QR Temizleme             │
│    - Görünmez karakterleri  │
│      kaldır (GS, CR, LF)    │
│    - Trim                   │
└─────────────────────────────┘
      │
      ▼
┌─────────────────────────────┐
│ 2. Frontend Cache Kontrolü  │
│    - localStorage'da var mı?│
│    ✗ Varsa → DUPLICATE_QR   │
└─────────────────────────────┘
      │ (yoksa)
      ▼
┌─────────────────────────────┐
│ 3. API Çağrısı              │
│    POST /api/supabase/qr-okut
│    Body: {                  │
│      oturum_id,             │
│      qr_kod,                │
│      kullanici              │
│    }                        │
└─────────────────────────────┘
      │
      ▼
[Backend İşleme - Bölüm 5]
      │
      ▼
┌─────────────────────────────┐
│ 4. Sonuç İşleme             │
│    ✓ Başarılı → Cache'e ekle│
│               → Yeşil flash │
│               → Ses (880Hz) │
│    ✗ Hatalı  → Kırmızı flash│
│               → Hata sesi   │
└─────────────────────────────┘
      │
      ▼
┌─────────────────────────────┐
│ 5. UI Güncelleme            │
│    - İlerleme çubuğu        │
│    - Malzeme listesi        │
│    - Son okumalar           │
└─────────────────────────────┘
```

---

## 5. Backend QR Okuma Mantığı

### 5.1 POST /api/supabase/qr-okut Endpoint
```javascript
async function qrOkut(oturum_id, qr_kod, kullanici) {

    // 1. QR Kod Parse & Validasyon
    const qrBilgi = qrKodValidasyon(qr_kod);
    if (!qrBilgi.basarili) → INVALID_QR

    // 2. Server Cache Yükle (30 dk TTL)
    const cache = await oturumCacheYukle(oturum_id);

    // 3. Duplicate Kontrolü (Cache'den - O(1))
    if (cachedeQrVarMi(oturum_id, qr_kod)) → DUPLICATE_QR

    // 4. Ürün Eşleştirme
    if (qrBilgi.kisiyeOzel) {
        // satinalma_kalem_id ile eşleştir
        eslesenKalem = cachedeSatinalmaKalemIdBul(oturum_id, qrBilgi.satinalmaKalemId);
        if (!eslesenKalem) → NOT_FOUND_CUSTOM
    } else {
        // malzeme_no ile eşleştir
        eslesenKalem = cachedeMalzemeNoBul(oturum_id, qrBilgi.malzemeNo);
        if (!eslesenKalem) → NOT_FOUND_STANDARD
    }

    // 5. Paket Limit Kontrolü
    // Her malzeme_no + paket_sira için "miktar" kadar okuma yapılabilir
    if (!paketOkumasiYapilabilirMi(oturum_id, malzemeNo, paketSira, miktar))
        → PAKET_LIMIT_ASILDI

    // 6. Veritabanına Kaydet (paket_okumalari tablosu)
    await client.from('paket_okumalari').insert({
        oturum_id,
        nakliye_kalem_id: eslesenKalem.id,
        qr_kod,
        qr_hash,
        ozel_uretim_kodu,
        paket_toplam,
        paket_sira,
        malzeme_no_qr,
        okuyan_kullanici
    });

    // 7. Cache Güncelle
    cacheyeOkumaEkle(oturum_id, qr_kod, malzemeNo, paketSira);

    // 8. Başarılı Yanıt
    return {
        success: true,
        message: "Paket okundu: {malzeme_adi} ({sira}/{toplam})",
        eslesen_kalem: { id, malzeme_no, malzeme_adi, miktar },
        paket_bilgi: { toplam, sira }
    };
}
```

### 5.2 Hata Tipleri
| Hata Tipi | Açıklama | Ses |
|-----------|----------|-----|
| MISSING_OTURUM | Oturum ID eksik | - |
| MISSING_QR | QR kod eksik | - |
| INVALID_QR | QR kod parse edilemedi | Hata |
| DUPLICATE_QR | Bu QR zaten okundu | Tekrar |
| NOT_FOUND_STANDARD | Standart ürün nakliyede yok | Hata |
| NOT_FOUND_CUSTOM | Kişiye özel ürün nakliyede yok | Hata |
| PAKET_LIMIT_ASILDI | Bu paket için okuma limiti doldu | Tekrar |
| DB_CONSTRAINT_ERROR | Veritabanı unique hatası | Hata |
| INSERT_ERROR | Kayıt hatası | Hata |

---

## 6. Cache Sistemi

### 6.1 Frontend Cache (localStorage)
```javascript
// Key format
'qr_cache_' + oturumId → Set([qr_kod1, qr_kod2, ...])

// Fonksiyonlar
frontendCacheYukle()      // localStorage'dan Set yükle
frontendCacheKaydet()     // Set'i localStorage'a kaydet
frontendCacheyeEkle()     // Yeni QR ekle
frontendCachedeVarMi()    // O(1) duplicate kontrolü
frontendCacheSenkronize() // Sunucudan güncelle
```

### 6.2 Server Cache (Map - Bellekte)
```javascript
// Cache yapısı
oturumCache.get('260109-01') = {
    kalemler: [...],              // nakliye_yuklemeleri verileri
    okunanQrler: Set([...]),      // Okunan QR'ların Set'i
    paketOkumaSayilari: Map,      // "malzeme_no:paket_sira" → count
    sonGuncelleme: Date,
    toplamPaket: 194,
    okunanPaket: 5
}

// TTL: 30 dakika
const CACHE_SURESI_MS = 30 * 60 * 1000;
```

### 6.3 Cache Avantajları
- **Hız:** Duplicate kontrolü O(1)
- **Performans:** Veritabanı sorgusu azaltma
- **Offline:** Frontend cache ile kısmen offline çalışma

---

## 7. UI Bileşenleri

### 7.1 BarkodOkuyucu Komponenti
```javascript
class BarkodOkuyucu {
    // Giriş Yöntemleri
    - Barkod tarayıcı (hızlı giriş algılama - 300ms timeout)
    - Manuel input (Enter tuşu)
    - Kamera ile QR okuma (BarcodeDetector API)
    - Fotoğraftan QR okuma

    // Callback
    okumaSonrasi: (barkod) => qrOkut(barkod)
}
```

### 7.2 İlerleme Göstergesi
```
[====================] 75%
     45 / 60 / 15
  okunan / kalan / toplam
```

### 7.3 Malzeme Listesi
| Durum | Renk | Koşul |
|-------|------|-------|
| Bekliyor | Beyaz (#ffffff) | okunan === 0 |
| Devam Ediyor | Sarı (#fef08a) | 0 < okunan < beklenen |
| Tamamlandı | Yeşil (#bbf7d0) | okunan >= beklenen |

**Sıralama:** Sarı → Beyaz → Yeşil (aktif olanlar üstte)

### 7.4 Paket Detayları (Accordion)
Her malzeme tıklanınca:
```
GET /api/supabase/malzeme-paketler/:oturumId/:kalemId

[P1] [P2] [P3] [P4] [P5] [P6] [P7]
 ✓    ✓    ●    ○    ○    ○    ○
```
- Yeşil: Tamamlandı (okunan >= miktar)
- Sarı: Devam ediyor (0 < okunan < miktar)
- Gri: Bekliyor (okunan === 0)

---

## 8. Sesli & Görsel Geri Bildirim

### 8.1 Ses Tipleri
| Tip | Frekans | Dalga | Süre | Kullanım |
|-----|---------|-------|------|----------|
| basarili | 880Hz (A5) | sine | 0.1s | Başarılı okuma |
| tekrar | 440Hz (A4) x2 | sawtooth | 0.1s+0.1s | Duplicate/Limit |
| hata | 220Hz (A3) | square | 0.3s | Genel hata |
| tamamlandi | C5-E5-G5-C6 | sine | Melodi | Tüm paketler okundu |

### 8.2 Titreşim (Mobil)
```javascript
basarili: navigator.vibrate(100)
hata/tekrar: navigator.vibrate([100, 50, 100, 50, 100])
tamamlandi: navigator.vibrate([100, 50, 100, 50, 200])
```

### 8.3 Görsel Flash
- **Başarılı:** Yeşil (#27ae60) border + arka plan animasyonu
- **Hatalı:** Kırmızı (#e74c3c) border + arka plan animasyonu

---

## 9. API Endpoint'leri

| Method | Endpoint | Açıklama |
|--------|----------|----------|
| POST | /api/supabase/qr-okut | QR kod okut ve kaydet |
| GET | /api/supabase/okuma-durumu/:oturumId | Genel durum ve kalem listesi |
| GET | /api/supabase/malzeme-paketler/:oturumId/:kalemId | Paket detayları |
| GET | /api/supabase/okunan-qrler/:oturumId | Frontend cache senkronizasyonu |
| GET | /api/supabase/son-okumalar/:oturumId | Son okuma geçmişi |
| GET | /api/supabase/acik-oturumlar | Tamamlanmamış oturumlar |
| GET | /api/supabase/kapatilan-oturumlar | Tamamlanmış oturumlar |

---

## 10. İş Kuralları

### 10.1 Paket Okuma Limiti
```
Her (malzeme_no + paket_sira) kombinasyonu için:
    Maksimum okuma = miktar (kalem miktarı)

Örnek:
    Kalem: malzeme_no=3200395024, miktar=2, paket_sayisi=9

    P1 için: 2 okuma yapılabilir
    P2 için: 2 okuma yapılabilir
    ...
    P9 için: 2 okuma yapılabilir

    Toplam beklenen okuma = 2 × 9 = 18
```

### 10.2 Eşleştirme Önceliği
1. QR'daki malzeme_no/satinalma_kalem_id ile nakliye kalemini bul
2. Aynı malzeme_no'lu birden fazla kalem varsa, sırayla doldur

### 10.3 Tamamlanma Kontrolü
```
kalan_paket === 0 && toplam_paket > 0
    → "Tamamlandı" kutusu göster
    → Kutlama melodisi çal
```

---

## 11. Güvenlik

- **HTTPS:** Kamera erişimi için zorunlu
- **Unique Constraint:** (oturum_id, qr_kod) - aynı QR aynı oturumda tekrar okunamaz
- **QR Validasyon:** Format kontrolü, mantıksal tutarlılık

---

## 12. Performans Optimizasyonları

1. **Frontend Cache:** Duplicate kontrolü sunucuya gitmeden yapılır
2. **Server Cache:** 30 dk TTL ile veritabanı sorgularını azaltır
3. **Hızlı Giriş Algılama:** Barkod tarayıcı 300ms içinde tamamlar
4. **O(1) Lookup:** Set/Map veri yapıları ile hızlı arama
