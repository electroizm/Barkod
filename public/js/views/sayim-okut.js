/**
 * Sayim Okut View - teslimat-okut benzeri layout
 * QR okutma + Manuel giris + PRGsheet malzeme listesi + Rapor
 * URL: /sayim/okut?oturum=X&lokasyon=DEPO
 */
window.Views = window.Views || {};
window.Views.sayimOkut = (function() {
    var el = {};
    var _konteyner = null;
    var _delegeHandler = null;
    var _barkodOkuyucu = null;
    var _oturumId = null;
    var _lokasyon = null;
    var _okunanQrler = new Set();
    var _aramaTimer = null;
    var _islemDevamEdiyor = false;
    var _okumalar = [];
    var _aktifTab = 'qr';

    function escAttr(s) {
        return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    function htmlOlustur() {
        return '' +
            '<div class="fatura-ozet" id="sayimOzet">Y\u00fckleniyor...</div>' +

            '<div class="son-mesaj gizle" id="sonMesaj"></div>' +

            '<div class="progress-container gizle" id="progressContainer">' +
                '<div class="progress-bar">' +
                    '<div class="progress-fill" id="progressFill" style="width:0%"></div>' +
                    '<span class="progress-text" id="progressText">0%</span>' +
                '</div>' +
                '<div class="progress-stats">' +
                    '<span id="sayilanGoster" style="color:#22c55e;">0</span>' +
                    '<span class="stat-separator">/</span>' +
                    '<span id="toplamGoster" style="color:#3b82f6;">0</span>' +
                    '<span style="margin-left:6px; font-size:11px; color:#888;">\u00fcr\u00fcn</span>' +
                '</div>' +
            '</div>' +

            '<div class="sayim-tab-bar">' +
                '<button data-action="tabQr" class="sayim-tab aktif" id="tabQrBtn">Barkod Okutma</button>' +
                '<button data-action="tabManuel" class="sayim-tab" id="tabManuelBtn">Manuel Okutma</button>' +
            '</div>' +

            '<div id="qrTabIcerik">' +
                '<div class="okuma-alani" id="okumaAlani">' +
                    '<div id="barkodOkuyucuAlani"></div>' +
                '</div>' +
            '</div>' +

            '<div id="manuelTabIcerik" style="display:none;">' +
                '<div class="form-grup">' +
                    '<label>\u00dcr\u00fcn Ara</label>' +
                    '<input type="text" id="manuelArama" class="form-input" placeholder="Stok kodu veya \u00fcr\u00fcn ad\u0131...">' +
                '</div>' +
                '<div id="aramaListesi" class="sayim-arama-liste"></div>' +
                '<div id="manuelSecilen" style="display:none;">' +
                    '<div id="secilenUrunBilgi" class="sayim-secilen-urun"></div>' +
                    '<div class="form-grup" style="margin-top:10px;">' +
                        '<label>Adet</label>' +
                        '<input type="number" id="manuelAdet" class="form-input" value="1" min="1" style="width:100px;">' +
                    '</div>' +
                    '<button data-action="manuelEkle" class="buton buton-basari" style="margin-top:10px;">Ekle</button>' +
                '</div>' +
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

            '<div style="margin-top:20px;">' +
                '<button data-action="raporGoster" class="buton" style="margin-bottom:8px;">Rapor G\u00f6ster</button>' +
                '<button data-action="sayimiKapat" class="buton buton-tehlike" style="margin-bottom:8px;">Say\u0131m\u0131 Kapat</button>' +
            '</div>' +

            '<div id="raporAlani" style="display:none; margin-top:20px;"></div>' +

            '<div id="yukleniyorOverlay" class="yukleniyor-overlay gizle">' +
                '<div class="spinner"></div>' +
            '</div>';
    }

    // ─── Cache ─────────────────────────────────────────────────────
    function getCacheKey() { return 'sayim_qr_cache_' + _oturumId; }
    function frontendCacheYukle() {
        try { var d = localStorage.getItem(getCacheKey()); return d ? new Set(JSON.parse(d)) : new Set(); }
        catch (e) { return new Set(); }
    }
    function frontendCacheKaydet(set) {
        try { localStorage.setItem(getCacheKey(), JSON.stringify([...set])); } catch (e) { }
    }
    function frontendCacheyeEkle(qrKod) {
        _okunanQrler.add(qrKod);
        var c = frontendCacheYukle(); c.add(qrKod); frontendCacheKaydet(c);
    }

    // ─── Mount ─────────────────────────────────────────────────────
    function mount(konteyner, params) {
        _konteyner = konteyner;
        _oturumId = (params && params.oturum) || null;
        _lokasyon = (params && params.lokasyon) || 'DEPO';
        _okunanQrler = frontendCacheYukle();
        _islemDevamEdiyor = false;
        _okumalar = [];
        _aktifTab = 'qr';

        if (!_oturumId) {
            konteyner.innerHTML = '<div class="mesaj mesaj-hata">Oturum ID eksik. <a href="/sayim">Say\u0131m sayfas\u0131na d\u00f6n</a></div>';
            return;
        }

        konteyner.innerHTML = htmlOlustur();

        el = {
            sayimOzet:          konteyner.querySelector('#sayimOzet'),
            sonMesaj:           konteyner.querySelector('#sonMesaj'),
            progressContainer:  konteyner.querySelector('#progressContainer'),
            progressFill:       konteyner.querySelector('#progressFill'),
            progressText:       konteyner.querySelector('#progressText'),
            sayilanGoster:      konteyner.querySelector('#sayilanGoster'),
            toplamGoster:       konteyner.querySelector('#toplamGoster'),
            tabQrBtn:           konteyner.querySelector('#tabQrBtn'),
            tabManuelBtn:       konteyner.querySelector('#tabManuelBtn'),
            qrTab:              konteyner.querySelector('#qrTabIcerik'),
            manuelTab:          konteyner.querySelector('#manuelTabIcerik'),
            okumaAlani:         konteyner.querySelector('#okumaAlani'),
            okumaListesi:       konteyner.querySelector('#okumaListesi'),
            malzemeListesi:     konteyner.querySelector('#malzemeListesi'),
            manuelArama:        konteyner.querySelector('#manuelArama'),
            aramaListesi:       konteyner.querySelector('#aramaListesi'),
            manuelSecilen:      konteyner.querySelector('#manuelSecilen'),
            secilenUrunBilgi:   konteyner.querySelector('#secilenUrunBilgi'),
            manuelAdet:         konteyner.querySelector('#manuelAdet'),
            raporAlani:         konteyner.querySelector('#raporAlani'),
            yukleniyorOverlay:  konteyner.querySelector('#yukleniyorOverlay')
        };

        _delegeHandler = tikIsle;
        konteyner.addEventListener('click', _delegeHandler);

        el.manuelArama.addEventListener('input', function() {
            if (_aramaTimer) clearTimeout(_aramaTimer);
            _aramaTimer = setTimeout(function() { manuelAramaYap(); }, 300);
        });

        // Durum yukle, sonra barkod okuyucu baslat
        durumGuncelle().then(function() {
            _barkodOkuyucu = new BarkodOkuyucu('#barkodOkuyucuAlani', {
                gs1Dogrulama: true,
                hataGosterici: function(hata) {
                    okumaHatali(hata, 'format');
                    SesYoneticisi.sesliGeriBildirim('hata');
                },
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

    // ─── Unmount ───────────────────────────────────────────────────
    function unmount() {
        if (_barkodOkuyucu) { _barkodOkuyucu.destroy(); _barkodOkuyucu = null; }
        if (_aramaTimer) { clearTimeout(_aramaTimer); _aramaTimer = null; }
        if (_konteyner && _delegeHandler) _konteyner.removeEventListener('click', _delegeHandler);
        _delegeHandler = null;
        _konteyner = null;
        _oturumId = null;
        _lokasyon = null;
        _okunanQrler = new Set();
        _islemDevamEdiyor = false;
        _okumalar = [];
        el = {};
    }

    // ─── Event Delegation ──────────────────────────────────────────
    function tikIsle(e) {
        var hedef = e.target.closest('[data-action]');
        if (!hedef) return;
        var action = hedef.dataset.action;
        switch (action) {
            case 'tabQr': tabDegistir('qr'); break;
            case 'tabManuel': tabDegistir('manuel'); break;
            case 'manuelEkle': manuelUrunEkle(); break;
            case 'aramaSecim': aramaUrunSec(hedef); break;
            case 'tumunuDaralt': tumunuDaralt(); break;
            case 'tumunuGenislet': tumunuGenislet(); break;
            case 'malzemeToggle':
                malzemeToggle(parseInt(hedef.dataset.index), hedef.dataset.stokKod);
                break;
            case 'topluOkut':
                e.stopPropagation();
                topluOkut(hedef.dataset.stokKod, hedef.dataset.malzemeAdi, parseInt(hedef.dataset.kalan) || 0);
                break;
            case 'raporGoster': raporGoster(); break;
            case 'sayimiKapat': sayimiKapat(); break;
            case 'sayimCsv':
                window.open('/api/sayim/csv-indir/' + encodeURIComponent(_oturumId), '_blank');
                break;
        }
    }

    // ─── Tab Yonetimi ──────────────────────────────────────────────
    function tabDegistir(tab) {
        _aktifTab = tab;
        if (tab === 'qr') {
            el.qrTab.style.display = 'block';
            el.manuelTab.style.display = 'none';
            el.tabQrBtn.classList.add('aktif');
            el.tabManuelBtn.classList.remove('aktif');
        } else {
            el.qrTab.style.display = 'none';
            el.manuelTab.style.display = 'block';
            el.tabManuelBtn.classList.add('aktif');
            el.tabQrBtn.classList.remove('aktif');
        }
    }

    // ─── QR Okutma ─────────────────────────────────────────────────
    async function qrOkut(qrKod) {
        if (!qrKod || _islemDevamEdiyor) return;
        qrKod = qrKod.replace(/[\x00-\x1F\x7F]/g, '').trim();
        if (!qrKod) return;

        if (_okunanQrler.has(qrKod)) {
            okumaHatali('Bu paket zaten okundu!', 'DUPLICATE_QR');
            SesYoneticisi.sesliGeriBildirim('tekrar');
            return;
        }

        _islemDevamEdiyor = true;
        yukleniyorGoster();
        el.okumaAlani.classList.remove('basarili', 'hata');

        try {
            var yanit = await fetch('/api/sayim/qr-okut', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ oturum_id: _oturumId, qr_kod: qrKod })
            });
            var veri = await yanit.json();

            if (veri.success) {
                frontendCacheyeEkle(qrKod);
                okumaBasarili(veri);
                SesYoneticisi.sesliGeriBildirim('basarili');
            } else {
                if (veri.hata_tipi === 'DUPLICATE_QR') {
                    frontendCacheyeEkle(qrKod);
                    SesYoneticisi.sesliGeriBildirim('tekrar');
                } else {
                    SesYoneticisi.sesliGeriBildirim('hata');
                }
                okumaHatali(veri.message || 'Okuma hatasi', veri.hata_tipi);
            }
        } catch (err) {
            okumaHatali('Ba\u011flant\u0131 hatas\u0131: ' + err.message, 'CONNECTION_ERROR');
            SesYoneticisi.sesliGeriBildirim('hata');
        } finally {
            _islemDevamEdiyor = false;
            yukleniyorGizle();
            if (_barkodOkuyucu) _barkodOkuyucu.odaklan();
        }
    }

    function okumaBasarili(veri) {
        el.okumaAlani.classList.add('basarili');
        setTimeout(function() { el.okumaAlani.classList.remove('basarili'); }, 300);
        sonMesajGoster(veri.message, 'basarili');
        _okumalar.unshift({ basarili: true, mesaj: veri.message, zaman: new Date() });
        sonOkumalariGuncelle();
        durumGuncelle();
    }

    function okumaHatali(mesaj, hataTipi) {
        el.okumaAlani.classList.add('hata');
        setTimeout(function() { el.okumaAlani.classList.remove('hata'); }, 300);
        sonMesajGoster(mesaj, 'hata');
        _okumalar.unshift({ basarili: false, mesaj: mesaj, zaman: new Date() });
        sonOkumalariGuncelle();
    }

    // ─── Durum Guncelle ────────────────────────────────────────────
    async function durumGuncelle() {
        try {
            var yanit = await fetch('/api/sayim/sayim-durumu/' + encodeURIComponent(_oturumId));
            var veri = await yanit.json();
            if (veri.success) {
                el.sayimOzet.textContent = veri.lokasyon + ' Say\u0131m\u0131 - ' + (veri.sayim_kodu || '');

                var yuzde = veri.tamamlanma_yuzdesi || 0;
                el.progressFill.style.width = yuzde + '%';
                el.progressText.textContent = yuzde + '%';
                el.sayilanGoster.textContent = veri.sayilan_urun || 0;
                el.toplamGoster.textContent = veri.toplam_urun || 0;
                el.progressContainer.classList.remove('gizle');

                malzemeListesiGuncelle(veri.kalemler);
            }
        } catch (err) {
            console.error('Durum g\u00fcncelleme hatas\u0131:', err);
        }
    }

    // ─── Malzeme Listesi ───────────────────────────────────────────
    function kalemHtmlOlustur(kalem, index) {
        var durumSinifi = kalem.durum || 'status-gray';
        var malzemeAdi = escAttr(kalem.malzeme_adi || kalem.stok_kod || '-');
        var beklenen = kalem.beklenen || 0;
        var sayilan = kalem.sayilan || 0;
        var kalan = Math.max(0, beklenen - sayilan);

        var durumIkon = durumSinifi === 'status-green'
            ? ''
            : '<button class="btn-malzeme-oku" data-action="topluOkut" data-stok-kod="' + escAttr(kalem.stok_kod) + '" data-malzeme-adi="' + malzemeAdi + '" data-kalan="' + kalan + '"></button>';

        return '<div class="malzeme-item-wrapper">' +
            durumIkon +
            '<div class="malzeme-item ' + durumSinifi + '" data-stok-kod="' + escAttr(kalem.stok_kod) + '" data-index="' + index + '" data-beklenen="' + beklenen + '" data-sayilan="' + sayilan + '">' +
                '<div class="malzeme-baslik-row" data-action="malzemeToggle" data-index="' + index + '" data-stok-kod="' + escAttr(kalem.stok_kod) + '">' +
                    '<div class="malzeme-bilgi">' +
                        '<div class="malzeme-miktar">' + beklenen + ' - ' + (kalem.malzeme_adi || kalem.stok_kod || '-') + '</div>' +
                    '</div>' +
                '</div>' +
                '<div class="paket-detay" id="paketDetay' + index + '">' +
                    '<div class="paket-detay-icerik" id="paketIcerik' + index + '">' +
                        '<div class="paket-yukleniyor">Y\u00fckleniyor...</div>' +
                    '</div>' +
                '</div>' +
            '</div>' +
        '</div>';
    }

    function malzemeListesiGuncelle(kalemler) {
        if (!kalemler || kalemler.length === 0) {
            el.malzemeListesi.innerHTML = '<p style="text-align:center;color:#888;font-size:13px;">Hen\u00fcz malzeme bilgisi yok</p>';
            return;
        }

        var topKalem = kalemler.length;
        var topBeklenen = kalemler.reduce(function(t, k) { return t + (k.beklenen || 0); }, 0);
        var topSayilan = kalemler.reduce(function(t, k) { return t + (k.sayilan || 0); }, 0);

        var baslikHtml = '<div class="depo-baslik">' +
            '<div class="depo-adi">' + escAttr(_lokasyon || '') + '</div>' +
            '<div class="depo-ozet">' + topKalem + ' Kalem - (' + topSayilan + '/' + topBeklenen + ' \u00dcr\u00fcn)</div>' +
        '</div>';

        var kalemlerHtml = kalemler.map(function(kalem, index) {
            return kalemHtmlOlustur(kalem, index);
        }).join('');

        el.malzemeListesi.innerHTML = baslikHtml + '<div class="depo-kalemler">' + kalemlerHtml + '</div>';
    }

    async function malzemeToggle(index, stokKod) {
        var detay = document.getElementById('paketDetay' + index);
        var icerik = document.getElementById('paketIcerik' + index);
        if (!detay || !icerik) return;

        if (detay.classList.contains('acik')) { detay.classList.remove('acik'); return; }
        detay.classList.add('acik');

        try {
            icerik.innerHTML = '<div class="paket-yukleniyor">Y\u00fckleniyor...</div>';
            var r = await fetch('/api/sayim/sayim-paket-detay/' + encodeURIComponent(_oturumId) + '/' + encodeURIComponent(stokKod));
            var d = await r.json();
            if (d.success) {
                var html = '';
                if (d.paketler && d.paketler.length > 0) {
                    html += d.paketler.map(function(p) {
                        var s = p.okunan > 0 ? 'paket-green' : 'paket-gray';
                        return '<div class="paket-kutu ' + s + '">' +
                            '<div class="paket-etiket">P' + p.paket_sira + '</div>' +
                            '<div class="paket-sayi">' + p.okunan + '</div>' +
                        '</div>';
                    }).join('');
                }
                // Manuel Okutma + Kalan ayni satirda
                var malzemeItem = document.querySelector('.malzeme-item[data-stok-kod="' + stokKod + '"]');
                var kalanStr = '';
                if (malzemeItem) {
                    var bek = parseInt(malzemeItem.dataset.beklenen) || 0;
                    var say = parseInt(malzemeItem.dataset.sayilan) || 0;
                    var kal = Math.max(0, bek - say);
                    kalanStr = '<span style="color:#e67e22;">Kalan: ' + kal + '</span>';
                }
                if (d.manuel_adet > 0) {
                    html += '<div style="grid-column:1/-1; padding:8px 0 4px; font-size:13px; font-weight:500; display:flex; justify-content:space-between;">' +
                        '<span style="color:#2980b9;">Manuel Okutma: ' + d.manuel_adet + '</span>' +
                        kalanStr +
                    '</div>';
                } else if (kalanStr) {
                    html += '<div style="grid-column:1/-1; padding:8px 0 4px; font-size:13px; font-weight:500;">' + kalanStr + '</div>';
                }
                if (!html) {
                    html = '<div class="paket-yukleniyor">Hen\u00fcz okuma yok</div>';
                }
                icerik.innerHTML = html;
            } else {
                icerik.innerHTML = '<div class="paket-yukleniyor">Paket bilgisi bulunamad\u0131</div>';
            }
        } catch (e) {
            icerik.innerHTML = '<div class="paket-yukleniyor">Y\u00fcklenemedi</div>';
        }
    }

    function tumunuDaralt() {
        document.querySelectorAll('.paket-detay').forEach(function(d) { d.classList.remove('acik'); });
    }

    async function tumunuGenislet() {
        var items = document.querySelectorAll('.malzeme-item.status-yellow, .malzeme-item.status-gray');
        for (var i = 0; i < items.length; i++) {
            var item = items[i];
            var idx = item.dataset.index;
            var stokKod = item.dataset.stokKod;
            var detay = document.getElementById('paketDetay' + idx);
            if (!detay || detay.classList.contains('acik')) continue;
            await malzemeToggle(parseInt(idx), stokKod);
        }
    }

    // ─── Toplu Okut ───────────────────────────────────────────────
    function topluOkut(stokKod, malzemeAdi, kalan) {
        if (!stokKod || _islemDevamEdiyor) return;

        if (kalan === 1) {
            // Kalan 1 ise direkt tamamla (dialog yok)
            topluOkutGonder(stokKod, 1);
        } else {
            // Kalan 0 veya 1'den buyuk ise adet secim dialogu goster
            topluOkutDialog(stokKod, malzemeAdi, kalan);
        }
    }

    function topluOkutDialog(stokKod, malzemeAdi, kalan) {
        var modal = document.createElement('div');
        modal.className = 'sayim-rapor-modal';
        modal.innerHTML =
            '<div class="sayim-rapor-icerik" style="max-width:340px;">' +
                '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px;">' +
                    '<h3 style="margin:0; font-size:16px;">Toplu Tamamla</h3>' +
                    '<button class="sayim-rapor-kapat">\u2715</button>' +
                '</div>' +
                '<div style="font-size:14px; color:#333; margin-bottom:8px;">' + escAttr(malzemeAdi) + '</div>' +
                '<div style="font-size:13px; color:#666; margin-bottom:12px;">Kalan: ' + kalan + '</div>' +
                '<div style="margin-bottom:12px;">' +
                    '<label style="font-size:13px; color:#666; display:block; margin-bottom:4px;">Ka\u00e7 adet tamamlans\u0131n?</label>' +
                    '<input type="number" id="topluOkutAdet" class="form-input" value="' + kalan + '" min="1" max="999" style="width:120px; text-align:center; font-size:18px; font-weight:600;">' +
                '</div>' +
                '<button id="topluOkutOnayBtn" class="buton buton-basari" style="width:100%;">Tamamla</button>' +
            '</div>';

        document.body.appendChild(modal);

        var adetInput = modal.querySelector('#topluOkutAdet');
        adetInput.focus();
        adetInput.select();

        modal.querySelector('.sayim-rapor-kapat').addEventListener('click', function() {
            document.body.removeChild(modal);
        });
        modal.addEventListener('click', function(e) {
            if (e.target === modal) document.body.removeChild(modal);
        });

        modal.querySelector('#topluOkutOnayBtn').addEventListener('click', function() {
            var adet = parseInt(adetInput.value) || 0;
            if (adet < 1) { adetInput.focus(); return; }
            document.body.removeChild(modal);
            topluOkutGonder(stokKod, adet);
        });

        adetInput.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
                modal.querySelector('#topluOkutOnayBtn').click();
            }
        });
    }

    async function topluOkutGonder(stokKod, adet) {
        _islemDevamEdiyor = true;
        yukleniyorGoster();
        try {
            var body = { oturum_id: _oturumId, stok_kod: stokKod };
            if (adet) body.adet = adet;
            var yanit = await fetch('/api/sayim/toplu-okut', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
            if (!yanit.ok) {
                sonMesajGoster('Sunucu hatas\u0131 (' + yanit.status + ')', 'hata');
                SesYoneticisi.sesliGeriBildirim('hata');
                return;
            }
            var veri = await yanit.json();
            if (veri.success) {
                sonMesajGoster(veri.message, 'basarili');
                SesYoneticisi.sesliGeriBildirim('basarili');
                _okumalar.unshift({ basarili: true, mesaj: veri.message, zaman: new Date() });
                sonOkumalariGuncelle();
                durumGuncelle();
            } else {
                sonMesajGoster(veri.message || 'Toplu okutma hatasi', 'hata');
                SesYoneticisi.sesliGeriBildirim('hata');
            }
        } catch (err) {
            sonMesajGoster('Ba\u011flant\u0131 hatas\u0131: ' + err.message, 'hata');
            SesYoneticisi.sesliGeriBildirim('hata');
        } finally {
            _islemDevamEdiyor = false;
            yukleniyorGizle();
        }
    }

    // ─── Manuel Giris ──────────────────────────────────────────────
    async function manuelAramaYap() {
        var q = (el.manuelArama.value || '').trim();
        if (q.length < 2) {
            el.aramaListesi.innerHTML = '';
            el.manuelSecilen.style.display = 'none';
            return;
        }

        try {
            var yanit = await fetch('/api/stok/ara?q=' + encodeURIComponent(q));
            var veri = await yanit.json();

            if (!veri.success || !veri.sonuclar || veri.sonuclar.length === 0) {
                el.aramaListesi.innerHTML = '<div style="padding:10px; color:#999; text-align:center;">Sonu\u00e7 bulunamad\u0131</div>';
                return;
            }

            var sonuclar = veri.sonuclar.slice(0, 10);
            el.aramaListesi.innerHTML = sonuclar.map(function(s) {
                var stokKod = Object.values(s)[0]?.toString() || '';
                var ad = s['Malzeme Ad\u0131'] || stokKod;
                return '<div class="sayim-arama-item" data-action="aramaSecim" data-stok-kod="' + escAttr(stokKod) + '" data-malzeme-adi="' + escAttr(ad) + '">' +
                    '<div style="font-weight:500;">' + escAttr(ad) + '</div>' +
                    '<div style="font-size:12px; color:#666;">' + escAttr(stokKod) + '</div>' +
                '</div>';
            }).join('');

        } catch (err) {
            el.aramaListesi.innerHTML = '<div style="padding:10px; color:#e74c3c;">Arama hatasi</div>';
        }
    }

    function aramaUrunSec(hedef) {
        var stokKod = hedef.dataset.stokKod;
        var malzemeAdi = hedef.dataset.malzemeAdi;

        el.aramaListesi.innerHTML = '';
        el.manuelSecilen.style.display = 'block';
        el.secilenUrunBilgi.innerHTML =
            '<strong>' + escAttr(malzemeAdi) + '</strong><br>' +
            '<span style="font-size:13px; color:#666;">' + escAttr(stokKod) + '</span>';
        el.manuelSecilen.dataset.stokKod = stokKod;
        el.manuelSecilen.dataset.malzemeAdi = malzemeAdi;
        el.manuelAdet.value = '1';
        el.manuelAdet.focus();
    }

    async function manuelUrunEkle() {
        if (_islemDevamEdiyor) return;

        var stokKod = el.manuelSecilen.dataset.stokKod;
        var malzemeAdi = el.manuelSecilen.dataset.malzemeAdi;
        var adet = parseInt(el.manuelAdet.value) || 1;

        if (!stokKod) {
            sonMesajGoster('\u00d6nce bir \u00fcr\u00fcn se\u00e7in', 'hata');
            return;
        }

        _islemDevamEdiyor = true;
        yukleniyorGoster();

        try {
            var yanit = await fetch('/api/sayim/manuel-ekle', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    oturum_id: _oturumId,
                    stok_kod: stokKod,
                    malzeme_adi: malzemeAdi,
                    adet: adet
                })
            });
            var veri = await yanit.json();

            if (!veri.success) {
                sonMesajGoster(veri.message || 'Ekleme hatasi', 'hata');
                SesYoneticisi.sesliGeriBildirim('hata');
                return;
            }

            sonMesajGoster(veri.message, 'basarili');
            SesYoneticisi.sesliGeriBildirim('basarili');
            _okumalar.unshift({ basarili: true, mesaj: veri.message, zaman: new Date() });
            sonOkumalariGuncelle();

            el.manuelSecilen.style.display = 'none';
            el.manuelArama.value = '';
            el.manuelSecilen.dataset.stokKod = '';
            el.manuelSecilen.dataset.malzemeAdi = '';

            durumGuncelle();

        } catch (err) {
            sonMesajGoster('Ba\u011flant\u0131 hatas\u0131: ' + err.message, 'hata');
            SesYoneticisi.sesliGeriBildirim('hata');
        } finally {
            _islemDevamEdiyor = false;
            yukleniyorGizle();
        }
    }

    // ─── UI Yardimcilari ───────────────────────────────────────────
    function sonMesajGoster(mesaj, tip) {
        el.sonMesaj.textContent = mesaj;
        el.sonMesaj.className = 'son-mesaj ' + tip;
        el.sonMesaj.classList.remove('gizle');
    }

    function sonOkumalariGuncelle() {
        el.okumaListesi.innerHTML = _okumalar.slice(0, 10).map(function(o) {
            return '<div class="okuma-item ' + (o.basarili ? 'basarili' : 'hata') + '">' +
                '<svg class="okuma-ikon ' + (o.basarili ? 'basarili' : 'hata') + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
                    (o.basarili ? '<polyline points="20 6 9 17 4 12"/>' : '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>') +
                '</svg><div class="okuma-bilgi"><div class="okuma-urun">' + escAttr(o.mesaj) + '</div></div></div>';
        }).join('');
    }

    function yukleniyorGoster() { if (el.yukleniyorOverlay) el.yukleniyorOverlay.classList.remove('gizle'); }
    function yukleniyorGizle() { if (el.yukleniyorOverlay) el.yukleniyorOverlay.classList.add('gizle'); }

    // ─── Rapor ─────────────────────────────────────────────────────
    async function raporGoster() {
        el.raporAlani.style.display = 'block';
        el.raporAlani.innerHTML = '<div style="text-align:center; padding:20px; color:#666;">Rapor y\u00fckleniyor...</div>';

        try {
            var yanit = await fetch('/api/sayim/rapor/' + encodeURIComponent(_oturumId));
            var veri = await yanit.json();

            if (!veri.success) {
                el.raporAlani.innerHTML = '<div class="mesaj mesaj-hata">' + (veri.message || 'Rapor yuklenemedi') + '</div>';
                return;
            }

            el.raporAlani.innerHTML =
                '<h3 style="margin:0 0 10px 0;">Fark Raporu - ' + escAttr(veri.lokasyon) + '</h3>' +
                '<div class="sayim-rapor-ozet">' +
                    '<span class="sayim-ozet-esit">' + veri.ozet.esit + ' E\u015fit</span>' +
                    '<span class="sayim-ozet-eksik">' + veri.ozet.eksik + ' Eksik</span>' +
                    '<span class="sayim-ozet-fazla">' + veri.ozet.fazla + ' Fazla</span>' +
                '</div>' +
                '<div class="sayim-rapor-tablo">' +
                    '<div class="sayim-rapor-baslik-satir">' +
                        '<span style="flex:2">\u00dcr\u00fcn</span>' +
                        '<span style="flex:1;text-align:center">Bek.</span>' +
                        '<span style="flex:1;text-align:center">Say.</span>' +
                        '<span style="flex:1;text-align:center">Fark</span>' +
                    '</div>' +
                    veri.rapor.map(function(r) {
                        var cls = r.durum === 'esit' ? 'sayim-rapor-esit' : (r.durum === 'eksik' ? 'sayim-rapor-eksik' : 'sayim-rapor-fazla');
                        return '<div class="sayim-rapor-satir ' + cls + '">' +
                            '<span style="flex:2; font-size:13px;">' + escAttr(r.malzeme_adi) + '</span>' +
                            '<span style="flex:1;text-align:center">' + r.beklenen + '</span>' +
                            '<span style="flex:1;text-align:center">' + r.sayilan + '</span>' +
                            '<span style="flex:1;text-align:center;font-weight:600">' + (r.fark > 0 ? '+' : '') + r.fark + '</span>' +
                        '</div>';
                    }).join('') +
                '</div>' +
                '<button data-action="sayimCsv" class="buton" style="margin-top:15px;">CSV \u0130ndir</button>';

        } catch (err) {
            el.raporAlani.innerHTML = '<div class="mesaj mesaj-hata">Rapor yuklenemedi: ' + err.message + '</div>';
        }
    }

    // ─── Sayimi Kapat ──────────────────────────────────────────────
    async function sayimiKapat() {
        if (!confirm('Say\u0131m\u0131 kapatmak istedi\u011finize emin misiniz? Kapatt\u0131ktan sonra okuma yap\u0131lamaz.')) return;

        try {
            var yanit = await fetch('/api/sayim/kapat/' + encodeURIComponent(_oturumId), { method: 'POST' });
            var veri = await yanit.json();

            if (!veri.success) {
                sonMesajGoster(veri.message || 'Kapatma hatasi', 'hata');
                SesYoneticisi.sesliGeriBildirim('hata');
                return;
            }

            sonMesajGoster('Say\u0131m ba\u015far\u0131yla kapat\u0131ld\u0131', 'basarili');
            SesYoneticisi.sesliGeriBildirim('basarili');

            if (_barkodOkuyucu) {
                _barkodOkuyucu.destroy();
                _barkodOkuyucu = null;
            }

            raporGoster();

        } catch (err) {
            sonMesajGoster('Ba\u011flant\u0131 hatas\u0131: ' + err.message, 'hata');
            SesYoneticisi.sesliGeriBildirim('hata');
        }
    }

    return { mount: mount, unmount: unmount };
})();
