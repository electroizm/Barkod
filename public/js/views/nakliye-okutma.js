/**
 * Nakliye Okutma View - Oturum se\u00e7im hub sayfas\u0131
 * Kamera kullanmaz, se\u00e7ilen oturumu /fis/nakliye-okut sayfas\u0131na y\u00f6nlendirir.
 */
window.Views = window.Views || {};
window.Views['nakliye-okutma'] = (function() {
    var el = {};
    var _konteyner = null;
    var _delegeHandler = null;
    var _inputHandler = null;
    var _keypressHandler = null;
    var mevcutOturum = null;

    function htmlOlustur() {
        return '' +
            '<h1 class="baslik">Nakliye Okutma</h1>' +

            // Oturum secim alani
            '<div id="oturumSecimAlani" class="oturum-secim" style="display:none;">' +
                '<label for="oturumIdInput">Oturum Numaras\u0131</label>' +
                '<input type="text" id="oturumIdInput" placeholder="\u00d6rn: 260109-01">' +
                '<button type="button" class="ara-btn" data-action="oturumAra">Oturum Ara</button>' +
                '<button type="button" class="acik-oturum-btn" data-action="acikOturumlar">A\u00e7\u0131k Oturumlar\u0131 G\u00f6ster</button>' +
                '<button type="button" class="kapatilan-oturum-btn" data-action="kapatilanOturumlar">Kapat\u0131lan Oturumlar\u0131 G\u00f6ster</button>' +
            '</div>' +

            // Acik Oturumlar Modal
            '<div id="acikOturumOverlay" class="acik-oturum-overlay">' +
                '<div class="acik-oturum-modal">' +
                    '<div class="modal-baslik">' +
                        '<h3>A\u00e7\u0131k Oturumlar</h3>' +
                        '<button type="button" class="modal-kapat" data-action="acikModalKapat">&times;</button>' +
                    '</div>' +
                    '<div id="oturumListesi" class="oturum-liste"></div>' +
                '</div>' +
            '</div>' +

            // Kapatilan Oturumlar Modal
            '<div id="kapatilanOturumOverlay" class="acik-oturum-overlay">' +
                '<div class="acik-oturum-modal">' +
                    '<div class="modal-baslik">' +
                        '<h3>Kapat\u0131lan Oturumlar</h3>' +
                        '<button type="button" class="modal-kapat" data-action="kapatilanModalKapat">&times;</button>' +
                    '</div>' +
                    '<div id="kapatilanOturumListesi" class="oturum-liste"></div>' +
                '</div>' +
            '</div>' +

            // Oturum bilgileri
            '<div id="oturumBilgiAlani" style="display:none;">' +
                '<div class="oturum-bilgi">' +
                    '<div class="oturum-baslik">' +
                        '<span>Oturum:</span>' +
                        '<span class="oturum-id" id="oturumIdGoster"></span>' +
                    '</div>' +
                    '<div class="bilgi-grid">' +
                        '<div class="bilgi-satir">' +
                            '<span class="bilgi-etiket">Depo Yeri</span>' +
                            '<span class="bilgi-deger" id="depoYeriGoster">-</span>' +
                        '</div>' +
                        '<div class="bilgi-satir">' +
                            '<span class="bilgi-etiket">\u015eof\u00f6r</span>' +
                            '<span class="bilgi-deger" id="soforGoster">-</span>' +
                        '</div>' +
                        '<div class="bilgi-satir">' +
                            '<span class="bilgi-etiket">Plaka</span>' +
                            '<span class="bilgi-deger" id="plakaGoster">-</span>' +
                        '</div>' +
                        '<div class="bilgi-satir">' +
                            '<span class="bilgi-etiket">Kullan\u0131c\u0131</span>' +
                            '<span class="bilgi-deger" id="kullaniciGoster">-</span>' +
                        '</div>' +
                    '</div>' +
                    '<div class="istatistik-kutu">' +
                        '<div class="istatistik">' +
                            '<div class="istatistik-sayi" id="toplamKalemGoster">0</div>' +
                            '<div class="istatistik-etiket">Kalem</div>' +
                        '</div>' +
                        '<div class="istatistik">' +
                            '<div class="istatistik-sayi" id="toplamPaketGoster">0</div>' +
                            '<div class="istatistik-etiket">Paket</div>' +
                        '</div>' +
                    '</div>' +
                '</div>' +
                '<button type="button" class="okutma-btn" data-action="okumayaBasla">Okumaya Ba\u015fla</button>' +
            '</div>' +

            '<div id="hataKutusu" class="hata-kutu" style="display:none;"></div>' +

            '<div id="yukleniyorOverlay" class="yukleniyor-overlay gizle">' +
                '<div class="yukleniyor-icerik">' +
                    '<div class="spinner"></div>' +
                    '<div>Y\u00fckleniyor...</div>' +
                '</div>' +
            '</div>';
    }

    // === Oturum Yukle ===
    async function oturumYukle(oturumId) {
        yukleniyorGoster();
        hataGizle();

        try {
            var response = await fetch('/api/supabase/oturum/' + encodeURIComponent(oturumId));
            var data = await response.json();

            if (data.success) {
                mevcutOturum = data.oturum;

                el.oturumIdGoster.textContent = mevcutOturum.oturum_id;
                el.depoYeriGoster.textContent = mevcutOturum.depo_yeri;
                el.soforGoster.textContent = mevcutOturum.sofor_adi || '-';
                el.plakaGoster.textContent = mevcutOturum.plaka || '-';
                el.kullaniciGoster.textContent = mevcutOturum.kullanici || '-';
                el.toplamKalemGoster.textContent = mevcutOturum.toplam_kalem;
                el.toplamPaketGoster.textContent = mevcutOturum.toplam_paket;

                el.oturumSecimAlani.style.display = 'none';
                el.oturumBilgiAlani.style.display = 'block';

                history.replaceState(null, '', '/fis/nakliye-okutma?oturum=' + oturumId);
            } else {
                hataGoster(data.message || 'Oturum bulunamad\u0131');
                el.oturumSecimAlani.style.display = 'block';
                el.oturumBilgiAlani.style.display = 'none';
            }
        } catch (error) {
            hataGoster('Ba\u011flant\u0131 hatas\u0131: ' + error.message);
            el.oturumSecimAlani.style.display = 'block';
            el.oturumBilgiAlani.style.display = 'none';
        } finally {
            yukleniyorGizle();
        }
    }

    // === Acik Oturumlar ===
    async function acikOturumlariGoster() {
        el.oturumListesi.innerHTML = '<div class="bos-liste">Y\u00fckleniyor...</div>';
        el.acikOturumOverlay.classList.add('goster');

        try {
            var response = await fetch('/api/supabase/acik-oturumlar');
            var data = await response.json();

            if (data.success && data.oturumlar.length > 0) {
                el.oturumListesi.innerHTML = data.oturumlar.map(function(oturum) {
                    var tarih = new Date(oturum.tarih).toLocaleDateString('tr-TR');
                    return '<div class="oturum-item" data-action="oturumSecAcik" data-oturum="' + oturum.oturum_id + '">' +
                        '<div class="oturum-item-baslik">' + oturum.oturum_id + '</div>' +
                        '<div class="oturum-item-detay">' + (oturum.plaka || '-') + ' | ' + tarih + '</div>' +
                        '<div class="oturum-item-kalan">' + oturum.kalan_paket + ' paket kald\u0131 (' + oturum.okunan_paket + '/' + oturum.toplam_paket + ')</div>' +
                    '</div>';
                }).join('');
            } else {
                el.oturumListesi.innerHTML = '<div class="bos-liste">A\u00e7\u0131k oturum bulunamad\u0131</div>';
            }
        } catch (error) {
            el.oturumListesi.innerHTML = '<div class="bos-liste">Hata: ' + error.message + '</div>';
        }
    }

    // === Kapatilan Oturumlar ===
    async function kapatilanOturumlariGoster() {
        el.kapatilanOturumListesi.innerHTML = '<div class="bos-liste">Y\u00fckleniyor...</div>';
        el.kapatilanOturumOverlay.classList.add('goster');

        try {
            var response = await fetch('/api/supabase/kapatilan-oturumlar');
            var data = await response.json();

            if (data.success && data.oturumlar.length > 0) {
                el.kapatilanOturumListesi.innerHTML = data.oturumlar.map(function(oturum) {
                    var tarih = new Date(oturum.tarih).toLocaleDateString('tr-TR');
                    return '<div class="oturum-item kapatilan" data-action="oturumSecKapatilan" data-oturum="' + oturum.oturum_id + '">' +
                        '<div class="oturum-item-baslik">' + oturum.oturum_id + '</div>' +
                        '<div class="oturum-item-detay">' + (oturum.plaka || '-') + ' | ' + tarih + '</div>' +
                        '<div class="oturum-item-kalan" style="color:#27ae60;">Tamamland\u0131 (' + oturum.okunan_paket + '/' + oturum.toplam_paket + ')</div>' +
                    '</div>';
                }).join('');
            } else {
                el.kapatilanOturumListesi.innerHTML = '<div class="bos-liste">Kapat\u0131lan oturum bulunamad\u0131</div>';
            }
        } catch (error) {
            el.kapatilanOturumListesi.innerHTML = '<div class="bos-liste">Hata: ' + error.message + '</div>';
        }
    }

    // === UI Yardimci ===
    function hataGoster(mesaj) {
        el.hataKutusu.textContent = mesaj;
        el.hataKutusu.style.display = 'block';
    }
    function hataGizle() {
        if (el.hataKutusu) el.hataKutusu.style.display = 'none';
    }
    function yukleniyorGoster() {
        if (el.yukleniyorOverlay) el.yukleniyorOverlay.classList.remove('gizle');
    }
    function yukleniyorGizle() {
        if (el.yukleniyorOverlay) el.yukleniyorOverlay.classList.add('gizle');
    }

    // === Event Delegation ===
    function tikIsle(e) {
        var hedef = e.target.closest('[data-action]');

        if (!hedef) {
            // Overlay disina tiklama
            if (e.target === el.acikOturumOverlay) {
                el.acikOturumOverlay.classList.remove('goster');
            } else if (e.target === el.kapatilanOturumOverlay) {
                el.kapatilanOturumOverlay.classList.remove('goster');
            }
            return;
        }

        var action = hedef.dataset.action;

        switch (action) {
            case 'oturumAra':
                var id = el.oturumIdInput.value.trim();
                if (id) oturumYukle(id);
                else hataGoster('L\u00fctfen oturum numaras\u0131 girin');
                break;
            case 'acikOturumlar':
                acikOturumlariGoster();
                break;
            case 'kapatilanOturumlar':
                kapatilanOturumlariGoster();
                break;
            case 'acikModalKapat':
                el.acikOturumOverlay.classList.remove('goster');
                break;
            case 'kapatilanModalKapat':
                el.kapatilanOturumOverlay.classList.remove('goster');
                break;
            case 'oturumSecAcik':
                el.acikOturumOverlay.classList.remove('goster');
                AppRouter.git('/fis/nakliye-okut?oturum=' + hedef.dataset.oturum);
                break;
            case 'oturumSecKapatilan':
                el.kapatilanOturumOverlay.classList.remove('goster');
                AppRouter.git('/fis/nakliye-okut?oturum=' + hedef.dataset.oturum);
                break;
            case 'okumayaBasla':
                if (mevcutOturum) {
                    AppRouter.git('/fis/nakliye-okut?oturum=' + mevcutOturum.oturum_id);
                }
                break;
        }
    }

    // === Mount ===
    function mount(konteyner, params) {
        _konteyner = konteyner;
        konteyner.innerHTML = htmlOlustur();

        el = {
            oturumSecimAlani:       konteyner.querySelector('#oturumSecimAlani'),
            oturumBilgiAlani:       konteyner.querySelector('#oturumBilgiAlani'),
            oturumIdInput:          konteyner.querySelector('#oturumIdInput'),
            oturumIdGoster:         konteyner.querySelector('#oturumIdGoster'),
            depoYeriGoster:         konteyner.querySelector('#depoYeriGoster'),
            soforGoster:            konteyner.querySelector('#soforGoster'),
            plakaGoster:            konteyner.querySelector('#plakaGoster'),
            kullaniciGoster:        konteyner.querySelector('#kullaniciGoster'),
            toplamKalemGoster:      konteyner.querySelector('#toplamKalemGoster'),
            toplamPaketGoster:      konteyner.querySelector('#toplamPaketGoster'),
            hataKutusu:             konteyner.querySelector('#hataKutusu'),
            yukleniyorOverlay:      konteyner.querySelector('#yukleniyorOverlay'),
            acikOturumOverlay:      konteyner.querySelector('#acikOturumOverlay'),
            oturumListesi:          konteyner.querySelector('#oturumListesi'),
            kapatilanOturumOverlay: konteyner.querySelector('#kapatilanOturumOverlay'),
            kapatilanOturumListesi: konteyner.querySelector('#kapatilanOturumListesi')
        };

        // Event delegation
        _delegeHandler = tikIsle;
        konteyner.addEventListener('click', _delegeHandler);

        // Enter tusu
        _keypressHandler = function(e) {
            if (e.key === 'Enter') {
                var id = el.oturumIdInput.value.trim();
                if (id) oturumYukle(id);
            }
        };
        el.oturumIdInput.addEventListener('keypress', _keypressHandler);

        // Params kontrolu
        if (params && params.oturum) {
            oturumYukle(params.oturum);
        } else {
            el.oturumSecimAlani.style.display = 'block';
        }
    }

    // === Unmount ===
    function unmount() {
        if (_konteyner && _delegeHandler) {
            _konteyner.removeEventListener('click', _delegeHandler);
        }
        if (el.oturumIdInput && _keypressHandler) {
            el.oturumIdInput.removeEventListener('keypress', _keypressHandler);
        }

        _delegeHandler = null;
        _keypressHandler = null;
        _inputHandler = null;
        _konteyner = null;
        mevcutOturum = null;
        el = {};
    }

    return { mount: mount, unmount: unmount };
})();
