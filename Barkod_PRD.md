# Ürün Gereksinim Belgesi (PRD) - Barkod Mobil Stok Takip Uygulaması

## 1. Proje Hakkında

Bu proje, depo ve stok yönetim süreçlerini (Giriş, Çıkış, Sevk, Sayım) dijitalleştirmek amacıyla geliştirilecek, mobil tarayıcılarda çalışan basit ve hızlı bir web uygulamasıdır. Kullanıcılar, güvenli bir şekilde giriş yaparak stok hareketlerini kaydedebilecektir.

## 2. Teknik Özellikler ve Mimari

### 2.1. Teknoloji Yığını (Stack)

- **Arayüz (Frontend):** HTML5, CSS3 (Vanilla), JavaScript (Vanilla). Harici ağır kütüphaneler (React, Vue vb.) kullanılmayacak, saf ve performanslı kod yazılacak.
- **Sunucu (Backend):** Node.js ve Express.js.
- **Veritabanı:** Google Sheets (Google Sheets API v4 ile entegre).
- **Dağıtım (Deployment):** Render.com.

### 2.2. Kodlama Standartları

- Tüm değişkenler, fonksiyon isimleri, veritabanı tabloları ve sütun isimleri kesinlikle **Türkçe** olacaktır.
- Kod yapısı modüler ve okunabilir olacaktır.

## 3. Veritabanı Tasarımı (Google Sheets)

Veriler Google Sheets üzerinde saklanacaktır. Her tablo ayrı bir sayfa (sheet) olarak oluşturulacaktır.

### 3.1. Sayfa: `kullanicilar`

Kullanıcı giriş yetkilendirmesi için kullanılacaktır. İlk satır başlık satırıdır.

| Sütun A | Sütun B | Sütun C |
|---------|---------|---------|
| kullanici_adi | sifre | rol |
| admin | 1234 | admin |
| personel1 | 5678 | personel |

- **kullanici_adi:** Giriş kullanıcı adı (benzersiz olmalı).
- **sifre:** Kullanıcı şifresi (düz metin).
- **rol:** Kullanıcı yetkisi (admin, personel).

_(Not: `urunler` ve `stok_hareketleri` sayfaları daha sonra eklenecektir.)_

## 4. Arayüz ve Tasarım Kuralları (UI/UX)

- **Genel Görünüm:** Tamamen beyaz arka plan (`#FFFFFF`).
- **Butonlar:** Basit, tek renk (Örneğin koyu mavi veya gri), köşeleri hafif yuvarlatılmış, büyük ve dokunması kolay mobil uyumlu butonlar.
- **Karmaşa Yok:** Ekstra gölgeler, gradyanlar veya karmaşık animasyonlar barındırmayan "Flat" tasarım.
- **Responsive:** Mobil cihaz ekranlarına tam uyumlu %100 genişlikte yapılar.

## 5. Sayfa Hiyerarşisi ve İşlevler

Uygulama aşağıdaki sayfa yapısına sahip olacaktır. Her butona tıklandığında ilgili yeni sayfaya yönlendirme yapılacaktır.

### 5.1. Giriş Sayfası (Login)

- **Elemanlar:**
  - Kullanıcı Adı Giriş Kutusu (`input`)
  - Şifre Giriş Kutusu (`input type="password"`)
  - "Giriş Yap" Butonu
- **İşlev:** Veritabanından kullanıcıyı doğrular. Başarılı ise Ana Sayfa'ya yönlendirir.

### 5.2. Ana Sayfa (Dashboard)

Giriş sonrası açılan menü sayfasıdır. Aşağıdaki butonları içerir:

1.  **Giriş İşlemleri** (Gider -> Giriş İşlemleri Sayfası)
2.  **Çıkış İşlemleri** (Gider -> Çıkış İşlemleri Sayfası)
3.  **Depolar Arası Sevk** (Gider -> Sevk Sayfası)
4.  **Sayım** (Gider -> Sayım Sayfası)
5.  **Stok** (Gider -> Stok Listesi Sayfası)

### 5.3. Giriş İşlemleri Sayfası

Depoya ürün girişi yapılan alt menüdür.

1.  **Satınalma Giriş Fişi** (Yeni Sayfa: Barkod okutma ve miktar girme ekranı)
2.  **İade Fişi** (Yeni Sayfa)
3.  **Diğer Girişler** (Yeni Sayfa)

### 5.4. Çıkış İşlemleri Sayfası

Depodan ürün çıkışı yapılan alt menüdür.

1.  **Teslimat Fişi** (Yeni Sayfa: Barkod okutma ve miktar düşme ekranı)
2.  **Firma Çıkış Fişi** (Yeni Sayfa)
3.  **Diğer Çıkışlar** (Yeni Sayfa)

### 5.5. Diğer Sayfalar

- **Depolar Arası Sevk:** Ürünlerin bir depodan diğerine transferi.
- **Sayım:** Stok sayımı yapıp mevcut stokla karşılaştırma ekranı.
- **Stok:** Güncel stok durumunu listeleme ekranı.

## 6. Dağıtım Planı (Deployment)

- **Platform:** Render.com
- **Yöntem:** GitHub reponuzdan otomatik bağlantı ile "Web Service" olarak deploy edilecek.
- **Ortam Değişkenleri:** Veritabanı bağlantı bilgileri Render dashboard üzerinden tanımlanacak.
