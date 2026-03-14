# Barkod Stok Takip Sistemi

Güneşler Elektronik - Doğtaş Mobilya icin gelistirilmis mobil uyumlu QR/barkod okutma ve stok takip uygulamasi.

## Genel Bakis

Bu uygulama, Doğtaş Mobilya urunlerinin depo giris/cikis, nakliye, sevk, teslimat ve stok sayim islemlerini QR kod okutma ile takip eder. Mobil cihazlarda kamera uzerinden GS1 formatinda QR kodlari okur ve Supabase veritabanina kaydeder.

### Temel Ozellikler

- **QR Kod Okutma**: Kamera ile GS1 formati QR kod okuma (ZXing-js tabanli)
- **5 Farkli Fis Sistemi**: Nakliye, Fatura/Teslimat, Sevk, Diger Giris, Diger Cikis
- **On Kayit**: Fissiz barkod on-kayit sistemi
- **Paket Takibi**: Urun bazli paket sayisi ve okuma durumu takibi
- **Toplu Okutma**: Eksik paketleri tek tusla tamamlama
- **Sesli Geri Bildirim**: Basarili/hata/tekrar/kalem tamamlandi sesleri (Web Audio API)
- **Frontend QR Cache**: localStorage tabanli duplicate onleme
- **Stok Arama**: PRGsheet uzerinden stok sorgulama
- **Nakliye Arama**: Dogtas API uzerinden nakliye fisi arama
- **Kullanici Ayarlari**: Supabase tabanli kullanici bazli ayar yonetimi

## Mimari

```
Kullanici (Mobil/Tablet)
    |
    | HTTPS
    v
[Render.com - Node.js]
    |
    |--- /api/supabase/*    --> Supabase (Nakliye QR islemleri)
    |--- /api/mikro/*       --> Supabase (Fatura/Teslimat QR islemleri)
    |--- /api/sevk/*        --> Supabase (Sevk fisi islemleri)
    |--- /api/giris/*       --> Supabase (Giris fisi islemleri)
    |--- /api/cikis/*       --> Supabase (Cikis fisi islemleri)
    |--- /api/dogtas/*      --> Dogtas API (Nakliye verileri)
    |--- /api/stok/*        --> Google Sheets (Stok verileri)
    |--- /api/ayarlar/*     --> Supabase (Kullanici ayarlari)
    |--- /api/yetkilendirme --> Google Sheets (Kullanici dogrulama)
```

### Veri Akisi

1. **Dogtas API** --> PRG Desktop App (Python) --> **Mikro ERP** --> PRG barkod_module.py --> **Supabase** <-- Barkod Web App
2. **Dogtas API** --> Barkod Web App (nakliye-yukle) --> **Supabase** <-- Barkod Web App (nakliye-okut)

### Frontend Mimari (SPA)

Tek sayfa uygulamasi (SPA), build tool olmadan vanilla JavaScript ile calisir.

```
index.html
  |-- ses-yoneticisi.js    (Web Audio API sesli geri bildirim)
  |-- barkod-okuyucu.js    (Kamera + ZXing QR okuyucu)
  |-- sayfa-yoneticisi.js  (mount/unmount lifecycle)
  |-- router.js            (History API tabanli client-side routing)
  |-- views/
  |     |-- giris.js           (Login formu)
  |     |-- anasayfa.js        (Ana menu)
  |     |-- cikis-islemleri.js (Cikis fisleri menu)
  |     |-- giris-islemleri.js (Giris fisleri menu)
  |     |-- nakliye-okutma.js  (Nakliye oturum secimi)
  |     |-- nakliye-okut.js    (Nakliye QR okutma)
  |     |-- nakliye-arama.js   (Nakliye fis arama)
  |     |-- teslimat.js        (Fatura secimi)
  |     |-- teslimat-okut.js   (Fatura QR okutma)
  |     |-- fis-okut.js        (Sevk/Giris/Cikis QR - Factory pattern)
  |     |-- on-kayit.js        (On kayit barkod okutma)
  |     |-- stok.js            (Stok arama)
  |     |-- sayim.js           (Stok sayim)
  |     |-- ayarlar.js         (Kullanici ayarlari)
  |-- uygulama.js          (SPA giris noktasi - router + shell)
```

**View Pattern**: Her view `{ mount(konteyner, params), unmount() }` arayuzunu uygular. `SayfaYoneticisi` sayfa gecislerinde mevcut view'i unmount edip yenisini mount eder.

**Factory Pattern**: `fis-okut.js` tek bir `FisOkutmaOlustur(config)` fonksiyonu ile 3 farkli fis tipini (Sevk, Diger Giris, Diger Cikis) ayni koddan uretir.

## Proje Yapisi

