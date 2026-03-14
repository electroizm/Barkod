/**
 * On Kayit View - Barkod On Kayit sayfasi
 * Tab sistemi: Barkod Okutma + Manuel Okutma
 * Bekleyen okumalar listesi + Eslestir akisi
 * Kamera guvenligi: unmount() icinde BarkodOkuyucu.destroy() ILK aksiyondur.
 */
window.Views = window.Views || {};
window.Views['on-kayit'] = (function() {
    var _konteyner = null;
    var _delegeHandler = null;
    var _aramaHandler = null;
    var _enterHandler = null;
    var barkodOkuyucu = null;
    var aramaZamanlayici = null;
    var mesajZamanlayici = null;

    function escAttr(s) {
        return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    function kullaniciAl() {
        return document.getElementById('kullaniciBilgi')?.textContent || 'bilinmiyor';
    }

    function htmlOlustur() {
        return '' +
            '<h1 class="baslik">Barkod \u00d6n Kay\u0131t</h1>' +

            '<div id="sonucMesaj" style="display:none;"></div>' +

            '<div class="tab-container">' +
                '<button type="button" class="tab-btn aktif" data-action="tabDegistir" data-tab="barkod">Barkod Okutma</button>' +
                '<button type="button" class="tab-btn" data-action="tabDegistir" data-tab="manuel">Manuel Okutma</button>' +
            '</div>' +

            '<div class="tab-icerik aktif" id="tab-barkod">' +
                '<div class="okuma-alani" id="barkodOkuyucuAlani"></div>' +
            '</div>' +

            '<div class="tab-icerik" id="tab-manuel">' +
                '<input type="text" class="arama-input" id="aramaInput" placeholder="Malzeme ad\u0131 veya stok kodu ile aray\u0131n...">' +
                '<div class="arama-sonuc" id="aramaSonuc"></div>' +
            '</div>' +

            '<div class="bekleyen-baslik">' +
                '<input type="checkbox" id="hepsiniSecCheckbox" data-action="hepsiniSec" style="margin-right:8px;cursor:pointer;">' +
                'Bekleyen Okumalar <span id="bekleyenSayisi"></span>' +
            '</div>' +
            '<div id="bekleyenListe"></div>' +

            '<div class="eslestir-alan" id="eslestirAlani" style="display:none;">' +
                '<div class="eslestir-baslik">Sat\u0131\u015f Faturas\u0131 ile E\u015fle\u015ftir</div>' +
                '<input type="text" class="eslestir-input" id="evrakNoInput" placeholder="Evrak No girin" style="width:100%;margin-bottom:10px;">' +
                '<button type="button" class="eslestir-btn" data-action="eslestir" id="eslestirBtn" style="width:100%;">PRG Teslimat Fi\u015fi - E\u015fle\u015ftir</button>' +
            '</div>';
    }

    // === Mesaj ===
    function mesajGoster(mesaj, tip) {
        var el = document.getElementById('sonucMesaj');
        if (!el) return;
        if (mesajZamanlayici) clearTimeout(mesajZamanlayici);
        el.textContent = mesaj;
        el.className = 'sonuc-mesaj' + (tip ? ' ' + tip : '');
        el.style.display = 'block';
        if (tip === 'basari') {
            if (window.SesYoneticisi) SesYoneticisi.sesliGeriBildirim('basarili');
            mesajZamanlayici = setTimeout(function() { el.style.display = 'none'; }, 4000);
        } else if (tip === 'hata') {
            if (window.SesYoneticisi) SesYoneticisi.sesliGeriBildirim('hata');
        }
    }

    // === Tab Degistirme ===
    function tabDegistir(tabAdi) {
        if (!_konteyner) return;
        _konteyner.querySelectorAll('.tab-btn').forEach(function(b) { b.classList.remove('aktif'); });
        _konteyner.querySelectorAll('.tab-icerik').forEach(function(t) { t.classList.remove('aktif'); });
        var aktifBtn = _konteyner.querySelector('.tab-btn[data-tab="' + tabAdi + '"]');
        var aktifIcerik = document.getElementById('tab-' + tabAdi);
        if (aktifBtn) aktifBtn.classList.add('aktif');
        if (aktifIcerik) aktifIcerik.classList.add('aktif');
    }

    // === Barkod Okutma ===
    async function barkodOkut(qrKod) {
        if (!qrKod || !qrKod.trim()) return;
        qrKod = qrKod.replace(/[\x00-\x1F\x7F]/g, '').trim();
        if (!qrKod) return;

        mesajGoster('Barkod okunuyor...', '');

        try {
            var bilgiResponse = await fetch('/api/mikro/on-kayit-barkod-bilgi', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ qr_kod: qrKod })
            });
            var bilgi = await bilgiResponse.json();

            if (!bilgi.success) {
                mesajGoster(bilgi.message, 'hata');
                if (barkodOkuyucu) barkodOkuyucu.odaklan();
                return;
            }

            var kayitResponse = await fetch('/api/mikro/on-kayit-okuma-kaydet', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    stok_kod: bilgi.stok_kod,
                    malzeme_adi: bilgi.malzeme_adi,
                    product_desc: bilgi.product_desc,
                    paket_sayisi: bilgi.paket_sayisi,
                    paket_sira: bilgi.paket_sira,
                    qr_kod: bilgi.qr_kod_normalized || qrKod,
                    kullanici: kullaniciAl()
                })
            });
            var kayit = await kayitResponse.json();

            if (kayit.success) {
                mesajGoster(bilgi.malzeme_adi + ' P' + bilgi.paket_sira + '/' + bilgi.paket_sayisi, 'basari');
                bekleyenleriYukle();
            } else {
                mesajGoster(kayit.message, 'hata');
            }
        } catch (error) {
            mesajGoster('Ba\u011flant\u0131 hatas\u0131: ' + error.message, 'hata');
        }

        if (barkodOkuyucu) barkodOkuyucu.odaklan();
    }

    // === Manuel Arama ===
    async function urunAra(sorgu) {
        var sonucEl = document.getElementById('aramaSonuc');
        if (!sonucEl) return;
        if (!sorgu || sorgu.length < 2) {
            sonucEl.innerHTML = '<div class="bos-mesaj">En az 2 karakter yaz\u0131n.</div>';
            return;
        }

        sonucEl.innerHTML = '<div class="yukleniyor-kucuk">Aran\u0131yor...</div>';

        try {
            var response = await fetch('/api/stok/ara?q=' + encodeURIComponent(sorgu));
            var data = await response.json();

            if (!data.success || data.sonuclar.length === 0) {
                sonucEl.innerHTML = '<div class="bos-mesaj">Sonuc bulunamadi.</div>';
                return;
            }

            sonucEl.innerHTML = data.sonuclar.slice(0, 20).map(function(kayit) {
                var malzemeAdi = kayit['Malzeme Adi'] || kayit['Malzeme Ad\u0131'] || '-';
                var stokKod = Object.values(kayit)[0] || '';
                return '<div class="arama-item" data-action="manuelSec" data-stok-kod="' + escAttr(stokKod) + '" data-malzeme-adi="' + escAttr(malzemeAdi) + '">' +
                    '<div class="arama-item-adi">' + malzemeAdi + '</div>' +
                    '<div class="arama-item-kod">' + stokKod + '</div>' +
                '</div>';
            }).join('');
        } catch (error) {
            sonucEl.innerHTML = '<div class="bos-mesaj">Hata: ' + error.message + '</div>';
        }
    }

    async function manuelOkut(stokKod, malzemeAdi) {
        mesajGoster('Paket bilgisi al\u0131n\u0131yor...', '');

        try {
            var paketSayisi = 1;
            var productDesc = null;

            try {
                var productCode = stokKod.substring(0, 10);
                var dogtasResponse = await fetch('/api/dogtas/urun-paketleri', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ stokKodlari: [productCode] })
                });
                var dogtasData = await dogtasResponse.json();

                if (dogtasData.success && dogtasData.sonuclar && dogtasData.sonuclar.length > 0) {
                    var sonuc = dogtasData.sonuclar[0];
                    if (sonuc.basarili && sonuc.veri) {
                        paketSayisi = sonuc.veri.paketSayisi || 1;
                        productDesc = sonuc.veri.productDesc;
                    }
                }
            } catch (e) { /* fallback 1 paket */ }

            var response = await fetch('/api/mikro/on-kayit-manuel-okuma', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    stok_kod: stokKod,
                    malzeme_adi: malzemeAdi,
                    product_desc: productDesc,
                    paket_sayisi: paketSayisi,
                    kullanici: kullaniciAl()
                })
            });
            var data = await response.json();

            if (data.success) {
                mesajGoster(data.message, 'basari');
                var aramaInput = document.getElementById('aramaInput');
                var aramaSonuc = document.getElementById('aramaSonuc');
                if (aramaInput) aramaInput.value = '';
                if (aramaSonuc) aramaSonuc.innerHTML = '';
                bekleyenleriYukle();
            } else {
                mesajGoster(data.message, 'hata');
            }
        } catch (error) {
            mesajGoster('Hata: ' + error.message, 'hata');
        }
    }

    // === Bekleyen Okumalar ===
    async function bekleyenleriYukle() {
        var bekleyenListe = document.getElementById('bekleyenListe');
        var bekleyenSayisi = document.getElementById('bekleyenSayisi');
        var eslestirAlani = document.getElementById('eslestirAlani');
        if (!bekleyenListe) return;

        try {
            var response = await fetch('/api/mikro/on-kayit-bekleyenler');
            var data = await response.json();

            if (!data.success || data.okumalar.length === 0) {
                bekleyenListe.innerHTML = '<div class="bos-mesaj">Bekleyen okuma yok.</div>';
                if (bekleyenSayisi) bekleyenSayisi.textContent = '';
                if (eslestirAlani) eslestirAlani.style.display = 'none';
                return;
            }

            if (bekleyenSayisi) bekleyenSayisi.textContent = '(' + data.toplam + ' paket)';
            if (eslestirAlani) eslestirAlani.style.display = 'block';

            bekleyenListe.innerHTML = data.okumalar.map(function(okuma) {
                var depoKaydedildi = okuma.depo ? ' kaydedildi' : '';
                return '<div class="bekleyen-item" data-id="' + okuma.id + '">' +
                    '<div class="bekleyen-ust">' +
                        '<input type="checkbox" class="bekleyen-checkbox" data-action="checkboxToggle" data-id="' + okuma.id + '">' +
                        '<div class="bekleyen-adi">' + (okuma.malzeme_adi || okuma.stok_kod) + '</div>' +
                    '</div>' +
                    '<div class="bekleyen-alt">' +
                        '<div class="bekleyen-detay">' + okuma.stok_kod + ' | P' + okuma.paket_sira + '/' + okuma.paket_sayisi + '</div>' +
                        '<select class="depo-select' + depoKaydedildi + '" data-id="' + okuma.id + '">' +
                            '<option value="">Depo</option>' +
                            '<option value="100"' + (okuma.depo == 100 ? ' selected' : '') + '>100 - DEPO</option>' +
                            '<option value="200"' + (okuma.depo == 200 ? ' selected' : '') + '>200 - SUBE</option>' +
                            '<option value="300"' + (okuma.depo == 300 ? ' selected' : '') + '>300 - EXC</option>' +
                        '</select>' +
                        '<button type="button" class="kaydet-btn" data-action="depoKaydet" data-id="' + okuma.id + '">Kaydet</button>' +
                        '<button type="button" class="sil-btn" data-action="okumaySil" data-id="' + okuma.id + '">Sil</button>' +
                    '</div>' +
                '</div>';
            }).join('');
        } catch (error) {
            bekleyenListe.innerHTML = '<div class="bos-mesaj">Y\u00fckleme hatas\u0131.</div>';
        }
    }

    // === Depo Kaydet ===
    async function depoKaydet(id) {
        var depoSelect = document.querySelector('.depo-select[data-id="' + id + '"]');
        var depo = depoSelect ? depoSelect.value : '';
        if (!depo) { mesajGoster('Depo secimi yapin', 'hata'); return; }

        try {
            var response = await fetch('/api/mikro/on-kayit-depo-kaydet', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: parseInt(id), depo: parseInt(depo) })
            });
            var data = await response.json();
            if (data.success) {
                mesajGoster(data.message, 'basari');
                if (depoSelect) depoSelect.classList.add('kaydedildi');
            } else {
                mesajGoster(data.message, 'hata');
            }
        } catch (e) {
            mesajGoster('Kaydetme hatasi: ' + e.message, 'hata');
        }
    }

    // === Okuma Sil ===
    async function okumaySil(id) {
        try {
            var response = await fetch('/api/mikro/on-kayit-okuma/' + id, { method: 'DELETE' });
            var data = await response.json();
            if (data.success) {
                mesajGoster(data.message, 'basari');
                bekleyenleriYukle();
            } else {
                mesajGoster(data.message, 'hata');
            }
        } catch (e) {
            mesajGoster('Silme hatasi: ' + e.message, 'hata');
        }
    }

    // === Eslestir ===
    async function eslestir() {
        var evrakNoInput = document.getElementById('evrakNoInput');
        var eslestirBtn = document.getElementById('eslestirBtn');
        var evrakNo = evrakNoInput ? evrakNoInput.value.trim() : '';

        if (!evrakNo) { mesajGoster('Evrak numaras\u0131 girin', 'hata'); return; }

        var seciliCheckboxlar = document.querySelectorAll('.bekleyen-checkbox:checked');
        if (seciliCheckboxlar.length === 0) {
            mesajGoster('E\u015fle\u015ftirmek i\u00e7in en az bir \u00fcr\u00fcn se\u00e7in', 'hata');
            return;
        }

        var seciliIdler = [];
        seciliCheckboxlar.forEach(function(cb) { seciliIdler.push(parseInt(cb.dataset.id)); });

        if (eslestirBtn) { eslestirBtn.disabled = true; eslestirBtn.textContent = 'E\u015fle\u015ftiriliyor...'; }

        try {
            var response = await fetch('/api/mikro/on-kayit-eslestir', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    evrakno_sira: evrakNo,
                    kullanici: kullaniciAl(),
                    secili_idler: seciliIdler
                })
            });
            var data = await response.json();

            if (data.success) {
                mesajGoster(data.message, 'basari');
                if (evrakNoInput) evrakNoInput.value = '';
                bekleyenleriYukle();
            } else {
                mesajGoster(data.message, 'hata');
            }
        } catch (error) {
            mesajGoster('Hata: ' + error.message, 'hata');
        } finally {
            if (eslestirBtn) {
                eslestirBtn.disabled = false;
                eslestirBtn.textContent = 'PRG Teslimat Fi\u015fi - E\u015fle\u015ftir';
            }
        }
    }

    // === Event Delegation ===
    function tikIsle(e) {
        var hedef = e.target.closest('[data-action]');
        if (!hedef) return;
        var action = hedef.dataset.action;

        switch (action) {
            case 'tabDegistir':
                tabDegistir(hedef.dataset.tab);
                break;
            case 'manuelSec':
                manuelOkut(hedef.dataset.stokKod, hedef.dataset.malzemeAdi);
                break;
            case 'hepsiniSec':
                var seciliMi = hedef.checked;
                document.querySelectorAll('.bekleyen-checkbox').forEach(function(cb) {
                    cb.checked = seciliMi;
                    var item = cb.closest('.bekleyen-item');
                    if (item) item.classList.toggle('secili', seciliMi);
                });
                break;
            case 'checkboxToggle':
                var item = hedef.closest('.bekleyen-item');
                if (item) item.classList.toggle('secili', hedef.checked);
                break;
            case 'depoKaydet':
                depoKaydet(hedef.dataset.id);
                break;
            case 'okumaySil':
                okumaySil(hedef.dataset.id);
                break;
            case 'eslestir':
                eslestir();
                break;
        }
    }

    // === Mount ===
    function mount(konteyner) {
        _konteyner = konteyner;
        konteyner.innerHTML = htmlOlustur();

        // Event delegation
        _delegeHandler = tikIsle;
        konteyner.addEventListener('click', _delegeHandler);

        // Arama input handler
        var aramaInput = document.getElementById('aramaInput');
        if (aramaInput) {
            _aramaHandler = function() {
                clearTimeout(aramaZamanlayici);
                var val = aramaInput.value.trim();
                aramaZamanlayici = setTimeout(function() { urunAra(val); }, 300);
            };
            aramaInput.addEventListener('input', _aramaHandler);
        }

        // Evrak no enter handler
        var evrakNoInput = document.getElementById('evrakNoInput');
        if (evrakNoInput) {
            _enterHandler = function(e) {
                if (e.key === 'Enter') eslestir();
            };
            evrakNoInput.addEventListener('keypress', _enterHandler);
        }

        // Bekleyenleri yukle
        bekleyenleriYukle();

        // Barkod okuyucu baslat
        barkodOkuyucu = new BarkodOkuyucu('#barkodOkuyucuAlani', {
            otomatikOkuma: true,
            kameraAktif: true,
            gs1Dogrulama: true,
            hataGosterici: function(hata) { mesajGoster(hata, 'hata'); },
            okumaSonrasi: barkodOkut
        });
    }

    // === Unmount ===
    function unmount() {
        // KRITIK: Kamerayi kapat - ILK AKSIYON
        if (barkodOkuyucu) { barkodOkuyucu.destroy(); barkodOkuyucu = null; }

        // Zamanlayicilari temizle
        if (aramaZamanlayici) { clearTimeout(aramaZamanlayici); aramaZamanlayici = null; }
        if (mesajZamanlayici) { clearTimeout(mesajZamanlayici); mesajZamanlayici = null; }

        // Event listener'lari kaldir
        if (_konteyner && _delegeHandler) _konteyner.removeEventListener('click', _delegeHandler);

        var aramaInput = document.getElementById('aramaInput');
        if (aramaInput && _aramaHandler) aramaInput.removeEventListener('input', _aramaHandler);

        var evrakNoInput = document.getElementById('evrakNoInput');
        if (evrakNoInput && _enterHandler) evrakNoInput.removeEventListener('keypress', _enterHandler);

        _delegeHandler = null;
        _aramaHandler = null;
        _enterHandler = null;
        _konteyner = null;
    }

    return { mount: mount, unmount: unmount };
})();
