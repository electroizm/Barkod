# Promt Barkod

Öncelikle sen profesyonel bir yazılımcısın. Bana vereceğim maddelere göre bir mobil web sitesinde çalışan barkod uygulaması yapmak için prd oluşturmanı istiyorum.
PDR türkçe yaz. Veri tabanını türkçe yaz. Kodları türkçe yaz. Demek istediğim bir değişken kullanılacaksa Türkçe yaz.
Deploy edilecek bir sunucu olacak. Render ile deploy edilecek. Vercel İsrail 'i desteklediği için kullanmayacağım.
Mobil site çok basit olsun beyaz arka plan ve tek renk butonlardan oluşsun.
Siteye girebilmek için basit bir arayüzle girebileceğim. Kullanıcı adı ve şifresi ile giriş yapabilecek bir giriş sayfası olsun.
Giriş yapacak kullanıcı adı ve şifresi kontrol edilecek bir veri tabanı olacak.
Giriş sayfasından sonra ana sayfaya gidecek. Ana sayfada Giriş İşlemleri, Çıkış İşlemleri, Depolar Arası Sevk, Sayım ve Stok butonları olacak. Her butona tıklandığında yeni bir sayfaya gidecek.
Giriş İşlemleri sayfasında Satınalma Giriş Fişi, İade Fişi, Diğer Girişler butonları olacak. Her butona tıklandığında yeni bir sayfaya gidecek.
Çıkış İşlemleri sayfasında Teslimat Fişi, Firma Çıkış Fişi, Diğer Çıkışlar butonları olacak. Her butona tıklandığında yeni bir sayfaya gidecek.

###

http://localhost:3000/giris-islemleri.html sayfasında girmeden önce "Satınalma Giriş Fişi" listesini oluşturmak için öncesinde bir sayfaya ihtiyacım var. bu sayfadan önce "Nakliye Numarası" girebileceğim bir sonrasından Doğtaş apisinden veri çekebileceğim "Depo yeri" bu ifadeleri seçebileceğim bir şekilde olsun eğer "Biga" ise "002" seçilmiş olur. eğer "200" ise "İnegöl" seçilmiş olur. kullanıcıya seçebilmesi için Biga ya da İnegöl göster. sonra ise başlangıç tarihi bir günümüz tarihinin bir hafta öncesini seçebileceğim bir şekilde olsun. sonra ise bitiş tarihi bir günümüz tarihini seçebileceğim bir şekilde olsun. sonra ise "Nakliye Numarası" girebileceğim bir input text alanı olsun. bunun hemen yanına arama sonuçlarımı getirebileceğim bir arama iconu eklenecek. bu yapılacak olanlar sadece http://localhost:3000/giris-islemleri.html sayfasında önceki sayfanın işlemidir. http://localhost:3000/giris-islemleri.html sayfasında "Satınalma Giriş Fişi" butonuna tıkladığım zaman bu yukarıda istediklerimi yapacak bir sayfaya gidebilir. https://bayi.doganlarmobilyagrubu.com/ShipmentGrid sayfasından veri çekeceğim. Bu verileri çekmek için yukarıda gerekli bilgileri kullanıcıdan istiyorum. doğtaş apisinden veri çekeceğim. Bu işlemleri daha önce "D:\GoogleDrive\PRG\OAuth2\BekleyenFast.py" dosyasında yaptım gerekli işlemleri oradan alabilirsin ama orada https://bayi.doganlarmobilyagrubu.com/OrderGrid sayfasından veri çekiyor ve istenen veriler ona göre ama token ve giriş bilgilerini aynıdır. bu api request işleminde anlamadığın bir sorun varsa sor.
