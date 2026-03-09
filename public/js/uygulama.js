/**
 * Uygulama - SPA Giris Noktasi
 * Router + SayfaYoneticisi baglama, oturum yonetimi, shell kontrolu
 */
(function() {
    var sayfaIcerik = document.getElementById('sayfa-icerik');
    var ustCubuk = document.getElementById('ustCubuk');
    var geriBtn = document.getElementById('geriBtn');
    var cikisBtn = document.getElementById('cikisBtn');

    // Sayfa yoneticisi
    var yonetici = new SayfaYoneticisi(sayfaIcerik);

    // View'lari kaydet
    if (window.Views) {
        Object.keys(window.Views).forEach(function(ad) {
            yonetici.sayfaKaydet(ad, window.Views[ad]);
        });
    }

    // Router
    var router = new Router({ sayfaYoneticisi: yonetici });
    window.AppRouter = router;

    // Route tanimlari
    router.ekle('/giris',           { baslik: 'Giri\u015f',             modul: 'giris',           ustCubuk: false, geriButon: false });
    router.ekle('/anasayfa',        { baslik: 'Ana Sayfa',              modul: 'anasayfa',        ustCubuk: true,  geriButon: false });
    router.ekle('/cikis-islemleri', { baslik: '\u00c7\u0131k\u0131\u015f \u0130\u015flemleri', modul: 'cikis-islemleri', ustCubuk: true,  geriButon: true, anaYol: '/anasayfa' });
    router.ekle('/giris-islemleri', { baslik: 'Giri\u015f \u0130\u015flemleri',                modul: 'giris-islemleri', ustCubuk: true,  geriButon: true, anaYol: '/anasayfa' });

    // Shell guncelleyici: route degistiginde ust cubuk / geri buton guncelle
    var orijinalUrlIsle = router._urlIsle.bind(router);
    router._urlIsle = async function(url) {
        await orijinalUrlIsle(url);
        var eslesen = router._yolEslestir(url);
        if (eslesen) {
            // Ust cubuk goster/gizle
            if (eslesen.ayarlar.ustCubuk) {
                ustCubuk.classList.remove('gizle');
            } else {
                ustCubuk.classList.add('gizle');
            }
            // Geri buton goster/gizle
            if (eslesen.ayarlar.geriButon) {
                geriBtn.classList.remove('gizle');
                if (eslesen.ayarlar.anaYol) {
                    geriBtn.onclick = function(e) {
                        e.preventDefault();
                        router.git(eslesen.ayarlar.anaYol);
                    };
                }
            } else {
                geriBtn.classList.add('gizle');
            }
        }
    };

    // Cikis butonu
    cikisBtn.addEventListener('click', async function(e) {
        e.preventDefault();
        try {
            await fetch('/api/yetkilendirme/cikis', { method: 'POST' });
        } catch (err) { }
        router.git('/giris');
    });

    // Oturum kontrolu ve baslat
    async function oturumKontrolVeBaslat() {
        try {
            var yanit = await fetch('/api/oturum-kontrol');
            var veri = await yanit.json();

            if (veri.girisYapildi) {
                // Kullanici bilgisini goster
                var bilgiEl = document.getElementById('kullaniciBilgi');
                if (bilgiEl) {
                    try {
                        var ayarYanit = await fetch('/api/ayarlar/getir');
                        var ayarVeri = await ayarYanit.json();
                        if (ayarVeri.success && ayarVeri.ayarlar) {
                            var adSoyad = ayarVeri.ayarlar.find(function(a) { return a.anahtar === 'kullanici_adi_soyadi'; });
                            bilgiEl.textContent = (adSoyad && adSoyad.deger) || veri.kullanici.kullaniciAdi;
                        } else {
                            bilgiEl.textContent = veri.kullanici.kullaniciAdi;
                        }
                    } catch (e) {
                        bilgiEl.textContent = veri.kullanici.kullaniciAdi;
                    }
                }

                // Giris sayfasindaysa anasayfaya yonlendir
                var yol = window.location.pathname;
                if (yol === '/giris' || yol === '/') {
                    history.replaceState(null, '', '/anasayfa');
                }
                router.baslat();
            } else {
                // Giris yapilmamis
                var yol = window.location.pathname;
                if (yol !== '/giris') {
                    history.replaceState(null, '', '/giris');
                }
                router.baslat();
            }
        } catch (hata) {
            console.error('Oturum kontrol hatasi:', hata);
            history.replaceState(null, '', '/giris');
            router.baslat();
        }
    }

    oturumKontrolVeBaslat();
})();