```
Barkod/
|-- src/
|   |-- sunucu.js              # Express sunucu, middleware, route mounting
|   |-- araclar/
|   |   |-- veritabani.js      # Google Sheets baglantisi (kullanici dogrulama)
|   |-- rotalar/
|       |-- yetkilendirme.js   # POST /giris, POST /cikis
|       |-- supabase.js        # Nakliye QR islemleri (nakliye_fisleri)
|       |-- mikro.js           # Fatura QR islemleri (satis_faturasi)
|       |-- sevk.js            # Sevk fisi islemleri (sevk_fisi)
|       |-- giris.js           # Giris fisi islemleri (giris_fisi)
|       |-- cikis.js           # Cikis fisi islemleri (cikis_fisi)
|       |-- dogtas.js          # Dogtas API entegrasyonu
|       |-- stok.js            # PRGsheet stok sorgulama
|       |-- ayarlar.js         # Kullanici ayarlari CRUD
|
|-- public/
|   |-- index.html             # Tek HTML dosyasi (SPA)
|   |-- css/
|   |   |-- stil.css           # Tum stiller
|   |-- js/
|       |-- (yukarida detayli listelenmistir)
|
|-- package.json
|-- .gitignore
|-- .env                       # (git'te yok) Environment variables
|-- service_account.json       # (git'te yok) Google Service Account
```

## Supabase Tablolari

| Tablo                       | Aciklama                  | Veri Kaynagi           |
| --------------------------- | ------------------------- | ---------------------- |
| `nakliye_fisleri`           | Dogtas nakliye verileri   | Dogtas API --> Web App |
| `nakliye_fisleri_okumalari` | Nakliye QR okumalari      | Web App                |
| `satis_faturasi`            | Satis faturasi kalemleri  | Mikro ERP --> PRG App  |
| `satis_faturasi_okumalari`  | Fatura QR okumalari       | Web App                |
| `sevk_fisi`                 | Sevk fisi kalemleri       | Mikro ERP --> PRG App  |
| `sevk_fisi_okumalari`       | Sevk QR okumalari         | Web App                |
| `giris_fisi`                | Giris fisi kalemleri      | Mikro ERP --> PRG App  |
| `giris_fisi_okumalari`      | Giris QR okumalari        | Web App                |
| `cikis_fisi`                | Cikis fisi kalemleri      | Mikro ERP --> PRG App  |
| `cikis_fisi_okumalari`      | Cikis QR okumalari        | Web App                |
| `on_kayit_barkodlar`        | On kayit barkod okumalari | Web App                |
| `on_kayit_bekleyenler`      | On kayit bekleyen urunler | Web App                |
| `ayarlar`                   | Kullanici ayarlari        | Web App                |

## Kurulum

### Gereksinimler

- Node.js 18+
- Supabase hesabi
- Google Cloud Service Account (Sheets API)
- Render.com hesabi (veya baska hosting)

### Yerel Gelistirme

```bash
# Repo'yu klonla
git clone https://github.com/user/Barkod.git
cd Barkod

# Bagimliliklari yukle
npm install

# .env dosyasini olustur
cp .env.example .env
# .env dosyasini duzenle (asagidaki degiskenleri doldur)

# Gelistirme modunda baslat (auto-reload)
npm run dev
```

### Environment Variables

```env
# Supabase
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_ANON_KEY=eyJhbGci...

# Google Sheets
GOOGLE_SPREADSHEET_ID=1ABC...xyz
GOOGLE_SERVICE_ACCOUNT_EMAIL=barkod@project.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"

# Oturum
SESSION_SECRET=guclu-ve-benzersiz-bir-anahtar

# Ortam
NODE_ENV=production
PORT=3000
```

### Render.com Deploy

1. GitHub repo'sunu Render'a bagla
2. Build Command: `npm install`
3. Start Command: `npm start`
4. Environment variables'lari Render dashboard'dan ekle

## QR Kod Formati

Uygulama GS1 standardinda QR kodlari destekler:

```
]d2 01 [GTIN-14] 10 [Parti No] 37 [Miktar] 91 [Ozel Kod] 241 [Malzeme No]
```

### GS1 Application Identifier'lar

| AI  | Alan               | Aciklama                      |
| --- | ------------------ | ----------------------------- |
| 01  | GTIN               | 14 haneli urun kodu           |
| 10  | Parti No           | Uretim parti numarasi         |
| 37  | Miktar             | Paket icindeki adet           |
| 91  | Ozel Kod           | Kisiye ozel uretim kodu       |
| 241 | Malzeme No         | 18 haneli malzeme numarasi    |
| 250 | Satinalma Kalem ID | Kisiye ozel siparis referansi |

### Eslestirme Mantigi

- **Nakliye**: `malzeme_no` (18 hane, birebir eslestirme)
- **Diger Sistemler**: `stok_kod = malzeme_no.slice(-10)` (son 10 hane)
- **Kisiye Ozel**: `satinalma_kalem_id` ile oncelikli eslestirme

