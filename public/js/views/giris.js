/**
 * Giris View - Login sayfasi
 * Mevcut giris.html + giris.js iceriginin SPA versiyonu
 */
window.Views = window.Views || {};
window.Views.giris = {
    _refs: {},

    mount(konteyner) {
        var self = this;
        var HATIRLA_ANAHTARI = 'barkod_hatirla';

        konteyner.innerHTML =
            '<h1 class="baslik">G\u00fcne\u015fler Elektronik<br>Do\u011fta\u015f Mobilya<br>Barkod Program\u0131</h1>' +
            '<div id="hataMesaji" class="mesaj mesaj-hata gizle"></div>' +
            '<form id="girisFormu">' +
                '<div class="form-grup">' +
                    '<label for="kullaniciAdi">Kullan\u0131c\u0131 Ad\u0131</label>' +
                    '<input type="text" id="kullaniciAdi" name="kullaniciAdi" required autocomplete="username">' +
                '</div>' +
                '<div class="form-grup">' +
                    '<label for="sifre">\u015eifre</label>' +
                    '<div class="sifre-alani">' +
                        '<input type="password" id="sifre" name="sifre" required autocomplete="current-password">' +
                        '<button type="button" id="sifreGoster" class="sifre-goz" aria-label="\u015eifreyi g\u00f6ster">' +
                            '<svg class="goz-acik" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
                                '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>' +
                                '<circle cx="12" cy="12" r="3"></circle>' +
                            '</svg>' +
                            '<svg class="goz-kapali gizle" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
                                '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>' +
                                '<line x1="1" y1="1" x2="23" y2="23"></line>' +
                            '</svg>' +
                        '</button>' +
                    '</div>' +
                '</div>' +
                '<div class="form-grup-checkbox">' +
                    '<label class="checkbox-label">' +
                        '<input type="checkbox" id="beniHatirla">' +
                        '<span>Beni Hat\u0131rla</span>' +
                    '</label>' +
                '</div>' +
                '<button type="submit" class="buton buton-birincil">Giri\u015f Yap</button>' +
            '</form>';

        // DOM referanslari
        var girisFormu = document.getElementById('girisFormu');
        var hataMesaji = document.getElementById('hataMesaji');
        var beniHatirla = document.getElementById('beniHatirla');
        var kullaniciAdiInput = document.getElementById('kullaniciAdi');
        var sifreInput = document.getElementById('sifre');
        var sifreGosterBtn = document.getElementById('sifreGoster');

        self._refs = { girisFormu: girisFormu };

        // Hatirlanan bilgileri yukle
        try {
            var kayitli = localStorage.getItem(HATIRLA_ANAHTARI);
            if (kayitli) {
                var veri = JSON.parse(kayitli);
                kullaniciAdiInput.value = veri.kullaniciAdi || '';
                sifreInput.value = veri.sifre || '';
                beniHatirla.checked = true;
            }
        } catch (e) { }

        // Sifre goster/gizle
        var gozAcik = sifreGosterBtn.querySelector('.goz-acik');
        var gozKapali = sifreGosterBtn.querySelector('.goz-kapali');

        sifreGosterBtn.addEventListener('click', function() {
            if (sifreInput.type === 'password') {
                sifreInput.type = 'text';
                gozAcik.classList.add('gizle');
                gozKapali.classList.remove('gizle');
            } else {
                sifreInput.type = 'password';
                gozAcik.classList.remove('gizle');
                gozKapali.classList.add('gizle');
            }
        });

        // Form submit
        self._submitHandler = async function(olay) {
            olay.preventDefault();

            var kullaniciAdi = kullaniciAdiInput.value.trim();
            var sifre = sifreInput.value;

            hataMesaji.classList.add('gizle');

            try {
                var yanit = await fetch('/api/yetkilendirme/giris', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ kullaniciAdi: kullaniciAdi, sifre: sifre })
                });

                var veri = await yanit.json();

                if (veri.basarili) {
                    // Beni hatirla
                    if (beniHatirla.checked) {
                        try {
                            localStorage.setItem(HATIRLA_ANAHTARI, JSON.stringify({ kullaniciAdi: kullaniciAdi, sifre: sifre }));
                        } catch (e) { }
                    } else {
                        try { localStorage.removeItem(HATIRLA_ANAHTARI); } catch (e) { }
                    }

                    // Kullanici bilgisini guncelle (ust cubuk icin)
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

                    // SPA navigasyon - returnTo varsa oraya, yoksa anasayfaya
                    var params = new URLSearchParams(window.location.search);
                    var returnTo = params.get('returnTo');
                    var hedef = (returnTo && returnTo.startsWith('/') && returnTo !== '/giris') ? returnTo : '/anasayfa';
                    window.AppRouter.git(hedef);
                } else {
                    hataMesaji.textContent = veri.mesaj;
                    hataMesaji.classList.remove('gizle');
                }
            } catch (hata) {
                console.error('Giris hatasi:', hata);
                hataMesaji.textContent = 'Ba\u011flant\u0131 hatas\u0131 olu\u015ftu. L\u00fctfen tekrar deneyin.';
                hataMesaji.classList.remove('gizle');
            }
        };

        girisFormu.addEventListener('submit', self._submitHandler);
    },

    unmount() {
        if (this._refs.girisFormu && this._submitHandler) {
            this._refs.girisFormu.removeEventListener('submit', this._submitHandler);
        }
        this._refs = {};
        this._submitHandler = null;
    }
};
