/**
 * Basit Fis Factory - satinalma-giris, firma-cikis, iade
 * BarkodOkuyucu ile QR okutma, yerel urun listesi (demo).
 * Kamera guvenligi: unmount() icinde BarkodOkuyucu.destroy() ILK aksiyondur.
 */
function BasitFisOlustur(yapilandirma) {
    var y = yapilandirma;
    var _konteyner = null;
    var _delegeHandler = null;
    var barkodOkuyucu = null;
    var eklenenUrunler = [];

    function escHtml(s) {
        return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    function htmlOlustur() {
        return '' +
            '<h1 class="baslik">' + y.baslik + '</h1>' +

            '<div class="barkod-alani">' +
                '<div id="barkodOkuyucuAlani"></div>' +
                '<div id="sonOkunan" class="son-okunan"></div>' +
            '</div>' +

            '<div class="urun-listesi">' +
                '<h3 style="margin-bottom:10px;">' + y.listeBaslik + '</h3>' +
                '<div id="urunListesi">' +
                    '<div class="bos-liste">Hen\u00fcz \u00fcr\u00fcn eklenmedi</div>' +
                '</div>' +
            '</div>' +

            '<button id="kaydetBtn" class="buton" data-action="kaydet" style="margin-top:20px;" disabled>' +
                'Fi\u015fi Kaydet' +
            '</button>';
    }

    function urunEkle(barkod) {
        if (!barkod) return;

        var mevcutUrun = null;
        for (var i = 0; i < eklenenUrunler.length; i++) {
            if (eklenenUrunler[i].barkod === barkod) { mevcutUrun = eklenenUrunler[i]; break; }
        }

        if (mevcutUrun) {
            mevcutUrun.adet++;
        } else {
            eklenenUrunler.push({ barkod: barkod, ad: '\u00dcr\u00fcn ' + barkod, adet: 1 });
        }

        var sonOkunan = document.getElementById('sonOkunan');
        if (sonOkunan) {
            sonOkunan.textContent = 'Son okunan: ' + barkod;
            sonOkunan.classList.add('goster');
        }

        listeGuncelle();
    }

    function listeGuncelle() {
        var urunListesi = document.getElementById('urunListesi');
        var kaydetBtn = document.getElementById('kaydetBtn');
        if (!urunListesi) return;

        if (eklenenUrunler.length === 0) {
            urunListesi.innerHTML = '<div class="bos-liste">Hen\u00fcz \u00fcr\u00fcn eklenmedi</div>';
            if (kaydetBtn) kaydetBtn.disabled = true;
            return;
        }

        if (kaydetBtn) kaydetBtn.disabled = false;

        urunListesi.innerHTML = eklenenUrunler.map(function(urun) {
            return '<div class="urun-satir">' +
                '<div class="urun-bilgi">' +
                    '<div class="urun-ad">' + escHtml(urun.ad) + '</div>' +
                    '<div class="urun-barkod">' + escHtml(urun.barkod) + '</div>' +
                '</div>' +
                '<div class="urun-adet" style="color:' + y.adetRenk + ';">' + y.adetPrefix + urun.adet + '</div>' +
            '</div>';
        }).join('');
    }

    function kaydet() {
        if (eklenenUrunler.length === 0) {
            alert('L\u00fctfen en az bir \u00fcr\u00fcn ekleyin');
            return;
        }
        alert(y.kaydetMesaji);
        eklenenUrunler = [];
        listeGuncelle();
        var sonOkunan = document.getElementById('sonOkunan');
        if (sonOkunan) sonOkunan.classList.remove('goster');
    }

    // === Event Delegation ===
    function tikIsle(e) {
        var hedef = e.target.closest('[data-action]');
        if (!hedef) return;
        if (hedef.dataset.action === 'kaydet') kaydet();
    }

    // === Mount ===
    function mount(konteyner) {
        _konteyner = konteyner;
        eklenenUrunler = [];
        konteyner.innerHTML = htmlOlustur();

        _delegeHandler = tikIsle;
        konteyner.addEventListener('click', _delegeHandler);

        barkodOkuyucu = new BarkodOkuyucu('#barkodOkuyucuAlani', {
            gs1Dogrulama: true,
            hataGosterici: function(hata) { alert(hata); },
            okumaSonrasi: urunEkle
        });
    }

    // === Unmount ===
    function unmount() {
        // KRITIK: Kamerayi kapat - ILK AKSIYON
        if (barkodOkuyucu) { barkodOkuyucu.destroy(); barkodOkuyucu = null; }

        if (_konteyner && _delegeHandler) _konteyner.removeEventListener('click', _delegeHandler);
        _delegeHandler = null;
        _konteyner = null;
        eklenenUrunler = [];
    }

    return { mount: mount, unmount: unmount };
}

// View tanimlari kaldirildi (satinalma-giris, firma-cikis, iade)
// BasitFisOlustur factory ileride yeni fiş tipleri icin kullanilabilir.