## API Endpointleri

### Yetkilendirme

| Method | Endpoint                   | Aciklama         |
| ------ | -------------------------- | ---------------- |
| POST   | `/api/yetkilendirme/giris` | Kullanici girisi |
| POST   | `/api/yetkilendirme/cikis` | Cikis yap        |
| GET    | `/api/oturum-kontrol`      | Oturum durumu    |

### Nakliye (supabase.js)

| Method | Endpoint                                      | Aciklama                        |
| ------ | --------------------------------------------- | ------------------------------- |
| POST   | `/api/supabase/nakliye-yukle`                 | Dogtas'tan nakliye verisi yukle |
| POST   | `/api/supabase/qr-okut`                       | QR kod okut                     |
| GET    | `/api/supabase/okuma-durumu/:id`              | Oturum ilerleme durumu          |
| GET    | `/api/supabase/malzeme-paketler/:id/:kalemId` | Paket detaylari                 |
| POST   | `/api/supabase/toplu-okut`                    | Eksik paketleri toplu tamamla   |
| GET    | `/api/supabase/okunan-qrler/:id`              | Frontend cache sync             |

### Fatura/Teslimat (mikro.js)

| Method | Endpoint                           | Aciklama                 |
| ------ | ---------------------------------- | ------------------------ |
| GET    | `/api/mikro/fatura/:no`            | Fatura kalemlerini getir |
| POST   | `/api/mikro/qr-okut`               | QR kod okut              |
| GET    | `/api/mikro/fatura-durumu/:no`     | Fatura ilerleme durumu   |
| GET    | `/api/mikro/acik-faturalar`        | Acik faturalar listesi   |
| GET    | `/api/mikro/kapatilan-faturalar`   | Kapatilan faturalar      |
| POST   | `/api/mikro/toplu-okut`            | Toplu okutma             |
| POST   | `/api/mikro/on-kayit-barkod-bilgi` | On kayit barkod sorgula  |
| POST   | `/api/mikro/on-kayit-kaydet`       | On kayit kaydet          |

### Sevk / Giris / Cikis (sevk.js, giris.js, cikis.js)

| Method | Endpoint                                   | Aciklama              |
| ------ | ------------------------------------------ | --------------------- |
| GET    | `/api/{sevk,giris,cikis}/fis/:no`          | Fis kalemlerini getir |
| POST   | `/api/{sevk,giris,cikis}/qr-okut`          | QR kod okut           |
| GET    | `/api/{sevk,giris,cikis}/fis-durumu/:no`   | Fis ilerleme durumu   |
| GET    | `/api/{sevk,giris,cikis}/acik-fisler`      | Acik fisler           |
| GET    | `/api/{sevk,giris,cikis}/kapatilan-fisler` | Kapatilan fisler      |
| POST   | `/api/{sevk,giris,cikis}/toplu-okut`       | Toplu okutma          |

### Dogtas API

| Method | Endpoint                  | Aciklama         |
| ------ | ------------------------- | ---------------- |
| POST   | `/api/dogtas/nakliye-ara` | Nakliye fisi ara |

### Stok

| Method | Endpoint              | Aciklama   |
| ------ | --------------------- | ---------- |
| GET    | `/api/stok/ara?q=...` | Stok arama |

### Ayarlar

| Method | Endpoint                       | Aciklama             |
| ------ | ------------------------------ | -------------------- |
| GET    | `/api/ayarlar/getir`           | Ayarlari getir       |
| POST   | `/api/ayarlar/kaydet`          | Ayarlari kaydet      |
| GET    | `/api/ayarlar/fabrika-depolar` | Fabrika depo listesi |
| POST   | `/api/ayarlar/fabrika-depolar` | Fabrika depo kaydet  |

## Teknolojiler

| Katman           | Teknoloji                                |
| ---------------- | ---------------------------------------- |
| **Backend**      | Node.js, Express 4                       |
| **Frontend**     | Vanilla JavaScript (SPA, build tool yok) |
| **Veritabani**   | Supabase (PostgreSQL)                    |
| **Kullanici DB** | Google Sheets                            |
| **QR Okuyucu**   | ZXing-js (browser-based)                 |
| **Ses**          | Web Audio API                            |
| **Hosting**      | Render.com                               |
| **Stil**         | Custom CSS (framework yok)               |

## Lisans

ISC

## Gelistirici

İsmail Güneş - Güneşler Elektronik

[![X (Twitter)](https://img.shields.io/badge/X-000000?style=for-the-badge&logo=x&logoColor=white)](https://x.com/Guneslsmail)
[![Instagram](https://img.shields.io/badge/Instagram-E4405F?style=for-the-badge&logo=instagram&logoColor=white)](https://www.instagram.com/dogtasbatman/)
