# 📦 Barkod Projesi Detaylı Analizi ve Sistem Mimarisi

Son 1 aylık süreçte projeye oldukça gelişmiş özellikler entegre edilmiş ve proje modern, hataya kapalı, performanslı bir depo & lojistik yönetim platformuna dönüşmüştür.

Aşağıda projenin "Hangi sayfada ne yapılıyor?", "Arka planda sistemler birbiriyle nasıl konuşuyor?" ve "Son dönemde eklenen özellikler neler?" dahil olmak üzere en temelden en detaya inen teknik incelemesini bulabilirsin.

---

## 🏗️ 1. Genel Mimari ve Kullanılan Teknolojiler

Proje, hem ön yüz hem de arka yüz açısından hızlı veri akışı sağlamak üzere dizayn edilmiştir:

- **Frontend (Önyüz):** HTML, CSS ve Vanilla JS. Tüm sayfalar `public` dizini altında barınır ve mobil veya el terminallerinde problemsiz çalışması için ölçeklenmiştir. Sayfalar arası ortak fonksiyonlar `public/js/ortak.js` üzerinden yönetilir (oturum kontrolü ve çıkış işlemleri).
- **Backend (Arka Yüz - Node.js):** Ana motor `src/sunucu.js` ile çalışır. ExpressJS yardımıyla `express-session` üzerinden yetkilendirme sağlar. Büyük nakliye fişleri ve çeki listelerinde hata vermemesi için body size limiti `10mb`'a yükseltilmiş.
- **Merkezi Veritabanı:** Supabase kullanılarak `ayarlar`, `satis_faturasi`, `fatura_okumalari`, `nakliye_yuklemeleri` ve oturum durumları güvenle tutulurlar.
- **Google Sheets (PRGsheet) Entegrasyonu 🌟 (YENİ!):** Kritik statik veriler, SQL Server IP/Pass, Doğtaş API kimlikleri (Client Secret vb.) doğrudan DB yerine Google Drive'daki `PRGsheet` isimli tablodan otomatik okunur ve projeye yüklenir. Uygulama her çalıştığında credential'ları buradan alır.
- **Doğtaş ve Mikro ERP Entegrasyonları 🌟 (YENİ!):** Satınalma (Giriş) işlemleri için `Doğtaş API` sorgulanır, Çıkış (Satış/Teslimat) işlemleri ise `Mikro SQL Server` doğrudan dinlenerek ERP ile haberleşim sağlanır.

---

## 📄 2. Sayfa Sayfa Detaylı İşlev Analizi

### 🏠 Ana Modüller

#### 1. Ana Sayfa (`anasayfa.html`)

Projeye giriş yapan kullanıcının karşılaştığı ana yönlendirme panelidir. Giriş yapan kişinin adı-soyadı en üstte belirir. Sayfada **5 Ana Modül** tuşu bulunur:

- Giriş İşlemleri
- Çıkış İşlemleri
- Depolar Arası Sevk
- Sayım
- Stok
  Bu sayfadan sağ üstten "Ayarlar" sekmesine ya da "Çıkış" sekmesine geçiş yapılabilir.

#### 2. Ayarlar Sayfası (`ayarlar.html`)

Bu sayfa, projenin en kilit konfigürasyonlarının yapıldığı GUI sayfasıdır. Değişiklikler anlık olarak Supabase `ayarlar` tablosuna yazılır. İçerdiği alanlar:

- **Depo Bilgileri:** Varış depo adı (örn. GÜNEŞLER BATMAN DEPO)
- **Fabrika Depo Kodları:** `0002 (Biga)`, `0200 (İnegöl)` gibi kodların sisteme tanıtılması, silinip güncellenmesi.
- **Google Sheets & API Ayarları:** PRGsheet_ID, Doğtaş API'sinin root url'si, CustomerNo (Müşteri No), UserName, Password ve OAuth client ID / Secret'lar buradan kaydedilir. _(Şifre alanlarına göz 👁️ ikonu ile göster/gizle fonksiyonu eklenmiştir)_

---

### 📥 Giriş İşlemleri Modülü (`giris-islemleri.html`)

Buradan firmanın deposuna giren ürünlerin işlemleri yönetilir.

#### 1. Nakliye Arama (`/fis/nakliye-arama.html`) 🌟 (Büyük İlerlemeler Yapıldı)

- **Ne işe yarar?** Doğtaş'tan veya üretimden kesilen fişleri ve yüklenen tırları tarih ve depo filtresine göre sorgular.
- **Çalışma Mantığı:** Backend üzerindeki `/api/dogtas/nakliye-ara` adresine istek yollar ve Supabase üzerinden Doğtaş API'sine ulaşıp açık çeki listelerini getirir.
- **Eklenen Akıllı Kontroller:**
  - Gelen veri içinde EAN barkodu okunamayan öğeleri "Yarı Mamül" kabul ederek otomatik filtreler listeye almaz.
  - Varış Depo Yeri (Receiver) filtrelemesi uygulanmıştır.
  - Sonucu döndürdükten sonra kullanıcı satırları/teslimatları seçer. Ancak **aynı anda sadece tek plakaya ait araçları seçmenize onay verir**. Başka bir kamyona ait listeyi eklerseniz uyarıyla işlemi engeller. Seçim yapıldığında ilgili araç listesiyle Supabase'e kaydedilerek "Oturum" (Session) başlatılır.

#### 2. Nakliye Okutma (`/fis/nakliye-okutma.html`)

