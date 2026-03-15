/**
 * Sayim Okut View - QR okutma + Manuel giris + Urun listesi + Rapor
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

    function mount(konteyner, params) {
        _konteyner = konteyner;
        _oturumId = params.oturum || null;
        _lokasyon = params.lokasyon || 'DEPO';
        _okunanQrler = new Set();
        _islemDevamEdiyor = false;

        if (!_oturumId) {
            konteyner.innerHTML = '<div class="mesaj mesaj-hata">Oturum ID eksik. <a href="/sayim">Say\u0131m sayfas\u0131na d\u00f6n</a></div>';
            return;
        }

        konteyner.innerHTML =
            // Baslik + ozet
            '<div class="sayim-okut-baslik">' +
                '<h2 id="sayimBaslik" style="margin:0 0 5px 0; font-size:18px; color:#2c3e50;">' + _lokasyon + ' Say\u0131m\u0131</h2>' +
                '<div id="sayimOzet" class="sayim-okut-ozet">Y\u00fckleniyor...</div>' +
            '</div>' +

            // Tab butonlari
            '<div class="sayim-tab-bar">' +
                '<button data-action="tabQr" class="sayim-tab aktif" id="tabQrBtn">QR Okut</button>' +
                '<button data-action="tabManuel" class="sayim-tab" id="tabManuelBtn">Manuel Giri\u015f</button>' +
            '</div>' +

            // QR Tab
            '<div id="qrTabIcerik" class="sayim-tab-icerik">' +
                '<div class="barkod-alani">' +
                    '<div id="barkodOkuyucu"></div>' +
                '</div>' +
                '<div id="sonOkunan" class="son-okunan"></div>' +
            '</div>' +

            // Manuel Tab
            '<div id="manuelTabIcerik" class="sayim-tab-icerik" style="display:none;">' +
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

            // Urun listesi
            '<div class="sayim-urun-baslik" style="margin-top:20px;">' +
                '<h3 style="margin:0;">Say\u0131lan \u00dcr\u00fcnler</h3>' +
            '</div>' +
            '<div id="urunListesi" class="urun-listesi">' +
                '<div class="bos-liste">Hen\u00fcz \u00fcr\u00fcn say\u0131lmad\u0131</div>' +
            '</div>' +

            // Alt butonlar
            '<div style="margin-top:20px;">' +
                '<button data-action="raporGoster" class="buton" style="margin-bottom:8px;">Rapor G\u00f6ster</button>' +
                '<button data-action="sayimiKaydet" class="buton buton-tehlike" style="margin-bottom:8px;">Say\u0131m\u0131 Kapat</button>' +
            '</div>' +

            // Rapor alani (gizli)
            '<div id="raporAlani" style="display:none; margin-top:20px;"></div>';

        el.sayimBaslik = konteyner.querySelector('#sayimBaslik');
        el.sayimOzet = konteyner.querySelector('#sayimOzet');
        el.tabQrBtn = konteyner.querySelector('#tabQrBtn');
        el.tabManuelBtn = konteyner.querySelector('#tabManuelBtn');
        el.qrTab = konteyner.querySelector('#qrTabIcerik');
        el.manuelTab = konteyner.querySelector('#manuelTabIcerik');
        el.sonOkunan = konteyner.querySelector('#sonOkunan');
        el.manuelArama = konteyner.querySelector('#manuelArama');
        el.aramaListesi = konteyner.querySelector('#aramaListesi');
        el.manuelSecilen = konteyner.querySelector('#manuelSecilen');
        el.secilenUrunBilgi = konteyner.querySelector('#secilenUrunBilgi');
        el.manuelAdet = konteyner.querySelector('#manuelAdet');
        el.urunListesi = konteyner.querySelector('#urunListesi');
        el.raporAlani = konteyner.querySelector('#raporAlani');

        _delegeHandler = tikIsle;
        konteyner.addEventListener('click', _delegeHandler);

        // Manuel arama input
        el.manuelArama.addEventListener('input', function() {
            if (_aramaTimer) clearTimeout(_aramaTimer);
            _aramaTimer = setTimeout(function() { manuelAramaYap(); }, 300);
        });

        // BarkodOkuyucu baslat
        _barkodOkuyucu = new BarkodOkuyucu('#barkodOkuyucu', {
            gs1Dogrulama: true,
            hataGosterici: function(hata) { bildirimGoster(hata, 'hata'); },
            okumaSonrasi: function(barkod) { qrOkut(barkod); }
        });

        // Oturum durumunu yukle
        oturumDurumuYukle();
    }

    function unmount() {
        if (_barkodOkuyucu) {
            _barkodOkuyucu.destroy();
            _barkodOkuyucu = null;
        }
        if (_aramaTimer) {
            clearTimeout(_aramaTimer);
            _aramaTimer = null;
        }
        if (_delegeHandler && _konteyner) {
            _konteyner.removeEventListener('click', _delegeHandler);
        }
        _delegeHandler = null;
        _konteyner = null;
        _oturumId = null;
        _lokasyon = null;
        _okunanQrler = new Set();
        _islemDevamEdiyor = false;
        el = {};
    }

    function tikIsle(e) {
        var hedef = e.target.closest('[data-action]');
        if (!hedef) return;

        var action = hedef.dataset.action;
        switch (action) {
            case 'tabQr':
                tabDegistir('qr');
                break;
            case 'tabManuel':
                tabDegistir('manuel');
                break;
            case 'manuelEkle':
                manuelUrunEkle();
                break;
            case 'aramaSecim':
                aramaUrunSec(hedef);
                break;
            case 'okumasilBtn':
                okumaSil(hedef.dataset.okumaId);
                break;
            case 'raporGoster':
                raporGoster();
                break;
            case 'sayimiKaydet':
                sayimiKapat();
                break;
            case 'sayimCsv':
                window.open('/api/sayim/csv-indir/' + _oturumId, '_blank');
                break;
        }
    }

    // ─── Tab Yonetimi ──────────────────────────────────────────

    function tabDegistir(tab) {
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

    // ─── QR Okutma ─────────────────────────────────────────────

    async function qrOkut(barkod) {
        if (!barkod || _islemDevamEdiyor) return;

        // Kontrol karakterlerini temizle
        barkod = barkod.replace(/[\x00-\x1F\x7F]/g, '');

        // Frontend duplicate kontrol
        if (_okunanQrler.has(barkod)) {
            bildirimGoster('Bu paket zaten okundu!', 'uyari');
            if (window.SesYoneticisi) window.SesYoneticisi.sesliGeriBildirim('tekrar');
            return;
        }

        _islemDevamEdiyor = true;

        try {
            var yanit = await fetch('/api/sayim/qr-okut', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    oturum_id: _oturumId,
                    qr_kod: barkod
                })
            });
            var veri = await yanit.json();

            if (!veri.success) {
                bildirimGoster(veri.message || 'Okuma hatasi', 'hata');
                if (veri.hata_tipi === 'DUPLICATE_QR') {
                    _okunanQrler.add(barkod);
                    if (window.SesYoneticisi) window.SesYoneticisi.sesliGeriBildirim('tekrar');
                } else {
                    if (window.SesYoneticisi) window.SesYoneticisi.sesliGeriBildirim('hata');
                }
                return;
            }

            // Basarili
            _okunanQrler.add(barkod);
            if (window.SesYoneticisi) window.SesYoneticisi.sesliGeriBildirim('basarili');

            el.sonOkunan.textContent = veri.message;
            el.sonOkunan.classList.add('goster');

            // Ozet guncelle
            ozetGuncelle(veri.toplam_cesit, veri.toplam_okuma);

            // Listeyi yenile
            oturumDurumuYukle();

        } catch (err) {
            bildirimGoster('Baglanti hatasi: ' + err.message, 'hata');
            if (window.SesYoneticisi) window.SesYoneticisi.sesliGeriBildirim('hata');
        } finally {
            _islemDevamEdiyor = false;
        }
    }

    // ─── Manuel Giris ──────────────────────────────────────────

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

            // Ilk 10 sonuc
            var sonuclar = veri.sonuclar.slice(0, 10);
            el.aramaListesi.innerHTML = sonuclar.map(function(s) {
                var stokKod = Object.values(s)[0]?.toString() || '';
                var ad = s['Malzeme Ad\u0131'] || stokKod;
                return '<div class="sayim-arama-item" data-action="aramaSecim" data-stok-kod="' + stokKod + '" data-malzeme-adi="' + ad.replace(/"/g, '&quot;') + '">' +
                    '<div style="font-weight:500;">' + ad + '</div>' +
                    '<div style="font-size:12px; color:#666;">' + stokKod + '</div>' +
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
            '<strong>' + malzemeAdi + '</strong><br>' +
            '<span style="font-size:13px; color:#666;">' + stokKod + '</span>';
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
            bildirimGoster('\u00d6nce bir \u00fcr\u00fcn se\u00e7in', 'hata');
            return;
        }

        _islemDevamEdiyor = true;

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
                bildirimGoster(veri.message || 'Ekleme hatasi', 'hata');
                return;
            }

            bildirimGoster(veri.message, 'basari');
            if (window.SesYoneticisi) window.SesYoneticisi.sesliGeriBildirim('basarili');

            // Formu temizle
            el.manuelSecilen.style.display = 'none';
            el.manuelArama.value = '';
            el.manuelSecilen.dataset.stokKod = '';
            el.manuelSecilen.dataset.malzemeAdi = '';

            // Ozet guncelle
            ozetGuncelle(veri.toplam_cesit, veri.toplam_okuma);

            // Listeyi yenile
            oturumDurumuYukle();

        } catch (err) {
            bildirimGoster('Baglanti hatasi: ' + err.message, 'hata');
        } finally {
            _islemDevamEdiyor = false;
        }
    }

    // ─── Oturum Durumu ─────────────────────────────────────────

    async function oturumDurumuYukle() {
        try {
            var yanit = await fetch('/api/sayim/oturum-durumu/' + _oturumId);
            var veri = await yanit.json();

            if (!veri.success) {
                el.urunListesi.innerHTML = '<div class="mesaj mesaj-hata">' + (veri.message || 'Hata') + '</div>';
                return;
            }

            // Ozet guncelle
            ozetGuncelle(veri.toplam_cesit, veri.toplam_okuma);

            // QR cache sync
            if (veri.urunler) {
                veri.urunler.forEach(function(u) {
                    if (u.okumalar) {
                        u.okumalar.forEach(function(o) {
                            if (!o.manuel && o.qr_kod) {
                                // Buradan qr_kod gelmiyor (select'te yok), ama cache zaten backend'de
                            }
                        });
                    }
                });
            }

            // Urun listesi render
            if (!veri.urunler || veri.urunler.length === 0) {
                el.urunListesi.innerHTML = '<div class="bos-liste">Hen\u00fcz \u00fcr\u00fcn say\u0131lmad\u0131</div>';
                return;
            }

            el.urunListesi.innerHTML = veri.urunler.map(function(u) {
                var paketHtml = '';
                if (u.qr_okuma_sayisi > 0 && u.paket_detay && u.paket_detay.length > 0) {
                    // Paket detayi goster
                    var paketToplam = u.paket_detay[0]?.paketToplam || 0;
                    if (paketToplam > 0) {
                        var okunanSiralar = {};
                        u.paket_detay.forEach(function(p) {
                            okunanSiralar[p.paketSira] = (okunanSiralar[p.paketSira] || 0) + 1;
                        });
                        var paketler = [];
                        for (var i = 1; i <= paketToplam; i++) {
                            var okundu = okunanSiralar[i] ? true : false;
                            paketler.push('<span class="sayim-paket ' + (okundu ? 'sayim-paket-ok' : 'sayim-paket-bos') + '">P' + i + '</span>');
                        }
                        paketHtml = '<div class="sayim-paket-satir">' + paketler.join(' ') + '</div>';
                    }
                }

                var manuelHtml = '';
                if (u.manuel_adet > 0) {
                    manuelHtml = '<span class="sayim-manuel-badge">M x' + u.manuel_adet + '</span>';
                }

                var silButonlari = '';
                if (u.okumalar && u.okumalar.length > 0) {
                    silButonlari = u.okumalar.map(function(o) {
                        var etiket = o.manuel ? ('x' + (o.adet || 1)) : ('P' + o.paket_sira);
                        return '<button data-action="okumasilBtn" data-okuma-id="' + o.id + '" class="sayim-sil-btn" title="Sil">' + etiket + ' \u2715</button>';
                    }).join(' ');
                }

                return '<div class="sayim-urun-satir">' +
                    '<div class="sayim-urun-bilgi">' +
                        '<div class="sayim-urun-ad">' + u.malzeme_adi + '</div>' +
                        '<div class="sayim-urun-kod">' + u.stok_kod + '</div>' +
                        paketHtml +
                    '</div>' +
                    '<div class="sayim-urun-sag">' +
                        '<div class="sayim-urun-adet">' + u.urun_adedi + ' adet</div>' +
                        manuelHtml +
                    '</div>' +
                    (silButonlari ? '<div class="sayim-sil-satir">' + silButonlari + '</div>' : '') +
                '</div>';
            }).join('');

        } catch (err) {
            el.urunListesi.innerHTML = '<div class="mesaj mesaj-hata">Yukleme hatasi</div>';
        }
    }

    function ozetGuncelle(cesit, okuma) {
        if (el.sayimOzet) {
            el.sayimOzet.textContent = (cesit || 0) + ' \u00e7e\u015fit, ' + (okuma || 0) + ' okuma';
        }
    }

    // ─── Okuma Silme ───────────────────────────────────────────

    async function okumaSil(okumaId) {
        if (!okumaId) return;
        if (!confirm('Bu okumay\u0131 silmek istediginize emin misiniz?')) return;

        try {
            var yanit = await fetch('/api/sayim/okuma-sil/' + okumaId, { method: 'DELETE' });
            var veri = await yanit.json();

            if (!veri.success) {
                bildirimGoster(veri.message || 'Silme hatasi', 'hata');
                return;
            }

            bildirimGoster('Okuma silindi', 'basari');
            oturumDurumuYukle();

        } catch (err) {
            bildirimGoster('Baglanti hatasi: ' + err.message, 'hata');
        }
    }

    // ─── Rapor ─────────────────────────────────────────────────

    async function raporGoster() {
        el.raporAlani.style.display = 'block';
        el.raporAlani.innerHTML = '<div style="text-align:center; padding:20px; color:#666;">Rapor y\u00fckleniyor...</div>';

        try {
            var yanit = await fetch('/api/sayim/rapor/' + _oturumId);
            var veri = await yanit.json();

            if (!veri.success) {
                el.raporAlani.innerHTML = '<div class="mesaj mesaj-hata">' + (veri.message || 'Rapor yuklenemedi') + '</div>';
                return;
            }

            el.raporAlani.innerHTML =
                '<h3 style="margin:0 0 10px 0;">Fark Raporu - ' + veri.lokasyon + '</h3>' +
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
                            '<span style="flex:2; font-size:13px;">' + r.malzeme_adi + '</span>' +
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

    // ─── Sayimi Kapat ──────────────────────────────────────────

    async function sayimiKapat() {
        if (!confirm('Say\u0131m\u0131 kapatmak istedi\u011finize emin misiniz? Kapatt\u0131ktan sonra okuma yap\u0131lamaz.')) return;

        try {
            var yanit = await fetch('/api/sayim/kapat/' + _oturumId, { method: 'POST' });
            var veri = await yanit.json();

            if (!veri.success) {
                bildirimGoster(veri.message || 'Kapatma hatasi', 'hata');
                return;
            }

            bildirimGoster('Say\u0131m ba\u015far\u0131yla kapat\u0131ld\u0131', 'basari');

            // Kamerayi kapat
            if (_barkodOkuyucu) {
                _barkodOkuyucu.destroy();
                _barkodOkuyucu = null;
            }

            // Raporu goster
            raporGoster();

        } catch (err) {
            bildirimGoster('Baglanti hatasi: ' + err.message, 'hata');
        }
    }

    // ─── Yardimcilar ───────────────────────────────────────────

    function bildirimGoster(mesaj, tip) {
        if (window.toast) {
            window.toast(mesaj, tip === 'hata' ? 'error' : (tip === 'uyari' ? 'warning' : 'success'));
        } else {
            alert(mesaj);
        }
    }

    return { mount: mount, unmount: unmount };
})();
