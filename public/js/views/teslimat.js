/**
 * Teslimat View - Fatura se\u00e7im hub sayfas\u0131
 * Kamera kullanmaz, se\u00e7ilen faturay\u0131 /fis/teslimat-okut sayfas\u0131na y\u00f6nlendirir.
 * M\u00fc\u015fteri ileti\u015fim bilgileri (telefon, adres) g\u00f6sterir.
 */
window.Views = window.Views || {};
window.Views['teslimat'] = (function() {
    var el = {};
    var _konteyner = null;
    var _delegeHandler = null;
    var _inputHandler = null;
    var _keypressHandler = null;
    var mevcutFatura = null;

    function htmlOlustur() {
        return '' +
            '<h1 class="baslik">Sat\u0131\u015f / Teslimat Fi\u015fi</h1>' +

            // Fatura secim alani
            '<div id="faturaSecimAlani" class="fatura-secim" style="display:none;">' +
                '<label for="faturaNoInput">Fatura No</label>' +
                '<input type="text" id="faturaNoInput" placeholder="\u00d6rn: 13420">' +
                '<button type="button" class="ara-btn" data-action="faturaAra">Fatura Ara</button>' +
                '<button type="button" class="acik-fatura-btn" data-action="acikFaturalar" id="acikFaturaBtn">A\u00e7\u0131k Faturalar</button>' +
                '<button type="button" class="kapatilan-fatura-btn" data-action="kapatilanFaturalar" id="kapatilanFaturaBtn">Kapat\u0131lan Faturalar</button>' +
                '<div id="acikFaturaListesiInline" style="display:none;">' +
                    '<div id="acikFaturaListesi" class="fatura-liste"></div>' +
                '</div>' +
                '<div id="kapatilanFaturaListesiInline" style="display:none;">' +
                    '<div id="kapatilanFaturaListesi" class="fatura-liste"></div>' +
                '</div>' +
            '</div>' +

            // Fatura bilgileri
            '<div id="faturaBilgiAlani" style="display:none;">' +
                '<div class="fatura-bilgi">' +
                    '<div class="fatura-baslik">' +
                        '<span>Fatura:</span>' +
                        '<span class="fatura-id" id="faturaNoGoster"></span>' +
                        '<span id="riskBakiyeGoster" style="display:none;"></span>' +
                    '</div>' +
                    '<div class="bilgi-grid">' +
                        '<div class="bilgi-satir">' +
                            '<span class="bilgi-etiket">Cari Kodu</span>' +
                            '<span class="bilgi-deger" id="cariKoduGoster">-</span>' +
                        '</div>' +
                        '<div class="bilgi-satir">' +
                            '<span class="bilgi-etiket">Cari Ad\u0131</span>' +
                            '<span class="bilgi-deger" id="cariAdiGoster">-</span>' +
                        '</div>' +
                        '<div class="bilgi-satir">' +
                            '<span class="bilgi-etiket">Tarih</span>' +
                            '<span class="bilgi-deger" id="tarihGoster">-</span>' +
                        '</div>' +
                        '<div class="bilgi-satir">' +
                            '<span class="bilgi-etiket">Sat\u0131\u015f Temsilcisi</span>' +
                            '<span class="bilgi-deger" id="evrakAdiGoster">-</span>' +
                        '</div>' +
                    '</div>' +

                    // Musteri iletisim
                    '<div id="musteriIletisim" style="display:none; margin-top:12px; padding-top:12px; border-top:1px solid #eee;">' +
                        '<div class="bilgi-grid">' +
                            '<div class="bilgi-satir">' +
                                '<span class="bilgi-etiket">Telefon 1</span>' +
                                '<span class="bilgi-deger" id="cepTelGoster" style="color:#2563eb;">-</span>' +
                            '</div>' +
                            '<div class="bilgi-satir">' +
                                '<span class="bilgi-etiket">Telefon 2</span>' +
                                '<span class="bilgi-deger" id="telefonGoster" style="color:#2563eb;">-</span>' +
                            '</div>' +
                            '<div class="bilgi-satir" style="grid-column: 1 / -1;">' +
                                '<span class="bilgi-etiket">Adres</span>' +
                                '<span class="bilgi-deger" id="adresGoster" style="font-size:13px;">-</span>' +
                            '</div>' +
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

    // === Telefon Format ===
    function telFormat(num) {
        if (!num) return null;
        num = num.trim();
        if (num && !num.startsWith('0')) num = '0' + num;
        return num;
    }

    // === Fatura Yukle ===
    async function faturaYukle(faturaNo) {
        yukleniyorGoster();
        hataGizle();

        try {
            var response = await fetch('/api/mikro/fatura/' + encodeURIComponent(faturaNo));
            var data = await response.json();

            if (data.success) {
                mevcutFatura = data.fatura;

                // Bilgileri goster
                el.faturaNoGoster.textContent = mevcutFatura.evrakno_seri
                    ? mevcutFatura.evrakno_seri + '-' + Math.abs(mevcutFatura.evrakno_sira)
                    : Math.abs(mevcutFatura.evrakno_sira);
                el.cariKoduGoster.textContent = mevcutFatura.cari_kodu || '-';
                el.cariAdiGoster.textContent = mevcutFatura.cari_adi || '-';
                el.tarihGoster.textContent = mevcutFatura.tarih ? new Date(mevcutFatura.tarih).toLocaleDateString('tr-TR') : '-';
                el.evrakAdiGoster.textContent = mevcutFatura.plasiyer_kodu || '-';
                el.toplamKalemGoster.textContent = mevcutFatura.toplam_kalem;
                el.toplamPaketGoster.textContent = mevcutFatura.toplam_paket;

                // Okunan paket durumu
                try {
                    var durumResponse = await fetch('/api/mikro/fatura-durumu/' + encodeURIComponent(faturaNo));
                    var durumData = await durumResponse.json();
                    if (durumData.success) {
                        el.toplamPaketGoster.textContent = durumData.okunan_paket + ' / ' + durumData.toplam_paket;
                    }
                } catch (e) { }

                // Risk bakiye bilgisi
                if (mevcutFatura.cari_kodu) {
                    try {
                        var riskResponse = await fetch('/api/stok/risk/' + encodeURIComponent(mevcutFatura.cari_kodu));
                        var riskData = await riskResponse.json();
                        if (riskData.success && riskData.bulundu && riskData.risk) {
                            var riskNum = parseFloat(String(riskData.risk).replace(/[^\d.-]/g, '')) || 0;
                            var riskFormatli = Math.round(riskNum).toLocaleString('tr-TR');
                            el.riskBakiyeGoster.textContent = 'Risk: ' + riskFormatli + '\u20BA';
                            el.riskBakiyeGoster.style.display = 'inline-block';
                            el.riskBakiyeGoster.style.background = '#fee2e2';
                            el.riskBakiyeGoster.style.padding = '4px 12px';
                            el.riskBakiyeGoster.style.borderRadius = '6px';
                            el.riskBakiyeGoster.style.fontSize = '18px';
                            el.riskBakiyeGoster.style.fontWeight = '600';
                            el.riskBakiyeGoster.style.color = '#2c3e50';
                            el.riskBakiyeGoster.style.marginLeft = 'auto';
                        }
                    } catch (e) {
                        // Risk bilgisi alinamadiysa sessizce devam et
                    }
                }

                // Musteri adres/telefon bilgileri
                if (mevcutFatura.cari_kodu) {
                    try {
                        var adresResponse = await fetch('/api/mikro/cari-adres/' + encodeURIComponent(mevcutFatura.cari_kodu));
                        var adresData = await adresResponse.json();
                        if (adresData.success && adresData.adres) {
                            var a = adresData.adres;
                            var tel = telFormat(a.cari_vdaire_adi) || '-';
                            var cepTel = telFormat(a.cari_ceptel) || '-';
                            var adresParts = [a.adr_cadde, a.adr_sokak, a.adr_ilce, a.adr_il].filter(Boolean);
                            var adres = adresParts.length > 0 ? adresParts.join(' ') : '-';

                            // Telefon tiklanabilir
                            if (tel !== '-') {
                                el.telefonGoster.innerHTML = '<a href="tel:' + tel + '" style="color:#2563eb;text-decoration:none;">' + tel + '</a>';
                            } else {
                                el.telefonGoster.textContent = '-';
                            }
                            if (cepTel !== '-') {
                                el.cepTelGoster.innerHTML = '<a href="tel:' + cepTel + '" style="color:#2563eb;text-decoration:none;">' + cepTel + '</a>';
                            } else {
                                el.cepTelGoster.textContent = '-';
                            }

                            // Adres: Google Maps linki
                            if (adres !== '-') {
                                var mapsUrl = 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(adres);
                                el.adresGoster.innerHTML = '<a href="' + mapsUrl + '" target="_blank" style="color:#2563eb;text-decoration:none;">' + adres + ' &#x1F4CD;</a>';
                            } else {
                                el.adresGoster.textContent = '-';
                            }

                            el.musteriIletisim.style.display = 'block';
                        }
                    } catch (e) {
                        // Adres bilgisi alınamadı - sessizce devam et
                    }
                }

                el.faturaSecimAlani.style.display = 'none';
                el.faturaBilgiAlani.style.display = 'block';

                // pushState: yeni entry olustur (geri butonu /fis/teslimat secim ekranina donebilsin)
                // Eger URL zaten bu fatura paramini tasiyorsa tekrar push yapma (back'ten donus)
                if (window.location.search.indexOf('fatura=' + faturaNo) === -1) {
                    history.pushState(null, '', '/fis/teslimat?fatura=' + faturaNo);
                }
            } else {
                hataGoster(data.message || 'Fatura bulunamad\u0131');
                el.faturaSecimAlani.style.display = 'block';
                el.faturaBilgiAlani.style.display = 'none';
            }
        } catch (error) {
            hataGoster('Ba\u011flant\u0131 hatas\u0131: ' + error.message);
            el.faturaSecimAlani.style.display = 'block';
            el.faturaBilgiAlani.style.display = 'none';
        } finally {
            yukleniyorGizle();
        }
    }

    // === Acik Faturalar (inline) ===
    var spinnerSvg = '<svg class="btn-spinner" width="16" height="16" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="3" stroke-opacity="0.3"/><path d="M12 2a10 10 0 0 1 10 10" fill="none" stroke="currentColor" stroke-width="3"/></svg>';

    async function acikFaturalariGoster() {
        // Toggle: aciksa kapat
        if (el.acikFaturaListesiInline.style.display !== 'none') {
            el.acikFaturaListesiInline.style.display = 'none';
            el.acikFaturaBtn.innerHTML = 'A\u00e7\u0131k Faturalar';
            return;
        }

        // Kapatilan listeyi kapat (mutual exclusion)
        el.kapatilanFaturaListesiInline.style.display = 'none';
        el.kapatilanFaturaBtn.innerHTML = 'Kapat\u0131lan Faturalar';

        // Loading state - spinner + text
        el.acikFaturaBtn.disabled = true;
        el.acikFaturaBtn.innerHTML = spinnerSvg + ' A\u00e7\u0131k Faturalar';
        el.acikFaturaListesi.innerHTML = '';
        el.acikFaturaListesiInline.style.display = 'block';

        try {
            var response = await fetch('/api/mikro/acik-faturalar');
            var data = await response.json();

            if (data.success && data.faturalar.length > 0) {
                el.acikFaturaListesi.innerHTML = data.faturalar.map(function(fatura) {
                    var tarih = fatura.tarih ? new Date(fatura.tarih).toLocaleDateString('tr-TR') : '-';
                    var kalemlerHtml = '';
                    if (fatura.kalemler && fatura.kalemler.length > 0) {
                        kalemlerHtml = '<div class="fatura-item-kalemler">' +
                            fatura.kalemler.map(function(k) {
                                return '<div class="kalem-chip">' + k + '</div>';
                            }).join('') +
                        '</div>';
                    }
                    return '<div class="fatura-item" data-action="faturaSecAcik" data-fatura="' + fatura.evrakno_sira + '">' +
                        '<div class="fatura-item-baslik">' + (fatura.cari_adi || '-') + '</div>' +
                        '<div class="fatura-item-alt">' +
                            '<div class="fatura-item-detay">' + fatura.evrakno_sira + ' | ' + tarih + '</div>' +
                            '<div class="fatura-item-kalan">' + fatura.kalan_paket + ' paket kald\u0131 (' + fatura.okunan_paket + '/' + fatura.toplam_paket + ')</div>' +
                        '</div>' +
                        kalemlerHtml +
                    '</div>';
                }).join('');
            } else {
                el.acikFaturaListesi.innerHTML = '<div class="bos-liste">A\u00e7\u0131k fatura bulunamad\u0131</div>';
            }
        } catch (error) {
            el.acikFaturaListesi.innerHTML = '<div class="bos-liste">Hata: ' + error.message + '</div>';
        } finally {
            el.acikFaturaBtn.disabled = false;
            el.acikFaturaBtn.innerHTML = 'A\u00e7\u0131k Faturalar';
        }
    }

    // === Kapatilan Faturalar (inline) ===
    async function kapatilanFaturalariGoster() {
        // Toggle: aciksa kapat
        if (el.kapatilanFaturaListesiInline.style.display !== 'none') {
            el.kapatilanFaturaListesiInline.style.display = 'none';
            el.kapatilanFaturaBtn.innerHTML = 'Kapat\u0131lan Faturalar';
            return;
        }

        // Acik listeyi kapat (mutual exclusion)
        el.acikFaturaListesiInline.style.display = 'none';
        el.acikFaturaBtn.innerHTML = 'A\u00e7\u0131k Faturalar';

        // Loading state - spinner + text
        el.kapatilanFaturaBtn.disabled = true;
        el.kapatilanFaturaBtn.innerHTML = spinnerSvg + ' Kapat\u0131lan Faturalar';
        el.kapatilanFaturaListesi.innerHTML = '';
        el.kapatilanFaturaListesiInline.style.display = 'block';

        try {
            var response = await fetch('/api/mikro/kapatilan-faturalar');
            var data = await response.json();

            if (data.success && data.faturalar.length > 0) {
                el.kapatilanFaturaListesi.innerHTML = data.faturalar.map(function(fatura) {
                    var tarih = fatura.tarih ? new Date(fatura.tarih).toLocaleDateString('tr-TR') : '-';
                    var kalemlerHtml = '';
                    if (fatura.kalemler && fatura.kalemler.length > 0) {
                        kalemlerHtml = '<div class="fatura-item-kalemler">' +
                            fatura.kalemler.map(function(k) {
                                return '<div class="kalem-chip">' + k + '</div>';
                            }).join('') +
                        '</div>';
                    }
                    return '<div class="fatura-item" data-action="faturaSecKapatilan" data-fatura="' + fatura.evrakno_sira + '">' +
                        '<div class="fatura-item-baslik">' + (fatura.cari_adi || '-') + '</div>' +
                        '<div class="fatura-item-alt">' +
                            '<div class="fatura-item-detay">' + fatura.evrakno_sira + ' | ' + tarih + '</div>' +
                            '<div class="fatura-item-kalan" style="color:#27ae60;">Tamamland\u0131 (' + fatura.okunan_paket + '/' + fatura.toplam_paket + ')</div>' +
                        '</div>' +
                        kalemlerHtml +
                    '</div>';
                }).join('');
            } else {
                el.kapatilanFaturaListesi.innerHTML = '<div class="bos-liste">Kapat\u0131lan fatura bulunamad\u0131</div>';
            }
        } catch (error) {
            el.kapatilanFaturaListesi.innerHTML = '<div class="bos-liste">Hata: ' + error.message + '</div>';
        } finally {
            el.kapatilanFaturaBtn.disabled = false;
            el.kapatilanFaturaBtn.innerHTML = 'Kapat\u0131lan Faturalar';
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

        if (!hedef) return;

        var action = hedef.dataset.action;

        switch (action) {
            case 'faturaAra':
                var no = el.faturaNoInput.value.trim();
                if (no) faturaYukle(no);
                else hataGoster('L\u00fctfen fatura numaras\u0131 girin');
                break;
            case 'acikFaturalar':
                acikFaturalariGoster();
                break;
            case 'kapatilanFaturalar':
                kapatilanFaturalariGoster();
                break;
            case 'acikGizle':
                el.acikFaturaListesiInline.style.display = 'none';
                el.acikFaturaBtn.innerHTML = 'A\u00e7\u0131k Faturalar';
                break;
            case 'faturaSecAcik':
                el.acikFaturaListesiInline.style.display = 'none';
                history.replaceState(null, '', '/fis/teslimat?fatura=' + hedef.dataset.fatura);
                AppRouter.git('/fis/teslimat-okut?fatura=' + hedef.dataset.fatura);
                break;
            case 'faturaSecKapatilan':
                el.kapatilanFaturaListesiInline.style.display = 'none';
                history.replaceState(null, '', '/fis/teslimat?fatura=' + hedef.dataset.fatura);
                AppRouter.git('/fis/teslimat-okut?fatura=' + hedef.dataset.fatura);
                break;
            case 'okumayaBasla':
                if (mevcutFatura) {
                    AppRouter.git('/fis/teslimat-okut?fatura=' + mevcutFatura.evrakno_sira);
                }
                break;
        }
    }

    // === Mount ===
    function mount(konteyner, params) {
        _konteyner = konteyner;
        konteyner.innerHTML = htmlOlustur();

        el = {
            faturaSecimAlani:       konteyner.querySelector('#faturaSecimAlani'),
            faturaBilgiAlani:       konteyner.querySelector('#faturaBilgiAlani'),
            faturaNoInput:          konteyner.querySelector('#faturaNoInput'),
            faturaNoGoster:         konteyner.querySelector('#faturaNoGoster'),
            cariKoduGoster:         konteyner.querySelector('#cariKoduGoster'),
            cariAdiGoster:          konteyner.querySelector('#cariAdiGoster'),
            tarihGoster:            konteyner.querySelector('#tarihGoster'),
            evrakAdiGoster:         konteyner.querySelector('#evrakAdiGoster'),
            toplamKalemGoster:      konteyner.querySelector('#toplamKalemGoster'),
            toplamPaketGoster:      konteyner.querySelector('#toplamPaketGoster'),
            musteriIletisim:        konteyner.querySelector('#musteriIletisim'),
            cepTelGoster:           konteyner.querySelector('#cepTelGoster'),
            telefonGoster:          konteyner.querySelector('#telefonGoster'),
            adresGoster:            konteyner.querySelector('#adresGoster'),
            riskBakiyeGoster:       konteyner.querySelector('#riskBakiyeGoster'),
            hataKutusu:             konteyner.querySelector('#hataKutusu'),
            yukleniyorOverlay:      konteyner.querySelector('#yukleniyorOverlay'),
            acikFaturaListesiInline: konteyner.querySelector('#acikFaturaListesiInline'),
            acikFaturaBtn:          konteyner.querySelector('#acikFaturaBtn'),
            acikFaturaListesi:      konteyner.querySelector('#acikFaturaListesi'),
            kapatilanFaturaListesiInline: konteyner.querySelector('#kapatilanFaturaListesiInline'),
            kapatilanFaturaBtn:     konteyner.querySelector('#kapatilanFaturaBtn'),
            kapatilanFaturaListesi: konteyner.querySelector('#kapatilanFaturaListesi')
        };

        // Event delegation
        _delegeHandler = tikIsle;
        konteyner.addEventListener('click', _delegeHandler);

        // 5 haneli sayi girilince otomatik ara
        _inputHandler = function(e) {
            var deger = e.target.value.trim();
            if (/^\d{5}$/.test(deger)) {
                faturaYukle(deger);
            }
        };
        el.faturaNoInput.addEventListener('input', _inputHandler);

        // Enter tusu
        _keypressHandler = function(e) {
            if (e.key === 'Enter') {
                var no = el.faturaNoInput.value.trim();
                if (no) faturaYukle(no);
            }
        };
        el.faturaNoInput.addEventListener('keypress', _keypressHandler);

        // Params kontrolu
        if (params && params.fatura) {
            faturaYukle(params.fatura);
        } else {
            el.faturaSecimAlani.style.display = 'block';
        }
    }

    // === Unmount ===
    function unmount() {
        if (_konteyner && _delegeHandler) {
            _konteyner.removeEventListener('click', _delegeHandler);
        }
        if (el.faturaNoInput) {
            if (_inputHandler) el.faturaNoInput.removeEventListener('input', _inputHandler);
            if (_keypressHandler) el.faturaNoInput.removeEventListener('keypress', _keypressHandler);
        }

        _delegeHandler = null;
        _inputHandler = null;
        _keypressHandler = null;
        _konteyner = null;
        mevcutFatura = null;
        el = {};
    }

    return { mount: mount, unmount: unmount };
})();