- **Ne işe yarar?** Oluşturulan nakliyenin fizyolojik olarak mallarının tırdan inerken barkodla okutulmaya başlandığı ana istasyondur. URL yapısı üzerinden `?oturum=oturumId` takibi yapılır.
- Sayfadaki **"Açık Oturumları Göster"** ve **"Kapatılan Oturumları Göster"** menüleri sayesinde eski cihazlardan veya cihaz kapatılsa da kalınan yerden devam etmeye olanak sağlar. Kalan paket sayısını ve okunan paket sayısını yüzdelik (%)/sayısal gösterir. Okumayı başlatınca Barkod Okut modülüne atar.

#### 3. Barkod Okutma (`/fis/barkod-okut.html`)

- Karekodlar özel okutularak Doğtaş formatındaki (Örn: `(91)stok_kod(99)paket_sira...`) veri parçalanır _(qr-parser.js kullanarak)._ Okutulan barkod eşleştirilince beklenen paketten düşülür, okunan paket "1" artırılır.

_(Ayrıca Giriş işlemlerinde şu an şablonu bulunan İade Fişi ve Diğer Girişler menüsü de bulunmaktadır)_

---

### 📤 Çıkış İşlemleri Modülü (`cikis-islemleri.html`)

Malların müşteriye veya sevk edilen bir şubeye gönderilmesi durumlarında kullanılır.

#### 1. Satış / Teslimat (Fatura) Çıkış İşlemleri (Mikro Entegrasyonu) 🌟 (YENİ!)

- Çıkış işlemlerinin bel kemiği Doğtaş API yerine **Mikro SQL Server** üzerinden yapılandırıldı. Projedeki `src/rotalar/mikro.js` en yoğun güncellemeyi alan alanlardan biri oldu.
- **Akış ve Yapılanlar:**
  1. Barkod sistemi doğrudan Mikro MSSQL veritabanına bağlanıp, kesilmiş **Satıș Faturalarını** (`sth_evraktip=4`) sorgular. Supabase içerisine kopyalanan son fatura sınırından (sadece yeni eklenenler) sonrasını çekerek "Supabase satis_faturasi" şemasına aktarır. (Upsert)
  2. Gelen faturalardaki ürün (stok_kod 10 haneli kırpılıp) bilgisi tekrar Doğtaş tarafına sorulur ve "Bu ürün kaç ayrı paketten oluşuyor?" sorusu yöneltilir. (Ürün 1 adet görünebilir ama 4 koliden/paketten oluşuyordur.)
  3. Daha sonra kullanıcı **okuma** moduna girer.
  4. **_YENİ EKLENEN SİSTEM (PERFORMANS İÇİN CACHE):_** Karekodlar okundukça sürekli Supabase + Mikro arası yavaşlık olmasın diye _30 dakikalık RAM Cache Sistemi PRD ile uyumlu oluşturuldu._ Bir faturanın qr okumaları RAM üzerinde sayılır, mükerrer kontrolü `faturaCacheYukle` mekanizması ve `qrKodHash` ile anında tespit edilir.

_(Yine Çıkış işlemlerinde tasarımları/altyapıları hazırlanmış "Firma Çıkış Fişi" ve "Diğer Çıkışlar" da bulunur)_

---

### 🔃 Diğer Menu Başlıkları

- **Sayım (`sayim.html`):** Firma/Depo içerisinde anlık malların stoklarını ve koli barkodlarını okutarak eksik/fazla tespitine yarar.
- **Stok (`stok.html`):** Anlık olarak depo içerisindeki veya sistemde kaydı olan bir ürünün stoklarını ve kaç paketten oluştuğunu görmeye yaran modüldür.
- **Depolar Arası Sevk (`sevk.html`):** Şirketinizdeki A deposundan (Örn Batman) farklı bir şubeye gönderilen malların çıkış okutma işlemlerini yapar.

---

## 🔥 Son 1 Ayda Eklenen Önemli Özelliklerin Özeti (Hatırlatıcı)

1. **Google Sheets Config Sistemi:** Mikro SQL IP Adresleri, Supabase URL'leri ve Doğtaş API kimlikleri kod içerisinde değil **PRGsheet** isimli bir excel sayfasından dinamik okunur hale getirildi.
2. **Doğtaş Yarı Mamül Filtresi:** Çeki listeleri ve Nakliyelerde, "ean" alanı boş gelen öğeler "yarı mamül" olarak kodlanıp arama sonuçları listesinden otomatik gizlenir duruma getirildi.
3. **Plaka Bazlı Çeki Seçimi (Checkbox Limitörü):** Frontend tarafında (`/fis/nakliye-arama.html`) checkbox ile farklı kamyonlar, farklı plakalar ardı ardına seçilirse uyarı veren `(alert)` akıllı seçim JS script'i kodlandı.
4. **Mikro ERP Fatura Yükleme ve Çözümlemesi:** Mikro ERP'deki "Satış Faturaları" uygulamaya bağlanıp paket paket çekiliyor. Hatta 18 Hanelik malzeme NO yapılarının, son 10 hanesinin Stok_Kod olabildiği kurgu parse edilebilir duruma kodlandı.
5. **QR Cache ve Mükerrer Yönetimi:** `mikro.js` rotasında her QR okutulduğunda `stokKod:paketSira` map'lenerek, bir paketi ikinci defa okuttuğunda sunucu database sorgusu atmadan anında RAM üstünden engelliyor (30 Dk Time-To-Live mantığı ile).

_(Not: Sayfa yapıları ve modüllerde unutmuş olabileceğiniz detaylar bunlardan ibarettir. Frontend Vanilla + Flex yapısıyla responsive, backend Node+Express stabil olarak çalışmaktadır.)_
