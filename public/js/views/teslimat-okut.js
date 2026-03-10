/**
 * Teslimat Okut View - Teslimat QR okutma sayfasi
 * BarkodOkuyucu ile QR tarama, /api/mikro endpointleri.
 * Depo bazli gruplama VAR (DEPO_ADLARI).
 * Kamera guvenligi: unmount() icinde BarkodOkuyucu.destroy() ILK aksiyondur.
 */
window.Views = window.Views || {};
window.Views['teslimat-okut'] = (function() {
    var el = {};
    var _konteyner = null;
    var _delegeHandler = null;
    var faturaNo = null;
    var okumalar = [];
    var barkodOkuyucu = null;

    var DEPO_ADLARI = {
        100: 'DEPO',
        200: 'SUBE',
        300: 'EXC'
    };

    function escAttr(s) {
        return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    function htmlOlustur() {
        return '' +
            '<div class="fatura-ozet" id="faturaOzet">Fatura: -</div>' +

            '<div class="son-mesaj gizle" id="sonMesaj"></div>' +

            '<div class="progress-container gizle" id="progressContainer">' +
                '<div class="progress-bar">' +
                    '<div class="progress-fill" id="progressFill" style="width:0%"></div>' +
                    '<span class="progress-text" id="progressText">0%</span>' +
                '</div>' +
                '<div class="progress-stats">' +
                    '<span id="kalanPaketGoster" style="color:#ef4444;">0</span>' +
                    '<span class="stat-separator">/</span>' +
                    '<span id="okunanPaketGoster" style="color:#22c55e;">0</span>' +
                    '<span class="stat-separator">/</span>' +
                    '<span id="toplamPaketGoster" style="color:#3b82f6;">0</span>' +
                '</div>' +
            '</div>' +

            '<div class="okuma-alani" id="okumaAlani">' +
                '<div id="barkodOkuyucuAlani"></div>' +
            '</div>' +

            '<div class="aksiyon-butonlari gizle" id="aksiyonButonlari">' +
                '<button type="button" class="btn btn-kaydet" data-action="kaydet">Kaydet</button>' +
                '<button type="button" class="btn btn-devam" data-action="devamEt">Devam Et</button>' +
                '<button type="button" class="btn btn-iptal" data-action="iptalEt">\u0130ptal</button>' +
            '</div>' +

            '<div class="tamamlandi-kutu gizle" id="tamamlandiKutu">' +
                '<h2>Tamamland\u0131!</h2>' +
                '<p>T\u00fcm paketler ba\u015far\u0131yla okundu.</p>' +
                '<a href="/fis/teslimat" class="geri-btn">Fatura Listesine D\u00f6n</a>' +
            '</div>' +

            '<div class="son-okumalar" id="sonOkumalarAlani">' +
                '<h3>Son Okumalar</h3>' +
                '<div class="okuma-listesi" id="okumaListesi"></div>' +
            '</div>' +

            '<div class="malzeme-listesi" id="malzemeListesiAlani">' +
                '<div class="malzeme-baslik-satir">' +
                    '<h3>Malzeme Durumu</h3>' +
                    '<div class="malzeme-butonlar">' +
                        '<button type="button" data-action="tumunuDaralt" class="btn-daralt">Daralt</button>' +
                        '<button type="button" data-action="tumunuGenislet" class="btn-genislet">Geni\u015flet</button>' +
                    '</div>' +
                '</div>' +
                '<div id="malzemeListesi"></div>' +
            '</div>' +

            '<div id="yukleniyorOverlay" class="yukleniyor-overlay gizle">' +
                '<div class="spinner"></div>' +
            '</div>';
    }

    // === Cache ===
    function getCacheKey() { return 'fatura_qr_cache_' + faturaNo; }
    function frontendCacheYukle() {
        try { var d = localStorage.getItem(getCacheKey()); return d ? new Set(JSON.parse(d)) : new Set(); }
        catch (e) { return new Set(); }
    }
    function frontendCacheKaydet(set) {
        try { localStorage.setItem(getCacheKey(), JSON.stringify([...set])); } catch (e) { }
    }
    function frontendCacheyeEkle(qrKod) {
        var c = frontendCacheYukle(); c.add(qrKod); frontendCacheKaydet(c);
    }
    function frontendCachedeVarMi(qrKod) { return frontendCacheYukle().has(qrKod); }
    async function frontendCacheSenkronize() {
        try {
            var r = await fetch('/api/mikro/okunan-qrler/' + encodeURIComponent(faturaNo));
            var d = await r.json();
            if (d.success && d.okunan_qrler) { var c = new Set(d.okunan_qrler); frontendCacheKaydet(c); return c.size; }
            return 0;
        } catch (e) { return 0; }
    }

    // === QR Okutma ===
    async function qrOkut(qrKod) {
        if (!qrKod) return;
        qrKod = qrKod.replace(/[\x00-\x1F\x7F]/g, '').trim();
        if (!qrKod) return;

        if (frontendCachedeVarMi(qrKod)) {
            okumaHatali('Bu paket zaten okundu!', 'DUPLICATE_QR');
            SesYoneticisi.sesliGeriBildirim('tekrar');
            return;
        }

        yukleniyorGoster();
        el.okumaAlani.classList.remove('basarili', 'hata');

        try {
            var kullanici = document.getElementById('kullaniciBilgi')?.textContent || 'bilinmiyor';
            var response = await fetch('/api/mikro/qr-okut', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ fatura_no: faturaNo, qr_kod: qrKod, kullanici: kullanici })
            });
            var data = await response.json();

            if (data.success) {
                frontendCacheyeEkle(qrKod);
                okumaBasarili(data);
                SesYoneticisi.sesliGeriBildirim('basarili');
            } else {
                if (data.hata_tipi === 'DUPLICATE_QR') { frontendCacheyeEkle(qrKod); SesYoneticisi.sesliGeriBildirim('tekrar'); }
                else if (data.hata_tipi === 'PAKET_LIMIT_ASILDI') { SesYoneticisi.sesliGeriBildirim('tekrar'); }
                else { SesYoneticisi.sesliGeriBildirim('hata'); }
                okumaHatali(data.message, data.hata_tipi);
            }
        } catch (error) {
            okumaHatali('Ba\u011flant\u0131 hatas\u0131: ' + error.message, 'CONNECTION_ERROR');
            SesYoneticisi.sesliGeriBildirim('hata');
        } finally {
            yukleniyorGizle();
            if (barkodOkuyucu) barkodOkuyucu.odaklan();
        }
    }

    function okumaBasarili(data) {
        el.okumaAlani.classList.add('basarili');
        setTimeout(function() { el.okumaAlani.classList.remove('basarili'); }, 300);
        sonMesajGoster(data.message, 'basarili');
        okumalar.unshift({
            basarili: true,
            mesaj: (data.eslesen_kalem.malzeme_adi || data.eslesen_kalem.product_desc || '-') + ' (' + data.paket_bilgi.sira + '/' + data.paket_bilgi.toplam + ')',
            zaman: new Date()
        });
        sonOkumalariGuncelle();
        durumGuncelle();
    }

    function okumaHatali(mesaj, hataTipi) {
        el.okumaAlani.classList.add('hata');
        setTimeout(function() { el.okumaAlani.classList.remove('hata'); }, 300);
        sonMesajGoster(mesaj, 'hata');
        okumalar.unshift({ basarili: false, mesaj: mesaj, zaman: new Date() });
        sonOkumalariGuncelle();
    }

    // === Durum ===
    async function durumGuncelle() {
        try {
            var response = await fetch('/api/mikro/fatura-durumu/' + encodeURIComponent(faturaNo));
            var data = await response.json();
            if (data.success) {
                // Fatura ozet bilgisi
                el.faturaOzet.textContent = 'Fatura: ' + (data.fatura.evrakno_sira || '-') + ' - ' + (data.fatura.cari_adi || '-');

                var yuzde = data.tamamlanma_yuzdesi;
                el.progressFill.style.width = yuzde + '%';
                el.progressText.textContent = yuzde + '%';
                el.okunanPaketGoster.textContent = data.okunan_paket;
                el.kalanPaketGoster.textContent = data.kalan_paket;
                el.toplamPaketGoster.textContent = data.toplam_paket;
                malzemeListesiGuncelle(data.kalemler);
                if (data.kalan_paket === 0 && data.toplam_paket > 0) tamamlandiGoster();
            }
        } catch (error) { console.error('Durum g\u00fcncelleme hatas\u0131:', error); }
    }

    // === Malzeme Listesi (depo bazli gruplama) ===
    function malzemeDurumSinifi(okunan, toplam) {
        if (okunan === 0) return 'status-gray';
        if (okunan >= toplam) return 'status-green';
        return 'status-yellow';
    }

    function kalemHtmlOlustur(kalem, index) {
        var durumSinifi = malzemeDurumSinifi(kalem.okunan_paket, kalem.beklenen_paket);
        var miktarInt = 1;
        if (kalem.miktar) { miktarInt = Math.floor(parseFloat(String(kalem.miktar).replace(',', '.')) || 1); }

        var malzemeAdi = escAttr(kalem.malzeme_adi || kalem.product_desc || '-');
        var durumIkon = durumSinifi === 'status-green'
            ? '<span class="malzeme-tik">&#10003;</span>'
            : '<button class="btn-malzeme-oku" data-action="topluOkut" data-kalem-id="' + kalem.id + '" data-malzeme-adi="' + malzemeAdi + '"></button>';

        return '<div class="malzeme-item ' + durumSinifi + '" data-kalem-id="' + kalem.id + '" data-index="' + index + '">' +
            '<div class="malzeme-baslik" data-action="malzemeToggle" data-index="' + index + '" data-kalem-id="' + kalem.id + '">' +
                durumIkon +
                '<div class="malzeme-bilgi">' +
                    '<div class="malzeme-miktar">' + miktarInt + ' - ' + (kalem.malzeme_adi || kalem.product_desc || '-') + '</div>' +
                '</div>' +
            '</div>' +
            '<div class="paket-detay" id="paketDetay' + index + '">' +
                '<div class="paket-detay-icerik" id="paketIcerik' + index + '">' +
                    '<div class="paket-yukleniyor">Y\u00fckleniyor...</div>' +
                '</div>' +
            '</div>' +
        '</div>';
    }

    function malzemeListesiGuncelle(kalemler) {
        if (!kalemler || kalemler.length === 0) {
            el.malzemeListesi.innerHTML = '<p style="text-align:center;color:#888;font-size:13px;">Hen\u00fcz malzeme bilgisi yok</p>';
            return;
        }

        // Depo bazli grupla
        var depoGruplari = {};
        kalemler.forEach(function(kalem) {
            var depo = kalem.cikis_depo_no || 0;
            if (!depoGruplari[depo]) depoGruplari[depo] = [];
            depoGruplari[depo].push(kalem);
        });

        // Depo siralamasi: kucukten buyuge
        var depoSirali = Object.keys(depoGruplari).map(Number).sort(function(a, b) { return a - b; });

        var globalIndex = 0;

        el.malzemeListesi.innerHTML = depoSirali.map(function(depoNo) {
            // Depo ici siralama: sari -> beyaz -> yesil
            var depoKalemleri = depoGruplari[depoNo].sort(function(a, b) {
                var durumA = malzemeDurumSinifi(a.okunan_paket, a.beklenen_paket);
                var durumB = malzemeDurumSinifi(b.okunan_paket, b.beklenen_paket);
                var sira = { 'status-yellow': 0, 'status-gray': 1, 'status-green': 2 };
                var fark = sira[durumA] - sira[durumB];
                if (fark !== 0) return fark;
                return (a.malzeme_adi || '').localeCompare(b.malzeme_adi || '', 'tr');
            });

            // Depo ozeti
            var topBeklenen = depoKalemleri.reduce(function(t, k) { return t + k.beklenen_paket; }, 0);
            var topOkunan = depoKalemleri.reduce(function(t, k) { return t + k.okunan_paket; }, 0);
            var topKalem = depoKalemleri.reduce(function(t, k) {
                var m = k.miktar ? Math.ceil(parseFloat(String(k.miktar).replace(',', '.')) || 1) : 1;
                return t + m;
            }, 0);

            var kalemlerHtml = depoKalemleri.map(function(kalem) {
                var h = kalemHtmlOlustur(kalem, globalIndex);
                globalIndex++;
                return h;
            }).join('');

            var depoAdi = DEPO_ADLARI[depoNo] || ('Depo ' + depoNo);

            return '<div class="depo-grup">' +
                '<div class="depo-baslik">' +
                    '<div class="depo-adi">' + depoAdi + '</div>' +
                    '<div class="depo-ozet">' + topKalem + ' Kalem - (' + topOkunan + '/' + topBeklenen + ' Paket)</div>' +
                '</div>' +
                '<div class="depo-kalemler">' + kalemlerHtml + '</div>' +
            '</div>';
        }).join('');
    }

    async function malzemeToggle(index, kalemId) {
        var detay = document.getElementById('paketDetay' + index);
        var icerik = document.getElementById('paketIcerik' + index);
        if (!detay || !icerik) return;

        if (detay.classList.contains('acik')) { detay.classList.remove('acik'); return; }
        detay.classList.add('acik');
        try {
            icerik.innerHTML = '<div class="paket-yukleniyor">Y\u00fckleniyor...</div>';
            var r = await fetch('/api/mikro/malzeme-paketler/' + encodeURIComponent(faturaNo) + '/' + kalemId);
            var d = await r.json();
            if (d.success && d.paketler) {
                icerik.innerHTML = d.paketler.map(function(p) {
                    var s = 'paket-gray';
                    if (p.okunan > 0 && p.okunan < p.beklenen) s = 'paket-yellow';
                    if (p.okunan >= p.beklenen) s = 'paket-green';
                    return '<div class="paket-kutu ' + s + '"><div class="paket-etiket">P' + p.paket_sira + '</div><div class="paket-sayi">' + p.okunan + '</div></div>';
                }).join('');
            } else { icerik.innerHTML = '<div class="paket-yukleniyor">Paket bilgisi bulunamad\u0131</div>'; }
        } catch (e) { icerik.innerHTML = '<div class="paket-yukleniyor">Y\u00fcklenemedi</div>'; }
    }

    function tumunuDaralt() {
        document.querySelectorAll('.paket-detay').forEach(function(d) { d.classList.remove('acik'); });
    }

    async function tumunuGenislet() {
        var items = document.querySelectorAll('.malzeme-item.status-yellow, .malzeme-item.status-gray');
        for (var i = 0; i < items.length; i++) {
            var item = items[i]; var idx = item.dataset.index; var kid = item.dataset.kalemId;
            var detay = document.getElementById('paketDetay' + idx);
            var icerik = document.getElementById('paketIcerik' + idx);
            if (!detay || detay.classList.contains('acik')) continue;
            detay.classList.add('acik');
            if (icerik && icerik.querySelector('.paket-yukleniyor')) {
                try {
                    var r = await fetch('/api/mikro/malzeme-paketler/' + encodeURIComponent(faturaNo) + '/' + kid);
                    var d = await r.json();
                    if (d.success && d.paketler) {
                        icerik.innerHTML = d.paketler.map(function(p) {
                            var s = 'paket-gray';
                            if (p.okunan > 0 && p.okunan < p.beklenen) s = 'paket-yellow';
                            if (p.okunan >= p.beklenen) s = 'paket-green';
                            return '<div class="paket-kutu ' + s + '"><div class="paket-etiket">P' + p.paket_sira + '</div><div class="paket-sayi">' + p.okunan + '</div></div>';
                        }).join('');
                    }
                } catch (e) { }
            }
        }
    }

    // === Toplu Okutma ===
    async function topluOkut(kalemId, malzemeAdi) {
        if (!kalemId) return;
        if (!confirm('"' + malzemeAdi + '" i\u00e7in eksik paketlerin t\u00fcm\u00fc okunmu\u015f say\u0131ls\u0131n m\u0131?')) return;
        try {
            var kullanici = document.getElementById('kullaniciBilgi')?.textContent || 'bilinmiyor';
            var r = await fetch('/api/mikro/toplu-okut', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ fatura_no: faturaNo, kalem_id: kalemId, kullanici: kullanici })
            });
            var d = await r.json();
            if (d.success) {
                sonMesajGoster(d.message, 'basarili'); SesYoneticisi.sesliGeriBildirim('basarili');
                okumalar.unshift({ basarili: true, mesaj: d.message, zaman: new Date() }); sonOkumalariGuncelle();
                await frontendCacheSenkronize(); durumGuncelle();
            } else { sonMesajGoster(d.message, 'hata'); SesYoneticisi.sesliGeriBildirim('hata'); }
        } catch (error) { sonMesajGoster('Ba\u011flant\u0131 hatas\u0131: ' + error.message, 'hata'); SesYoneticisi.sesliGeriBildirim('hata'); }
    }

    // === UI ===
    function sonMesajGoster(mesaj, tip) {
        el.sonMesaj.textContent = mesaj;
        el.sonMesaj.className = 'son-mesaj ' + tip;
        el.sonMesaj.classList.remove('gizle');
        el.aksiyonButonlari.classList.remove('gizle');
    }

    function sonOkumalariGuncelle() {
        el.okumaListesi.innerHTML = okumalar.slice(0, 10).map(function(o) {
            return '<div class="okuma-item ' + (o.basarili ? 'basarili' : 'hata') + '">' +
                '<svg class="okuma-ikon ' + (o.basarili ? 'basarili' : 'hata') + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
                    (o.basarili ? '<polyline points="20 6 9 17 4 12"/>' : '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>') +
                '</svg><div class="okuma-bilgi"><div class="okuma-urun">' + o.mesaj + '</div></div></div>';
        }).join('');
    }

    function tamamlandiGoster() {
        el.tamamlandiKutu.classList.remove('gizle');
        el.okumaAlani.style.display = 'none';
        el.sonMesaj.classList.add('gizle');
        SesYoneticisi.sesliGeriBildirim('tamamlandi');
    }

    function yukleniyorGoster() { if (el.yukleniyorOverlay) el.yukleniyorOverlay.classList.remove('gizle'); }
    function yukleniyorGizle() { if (el.yukleniyorOverlay) el.yukleniyorOverlay.classList.add('gizle'); }

    // === Event Delegation ===
    function tikIsle(e) {
        var hedef = e.target.closest('[data-action]');
        if (!hedef) return;
        var action = hedef.dataset.action;
        switch (action) {
            case 'tumunuDaralt': tumunuDaralt(); break;
            case 'tumunuGenislet': tumunuGenislet(); break;
            case 'topluOkut':
                e.stopPropagation();
                topluOkut(parseInt(hedef.dataset.kalemId), hedef.dataset.malzemeAdi);
                break;
            case 'malzemeToggle':
                malzemeToggle(parseInt(hedef.dataset.index), parseInt(hedef.dataset.kalemId));
                break;
            case 'kaydet': console.log('Kaydet'); break;
            case 'devamEt': console.log('Devam Et'); break;
            case 'iptalEt': console.log('\u0130ptal'); break;
        }
    }

    // === Mount ===
    function mount(konteyner, params) {
        _konteyner = konteyner;

        // Fatura no kontrolu
        faturaNo = params && params.fatura;
        if (!faturaNo) {
            AppRouter.git('/fis/teslimat');
            return;
        }

        konteyner.innerHTML = htmlOlustur();

        el = {
            faturaOzet:         konteyner.querySelector('#faturaOzet'),
            sonMesaj:           konteyner.querySelector('#sonMesaj'),
            progressContainer:  konteyner.querySelector('#progressContainer'),
            progressFill:       konteyner.querySelector('#progressFill'),
            progressText:       konteyner.querySelector('#progressText'),
            okunanPaketGoster:  konteyner.querySelector('#okunanPaketGoster'),
            kalanPaketGoster:   konteyner.querySelector('#kalanPaketGoster'),
            toplamPaketGoster:  konteyner.querySelector('#toplamPaketGoster'),
            okumaAlani:         konteyner.querySelector('#okumaAlani'),
            aksiyonButonlari:   konteyner.querySelector('#aksiyonButonlari'),
            tamamlandiKutu:     konteyner.querySelector('#tamamlandiKutu'),
            okumaListesi:       konteyner.querySelector('#okumaListesi'),
            malzemeListesi:     konteyner.querySelector('#malzemeListesi'),
            yukleniyorOverlay:  konteyner.querySelector('#yukleniyorOverlay')
        };

        _delegeHandler = tikIsle;
        konteyner.addEventListener('click', _delegeHandler);

        // Cache senkronize et, durum guncelle, barkod okuyucu baslat
        frontendCacheSenkronize().then(function() {
            durumGuncelle();

            barkodOkuyucu = new BarkodOkuyucu('#barkodOkuyucuAlani', {
                gs1Dogrulama: true,
                hataGosterici: function(hata) { okumaHatali(hata, 'format'); },
                okumaSonrasi: qrOkut
            });

            // Progress bar'i barkod-alt-satir icine tasi
            setTimeout(function() {
                var barkodEtiket = document.querySelector('.barkod-etiket');
                var prog = el.progressContainer;
                if (barkodEtiket && prog) {
                    barkodEtiket.parentNode.insertBefore(prog, barkodEtiket);
                    barkodEtiket.remove();
                    prog.classList.remove('gizle');
                    prog.style.flex = '1';
                    prog.style.margin = '0';
                }
            }, 100);
        });
    }

    // === Unmount ===
    function unmount() {
        // KRITIK: Kamerayi kapat - ILK AKSIYON
        if (barkodOkuyucu) { barkodOkuyucu.destroy(); barkodOkuyucu = null; }

        if (_konteyner && _delegeHandler) _konteyner.removeEventListener('click', _delegeHandler);
        _delegeHandler = null;
        _konteyner = null;
        faturaNo = null;
        okumalar = [];
        el = {};
    }

    return { mount: mount, unmount: unmount };
})();
