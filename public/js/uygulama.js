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
    router.ekle('/stok',              { baslik: 'Stok',              modul: 'stok',            ustCubuk: true,  geriButon: true, anaYol: '/anasayfa' });
    router.ekle('/sayim',             { baslik: 'Say\u0131m',        modul: 'sayim',           ustCubuk: true,  geriButon: true, anaYol: '/anasayfa' });
    router.ekle('/ayarlar',           { baslik: 'Ayarlar',           modul: 'ayarlar',         ustCubuk: true,  geriButon: true, anaYol: '/anasayfa' });
    router.ekle('/fis/nakliye-arama', { baslik: 'Nakliye Arama',     modul: 'nakliye-arama',   ustCubuk: true,  geriButon: true, anaYol: '/giris-islemleri' });
    router.ekle('/sevk',               { baslik: 'Sevk Fi\u015fi',       modul: 'sevk',            ustCubuk: true,  geriButon: true, anaYol: '/anasayfa' });
    router.ekle('/fis/diger-giris',    { baslik: 'Di\u011fer Giri\u015f', modul: 'diger-giris',    ustCubuk: true,  geriButon: true, anaYol: '/giris-islemleri' });
    router.ekle('/fis/nakliye-okutma', { baslik: 'Nakliye Okutma',        modul: 'nakliye-okutma', ustCubuk: true,  geriButon: true, anaYol: '/giris-islemleri' });
    router.ekle('/fis/teslimat',       { baslik: 'Teslimat',              modul: 'teslimat',       ustCubuk: true,  geriButon: true, anaYol: '/cikis-islemleri' });
    router.ekle('/fis/nakliye-okut',    { baslik: 'Nakliye Okut',          modul: 'nakliye-okut',   ustCubuk: false, geriButon: true, anaYol: '/fis/nakliye-okutma' });
    router.ekle('/fis/teslimat-okut',  { baslik: 'Teslimat Okut',         modul: 'teslimat-okut',  ustCubuk: false, geriButon: true, anaYol: '/fis/teslimat' });
    router.ekle('/fis/on-kayit',       { baslik: '\u00d6n Kay\u0131t',    modul: 'on-kayit',       ustCubuk: false, geriButon: true, anaYol: '/anasayfa' });
    router.ekle('/fis/diger-cikis',    { baslik: '\u00c7\u0131k\u0131\u015f Fi\u015fi', modul: 'diger-cikis',    ustCubuk: true,  geriButon: true, anaYol: '/cikis-islemleri' });
    router.ekle('/sayim/okut',         { baslik: 'Say\u0131m Okutma',                  modul: 'sayimOkut',      ustCubuk: false, geriButon: true, anaYol: '/sayim' });


    // Shell guncelleyici: route degistiginde ust cubuk / geri buton guncelle
    var orijinalUrlIsle = router._urlIsle.bind(router);
    router._urlIsle = async function(url) {
        await orijinalUrlIsle(url);
        var eslesen = router._yolEslestir(url);
        if (eslesen) {
            // Ust cubuk: okutma sayfalari haric tum sayfalarda goster
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
                        if (window.history.length > 2) {
                            window.history.back();
                        } else {
                            router.git(eslesen.ayarlar.anaYol);
                        }
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

                // Giris sayfasindaysa hedef sayfaya yonlendir
                var yol = window.location.pathname;
                if (yol === '/giris' || yol === '/') {
                    var params = new URLSearchParams(window.location.search);
                    var returnTo = params.get('returnTo');
                    var hedef = (returnTo && returnTo.startsWith('/') && returnTo !== '/giris') ? returnTo : '/anasayfa';
                    history.replaceState(null, '', hedef);
                }
                router.baslat();
            } else {
                // Giris yapilmamis
                var yol = window.location.pathname;
                if (yol !== '/giris') {
                    var returnTo = yol + window.location.search;
                    history.replaceState(null, '', '/giris?returnTo=' + encodeURIComponent(returnTo));
                }
                router.baslat();
            }
        } catch (hata) {
            console.error('Oturum kontrol hatasi:', hata);
            history.replaceState(null, '', '/giris');
            router.baslat();
        }
    }

    // iOS AudioContext: ilk kullanici dokunusunda uyandir
    SesYoneticisi.kullaniciEtkilesimiYakala();

    oturumKontrolVeBaslat();
})();
