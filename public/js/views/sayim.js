/**
 * Sayim View - Lokasyon secimi + Acik/Kapatilan sayim listesi
 */
window.Views = window.Views || {};
window.Views.sayim = (function() {
    var el = {};
    var _konteyner = null;
    var _delegeHandler = null;
    var _secilenLokasyon = null;
    var _orijinalGeriHandler = null;

    function mount(konteyner) {
        _konteyner = konteyner;
        _secilenLokasyon = null;

        konteyner.innerHTML =
            '<div id="lokasyonSecimAlani">' +
                '<h1 class="baslik">Say\u0131m</h1>' +
                '<div class="sayim-lokasyon-grid">' +
                    '<button class="sayim-lokasyon-btn" data-action="lokasyon" data-lokasyon="DEPO">' +
                        '<div class="sayim-lokasyon-ad">DEPO</div>' +
                    '</button>' +
                    '<button class="sayim-lokasyon-btn" data-action="lokasyon" data-lokasyon="EXC">' +
                        '<div class="sayim-lokasyon-ad">EXC</div>' +
                    '</button>' +
                    '<button class="sayim-lokasyon-btn" data-action="lokasyon" data-lokasyon="SUBE">' +
                        '<div class="sayim-lokasyon-ad">\u015eUBE</div>' +
                    '</button>' +
                '</div>' +
            '</div>' +

            '<div id="oturumListeAlani" style="display:none;">' +
                '<button data-action="yeniSayim" class="buton buton-basari" style="margin-bottom:20px;">+ Yeni Say\u0131m Ba\u015flat</button>' +
                '<button data-action="acikListeToggle" id="acikSayimlarBtn" class="buton" style="margin-bottom:8px;">A\u00e7\u0131k Say\u0131mlar</button>' +
                '<div id="acikSayimlarListe" style="display:none;"></div>' +
                '<button data-action="kapatilanListeToggle" id="kapatilanSayimlarBtn" class="buton" style="margin-bottom:8px; background-color:#95a5a6;">Kapat\u0131lan Say\u0131mlar</button>' +
                '<div id="kapatilanSayimlarListe" style="display:none;"></div>' +
            '</div>';

        el.lokasyonSecim = konteyner.querySelector('#lokasyonSecimAlani');
        el.oturumListe = konteyner.querySelector('#oturumListeAlani');
        el.acikBtn = konteyner.querySelector('#acikSayimlarBtn');
        el.acikListe = konteyner.querySelector('#acikSayimlarListe');
        el.kapatilanBtn = konteyner.querySelector('#kapatilanSayimlarBtn');
        el.kapatilanListe = konteyner.querySelector('#kapatilanSayimlarListe');

        _delegeHandler = tikIsle;
        konteyner.addEventListener('click', _delegeHandler);
    }

    function unmount() {
        // Shell geri butonunu eski haline dondur
        geriButonuSifirla();

        if (_delegeHandler && _konteyner) {
            _konteyner.removeEventListener('click', _delegeHandler);
        }
        _delegeHandler = null;
        _konteyner = null;
        _secilenLokasyon = null;
        el = {};
    }

    function tikIsle(e) {
        var hedef = e.target.closest('[data-action]');
        if (!hedef) return;

        var action = hedef.dataset.action;
        switch (action) {
            case 'lokasyon':
                lokasyonSec(hedef.dataset.lokasyon);
                break;
            case 'yeniSayim':
                yeniSayimBaslat();
                break;
            case 'acikListeToggle':
                acikSayimlariToggle();
                break;
            case 'kapatilanListeToggle':
                kapatilanSayimlariToggle();
                break;
            case 'sayimAc':
                sayimaGit(hedef.dataset.sayimKodu);
                break;
            case 'sayimRapor':
                e.stopPropagation();
                sayimRaporuGoster(hedef.dataset.sayimKodu);
                break;
            case 'sayimCsv':
                e.stopPropagation();
                window.open('/api/sayim/csv-indir/' + hedef.dataset.sayimKodu, '_blank');
                break;
        }
    }

    function lokasyonSec(lokasyon) {
        _secilenLokasyon = lokasyon;
        el.lokasyonSecim.style.display = 'none';
        el.oturumListe.style.display = 'block';
        el.acikListe.style.display = 'none';
        el.kapatilanListe.style.display = 'none';

        // Shell geri butonunu override et: lokasyon secimine geri don
        geriButonuOverride();

        acikSayimlariToggle();
    }

    function lokasyonSecimeGeri() {
        _secilenLokasyon = null;
        el.lokasyonSecim.style.display = 'block';
        el.oturumListe.style.display = 'none';
        el.acikListe.style.display = 'none';
        el.acikListe.innerHTML = '';
        el.kapatilanListe.style.display = 'none';
        el.kapatilanListe.innerHTML = '';

        // Shell geri butonunu eski haline dondur (anasayfaya gider)
        geriButonuSifirla();
    }

    // Shell geri buton yonetimi
    function geriButonuOverride() {
        var geriBtn = document.getElementById('geriBtn');
        if (!geriBtn) return;
        // Mevcut handler'i sakla
        _orijinalGeriHandler = geriBtn.onclick;
        geriBtn.onclick = function(e) {
            e.preventDefault();
            lokasyonSecimeGeri();
        };
    }

    function geriButonuSifirla() {
        var geriBtn = document.getElementById('geriBtn');
        if (!geriBtn) return;
        if (_orijinalGeriHandler) {
            geriBtn.onclick = _orijinalGeriHandler;
            _orijinalGeriHandler = null;
        }
    }

    async function yeniSayimBaslat() {
        if (!_secilenLokasyon) return;
        try {
            var yanit = await fetch('/api/sayim/oturum-olustur', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ lokasyon: _secilenLokasyon })
            });
            var veri = await yanit.json();
            if (!veri.success) {
                bildirimGoster(veri.message || 'Oturum olusturulamadi', 'hata');
                return;
            }
            sayimaGit(veri.sayim_kodu);
        } catch (err) {
            bildirimGoster('Baglanti hatasi: ' + err.message, 'hata');
        }
    }

    function sayimaGit(sayimKodu) {
        if (window.AppRouter) {
            window.AppRouter.git('/sayim/okut?oturum=' + sayimKodu + '&lokasyon=' + _secilenLokasyon);
        }
    }

    async function acikSayimlariToggle() {
        if (!_secilenLokasyon) return;
        if (el.acikListe.style.display !== 'none' && el.acikListe.innerHTML !== '') {
            el.acikListe.style.display = 'none';
            return;
        }
        el.kapatilanListe.style.display = 'none';
        el.acikListe.style.display = 'block';
        el.acikListe.innerHTML = '<div style="text-align:center; padding:15px; color:#666;">Y\u00fckleniyor...</div>';
        el.acikBtn.disabled = true;
        try {
            var yanit = await fetch('/api/sayim/acik-sayimlar/' + _secilenLokasyon);
            var veri = await yanit.json();
            if (!veri.success) {
                el.acikListe.innerHTML = '<div class="mesaj mesaj-hata">' + (veri.message || 'Hata') + '</div>';
                return;
            }
            if (!veri.sayimlar || veri.sayimlar.length === 0) {
                el.acikListe.innerHTML = '<div style="text-align:center; padding:15px; color:#999;">A\u00e7\u0131k say\u0131m yok</div>';
                return;
            }
            el.acikListe.innerHTML = veri.sayimlar.map(function(s) {
                var kod = s.sayim_kodu || s.id.substring(0, 8);
                return '<div class="sayim-item sayim-item-acik" data-action="sayimAc" data-sayim-kodu="' + (s.sayim_kodu || s.id) + '">' +
                    '<div class="sayim-item-tarih">' + kod + '</div>' +
                    '<div class="sayim-item-detay">' + (s.toplam_cesit || 0) + ' \u00e7e\u015fit, ' + (s.toplam_adet || 0) + ' okuma - ' + (s.kullanici || '') + '</div>' +
                '</div>';
            }).join('');
        } catch (err) {
            el.acikListe.innerHTML = '<div class="mesaj mesaj-hata">Baglanti hatasi</div>';
        } finally {
            el.acikBtn.disabled = false;
        }
    }

    async function kapatilanSayimlariToggle() {
        if (!_secilenLokasyon) return;
        if (el.kapatilanListe.style.display !== 'none' && el.kapatilanListe.innerHTML !== '') {
            el.kapatilanListe.style.display = 'none';
            return;
        }
        el.acikListe.style.display = 'none';
        el.kapatilanListe.style.display = 'block';
        el.kapatilanListe.innerHTML = '<div style="text-align:center; padding:15px; color:#666;">Y\u00fckleniyor...</div>';
        el.kapatilanBtn.disabled = true;
        try {
            var yanit = await fetch('/api/sayim/kapatilan-sayimlar/' + _secilenLokasyon);
            var veri = await yanit.json();
            if (!veri.success) {
                el.kapatilanListe.innerHTML = '<div class="mesaj mesaj-hata">' + (veri.message || 'Hata') + '</div>';
                return;
            }
            if (!veri.sayimlar || veri.sayimlar.length === 0) {
                el.kapatilanListe.innerHTML = '<div style="text-align:center; padding:15px; color:#999;">Kapat\u0131lan say\u0131m yok</div>';
                return;
            }
            el.kapatilanListe.innerHTML = veri.sayimlar.map(function(s) {
                var kod = s.sayim_kodu || s.id.substring(0, 8);
                return '<div class="sayim-item sayim-item-kapatilan">' +
                    '<div class="sayim-item-tarih">' + kod + ' - ' + (s.kullanici || '') + '</div>' +
                    '<div class="sayim-item-detay">' + (s.toplam_cesit || 0) + ' \u00e7e\u015fit, ' + (s.toplam_adet || 0) + ' okuma</div>' +
                    '<div class="sayim-item-butonlar">' +
                        '<button data-action="sayimRapor" data-sayim-kodu="' + (s.sayim_kodu || s.id) + '" class="sayim-mini-btn sayim-mini-rapor">Rapor</button>' +
                        '<button data-action="sayimCsv" data-sayim-kodu="' + (s.sayim_kodu || s.id) + '" class="sayim-mini-btn sayim-mini-csv">CSV \u0130ndir</button>' +
                    '</div>' +
                '</div>';
            }).join('');
        } catch (err) {
            el.kapatilanListe.innerHTML = '<div class="mesaj mesaj-hata">Baglanti hatasi</div>';
        } finally {
            el.kapatilanBtn.disabled = false;
        }
    }

    async function sayimRaporuGoster(sayimKodu) {
        try {
            var yanit = await fetch('/api/sayim/rapor/' + sayimKodu);
            var veri = await yanit.json();
            if (!veri.success) {
                bildirimGoster(veri.message || 'Rapor yuklenemedi', 'hata');
                return;
            }
            var modal = document.createElement('div');
            modal.className = 'sayim-rapor-modal';
            modal.innerHTML =
                '<div class="sayim-rapor-icerik">' +
                    '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px;">' +
                        '<h3 style="margin:0;">Fark Raporu - ' + veri.lokasyon + '</h3>' +
                        '<button class="sayim-rapor-kapat">\u2715</button>' +
                    '</div>' +
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
                    '<button data-action="sayimCsv" data-sayim-kodu="' + sayimKodu + '" class="buton" style="margin-top:15px;">CSV \u0130ndir</button>' +
                '</div>';

            document.body.appendChild(modal);
            modal.querySelector('.sayim-rapor-kapat').addEventListener('click', function() {
                document.body.removeChild(modal);
            });
            modal.addEventListener('click', function(e) {
                if (e.target === modal) document.body.removeChild(modal);
            });
        } catch (err) {
            bildirimGoster('Rapor yuklenemedi: ' + err.message, 'hata');
        }
    }

    function bildirimGoster(mesaj, tip) {
        if (window.toast) {
            window.toast(mesaj, tip === 'hata' ? 'error' : 'success');
        } else {
            alert(mesaj);
        }
    }

    return { mount: mount, unmount: unmount };
})();
