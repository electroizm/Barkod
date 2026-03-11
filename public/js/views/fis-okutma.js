/**
 * Fi\u015f Okutma Factory - Sevk ve Giri\u015f fi\u015fleri i\u00e7in ortak SPA view mod\u00fcl\u00fc.
 * \u0130ki neredeyse ayn\u0131 sayfay\u0131 tek bir factory'den \u00fcretir.
 * Farklar yapilandirma objesiyle parametrize edilir (API prefix, cache key, depo alan\u0131, metinler).
 *
 * Kullanan sayfalar:
 *   - /sevk         (Sevk Fi\u015fi okutma)
 *   - /fis/diger-giris (Giri\u015f Fi\u015fi okutma)
 *
 * Kamera g\u00fcvenli\u011fi: unmount() i\u00e7inde BarkodOkuyucu.destroy() ILK aksiyondur.
 */
// Depo numarasi → kisa ad eslesmesi (sevk fisleri icin)
var DEPO_ADLARI = { 100: 'DEPO', 200: 'SUBE', 300: 'EXC' };

function fisBaslikFormatla(fis, varsayilanEvrakAdi) {
    if (fis.cikis_depo && fis.giris_depo) {
        var cikisAd = DEPO_ADLARI[fis.cikis_depo] || '';
        var girisAd = DEPO_ADLARI[fis.giris_depo] || '';
        return fis.evrakno_sira + ' - ' + fis.cikis_depo + (cikisAd ? ' - ' + cikisAd : '') +
               ' >> ' + fis.giris_depo + (girisAd ? ' - ' + girisAd : '');
    }
    return (fis.evrak_adi || varsayilanEvrakAdi) + ' - ' + fis.evrakno_sira;
}

// Fis detay ekranindaki ozet satiri icin (daha sade: "1947 - DEPO >> EXC")
function fisOzetFormatla(fis) {
    if (fis.cikis_depo && fis.giris_depo) {
        var cikisAd = DEPO_ADLARI[fis.cikis_depo] || fis.cikis_depo;
        var girisAd = DEPO_ADLARI[fis.giris_depo] || fis.giris_depo;
        return fis.evrakno_sira + ' - ' + cikisAd + ' >> ' + girisAd;
    }
    return 'Fi\u015f: ' + fis.evrakno_sira + ' - ' + (fis.evrak_adi || '-');
}

function FisOkutmaOlustur(y) {
    // ═══ State ═══
    var el = {};
    var _konteyner = null;
    var mevcutFis = null;
    var fisNo = null;
    var okumalar = [];
    var barkodOkuyucu = null;

    // Event handler referanslari (cleanup icin)
    var _delegeHandler = null;
    var _fisInputHandler = null;
    var _fisKeypressHandler = null;

    // ═══ Yardimci ═══
    function escAttr(s) {
        return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    var spinnerSvg = '<svg class="btn-spinner" width="16" height="16" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="3" stroke-opacity="0.3"/><path d="M12 2a10 10 0 0 1 10 10" fill="none" stroke="currentColor" stroke-width="3"/></svg>';

    // ═══ HTML Template ═══
    function htmlOlustur() {
        return '' +
            '<h1 class="baslik">' + y.baslik + '</h1>' +

            // DURUM 1: Fis Secim
            '<div id="fisSecimAlani" class="fis-secim" style="display:none;">' +
                '<label for="fisNoInput">Fi\u015f No</label>' +
                '<input type="text" id="fisNoInput" placeholder="\u00d6rn: 185">' +
                '<button type="button" class="ara-btn" data-action="fisAra">' + y.araButonMetni + '</button>' +
                '<button type="button" id="acikFisBtn" class="acik-fis-btn" data-action="acikFisler">' + y.acikFisButonMetni + '</button>' +
                '<button type="button" id="kapatilanFisBtn" class="kapatilan-fis-btn" data-action="kapatilanFisler">' + y.kapatilanFisButonMetni + '</button>' +
                '<div id="acikFisListesiInline" class="fis-liste" style="display:none;margin-top:10px;"></div>' +
                '<div id="kapatilanFisListesiInline" class="fis-liste" style="display:none;margin-top:10px;"></div>' +
            '</div>' +

            // DURUM 2: Okutma
            '<div id="okutmaAlani" style="display:none;">' +
                '<div class="fis-ozet" id="fisOzet">Fi\u015f: -</div>' +

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

                '<div class="son-mesaj gizle" id="sonMesaj"></div>' +

                '<div class="okuma-alani" id="okumaAlani">' +
                    '<div id="barkodOkuyucuAlani"></div>' +
                '</div>' +

                '<div class="tamamlandi-kutu gizle" id="tamamlandiKutu">' +
                    '<h2>Tamamland\u0131!</h2>' +
                    '<p>T\u00fcm paketler ba\u015far\u0131yla okundu.</p>' +
                    '<button type="button" class="yeni-fis-btn" data-action="fisDegistir">Yeni Fi\u015f Se\u00e7</button>' +
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
            '</div>' +

            '<div id="hataKutusu" class="hata-kutu" style="display:none;"></div>' +

            '<div id="yukleniyorOverlay" class="yukleniyor-overlay gizle">' +
                '<div class="spinner"></div>' +
            '</div>';
    }

    // ═══ Frontend Cache ═══
    function getCacheKey() { return y.cachePrefix + fisNo; }

    function frontendCacheYukle() {
        try {
            var data = localStorage.getItem(getCacheKey());
            return data ? new Set(JSON.parse(data)) : new Set();
        } catch (e) { return new Set(); }
    }

    function frontendCacheKaydet(set) {
        try { localStorage.setItem(getCacheKey(), JSON.stringify([...set])); }
        catch (e) { console.warn('Cache kaydetme hatasi:', e); }
    }

    function frontendCacheyeEkle(qrKod) {
        var cache = frontendCacheYukle();
        cache.add(qrKod);
        frontendCacheKaydet(cache);
    }

    function frontendCachedeVarMi(qrKod) {
        return frontendCacheYukle().has(qrKod);
    }

    async function frontendCacheSenkronize() {
        try {
            var response = await fetch(y.apiPrefix + '/okunan-qrler/' + encodeURIComponent(fisNo));
            var data = await response.json();
            if (data.success && data.okunan_qrler) {
                var cache = new Set(data.okunan_qrler);
                frontendCacheKaydet(cache);
                return cache.size;
            }
            return 0;
        } catch (e) {
            console.warn('Cache senkronizasyon hatasi:', e);
            return 0;
        }
    }

    // ═══ Fis Yukle ═══
    async function fisYukle(no) {
        yukleniyorGoster();
        hataGizle();

        try {
            var response = await fetch(y.apiPrefix + '/fis/' + encodeURIComponent(no));
            var data = await response.json();

            if (data.success) {
                mevcutFis = data.fis;
                fisNo = no;

                el.fisOzet.textContent = fisOzetFormatla(mevcutFis);

                el.fisSecimAlani.style.display = 'none';
                el.okutmaAlani.style.display = 'block';

                history.replaceState(null, '', y.sayfaYolu + '?fis=' + no);

                await frontendCacheSenkronize();
                durumGuncelle();

                // Barkod okuyucu baslat
                if (!barkodOkuyucu) {
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
                } else {
                    barkodOkuyucu.odaklan();
                }

            } else {
                hataGoster(data.message || y.bulunamadiMesaji);
                el.fisSecimAlani.style.display = 'block';
                el.okutmaAlani.style.display = 'none';
            }
        } catch (error) {
            hataGoster('Ba\u011flant\u0131 hatas\u0131: ' + error.message);
            el.fisSecimAlani.style.display = 'block';
            el.okutmaAlani.style.display = 'none';
        } finally {
            yukleniyorGizle();
        }
    }

    // ═══ QR Okutma ═══
    async function qrOkut(qrKod) {
        if (!qrKod) return;
        qrKod = qrKod.replace(/[\x00-\x1F\x7F]/g, '').trim();
        if (!qrKod) return;

        // Frontend cache kontrolu
        if (frontendCachedeVarMi(qrKod)) {
            okumaHatali('Bu paket zaten okundu!', 'DUPLICATE_QR');
            SesYoneticisi.sesliGeriBildirim('tekrar');
            return;
        }

        yukleniyorGoster();
        el.okumaAlaniEl.classList.remove('basarili', 'hata');

        try {
            var kullanici = document.getElementById('kullaniciBilgi')?.textContent || 'bilinmiyor';

            var response = await fetch(y.apiPrefix + '/qr-okut', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    fis_no: fisNo,
                    qr_kod: qrKod,
                    kullanici: kullanici
                })
            });

            var data = await response.json();

            if (data.success) {
                frontendCacheyeEkle(qrKod);
                okumaBasarili(data);
                SesYoneticisi.sesliGeriBildirim('basarili');
            } else {
                if (data.hata_tipi === 'DUPLICATE_QR') {
                    frontendCacheyeEkle(qrKod);
                    SesYoneticisi.sesliGeriBildirim('tekrar');
                } else if (data.hata_tipi === 'PAKET_LIMIT_ASILDI') {
                    SesYoneticisi.sesliGeriBildirim('tekrar');
                } else {
                    SesYoneticisi.sesliGeriBildirim('hata');
                }
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
        el.okumaAlaniEl.classList.add('basarili');
        setTimeout(function() { el.okumaAlaniEl.classList.remove('basarili'); }, 300);

        sonMesajGoster(data.message, 'basarili');

        okumalar.unshift({
            basarili: true,
            mesaj: data.eslesen_kalem.malzeme_adi + ' (' + data.paket_bilgi.sira + '/' + data.paket_bilgi.toplam + ')',
            zaman: new Date()
        });
        sonOkumalariGuncelle();
        durumGuncelle();
    }

    function okumaHatali(mesaj, hataTipi) {
        el.okumaAlaniEl.classList.add('hata');
        setTimeout(function() { el.okumaAlaniEl.classList.remove('hata'); }, 300);

        sonMesajGoster(mesaj, 'hata');

        okumalar.unshift({ basarili: false, mesaj: mesaj, zaman: new Date() });
        sonOkumalariGuncelle();
    }

    // ═══ Durum Guncelle ═══
    async function durumGuncelle() {
        try {
            var response = await fetch(y.apiPrefix + '/fis-durumu/' + encodeURIComponent(fisNo));
            var data = await response.json();

            if (data.success) {
                if (data.fis) {
                    el.fisOzet.textContent = fisOzetFormatla(data.fis);
                }

                var yuzde = data.tamamlanma_yuzdesi;
                el.progressFill.style.width = yuzde + '%';
                el.progressText.textContent = yuzde + '%';

                el.okunanPaketGoster.textContent = data.okunan_paket;
                el.kalanPaketGoster.textContent = data.kalan_paket;
                el.toplamPaketGoster.textContent = data.toplam_paket;

                malzemeListesiGuncelle(data.kalemler);

                if (data.kalan_paket === 0 && data.toplam_paket > 0) {
                    tamamlandiGoster();
                }
            }
        } catch (error) {
            console.error('Durum g\u00fcncelleme hatas\u0131:', error);
        }
    }

    // ═══ Malzeme Listesi ═══
    function malzemeDurumSinifi(okunan, toplam) {
        if (okunan === 0) return 'status-gray';
        if (okunan >= toplam) return 'status-green';
        return 'status-yellow';
    }

    function kalemHtmlOlustur(kalem, index) {
        var durumSinifi = malzemeDurumSinifi(kalem.okunan_paket, kalem.beklenen_paket);
        var miktarInt = 1;
        if (kalem.miktar) {
            var miktarStr = String(kalem.miktar).replace(',', '.');
            miktarInt = Math.floor(parseFloat(miktarStr)) || 1;
        }

        var malzemeAdi = escAttr(kalem.malzeme_adi || '-');
        var durumIkon = durumSinifi === 'status-green'
            ? '<span class="malzeme-tik">&#10003;</span>'
            : '<button class="btn-malzeme-oku" data-action="topluOkut" data-kalem-id="' + kalem.id + '" data-malzeme-adi="' + malzemeAdi + '"></button>';

        return '' +
            '<div class="malzeme-item ' + durumSinifi + '" data-kalem-id="' + kalem.id + '" data-index="' + index + '">' +
                '<div class="malzeme-baslik-row" data-action="malzemeToggle" data-index="' + index + '" data-kalem-id="' + kalem.id + '">' +
                    durumIkon +
                    '<div class="malzeme-bilgi">' +
                        '<div class="malzeme-miktar">' + miktarInt + ' - ' + (kalem.malzeme_adi || '-') + '</div>' +
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
            el.malzemeListesiEl.innerHTML = '<p style="text-align:center;color:#888;font-size:13px;">Hen\u00fcz malzeme bilgisi yok</p>';
            return;
        }

        // Depo bazli grupla (yapilandirmadaki depoAlani kullanilir)
        var depoGruplari = {};
        kalemler.forEach(function(kalem) {
            var depo = kalem[y.depoAlani] || '0';
            if (!depoGruplari[depo]) depoGruplari[depo] = [];
            depoGruplari[depo].push(kalem);
        });

        var depoSirali = Object.keys(depoGruplari).sort();
        var globalIndex = 0;

        var html = depoSirali.map(function(depoNo) {
            var depoKalemleri = depoGruplari[depoNo].sort(function(a, b) {
                var durumA = malzemeDurumSinifi(a.okunan_paket, a.beklenen_paket);
                var durumB = malzemeDurumSinifi(b.okunan_paket, b.beklenen_paket);
                var sira = { 'status-yellow': 0, 'status-gray': 1, 'status-green': 2 };
                var durumFark = sira[durumA] - sira[durumB];
                if (durumFark !== 0) return durumFark;
                return (a.malzeme_adi || '').localeCompare(b.malzeme_adi || '', 'tr');
            });

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

            var depoAdi = depoNo === '0' ? 'Genel' : (DEPO_ADLARI[depoNo] || depoNo);

            return '' +
                '<div class="depo-grup">' +
                    '<div class="depo-baslik">' +
                        '<div class="depo-adi">' + depoAdi + '</div>' +
                        '<div class="depo-ozet">' + topKalem + ' Kalem - (' + topOkunan + '/' + topBeklenen + ' Paket)</div>' +
                    '</div>' +
                    '<div class="depo-kalemler">' + kalemlerHtml + '</div>' +
                '</div>';
        }).join('');

        el.malzemeListesiEl.innerHTML = html;
    }

    // Malzeme acilir/kapanir
    async function malzemeToggle(index, kalemId) {
        var detay = document.getElementById('paketDetay' + index);
        var icerik = document.getElementById('paketIcerik' + index);
        if (!detay || !icerik) return;

        if (detay.classList.contains('acik')) {
            detay.classList.remove('acik');
        } else {
            detay.classList.add('acik');
            try {
                icerik.innerHTML = '<div class="paket-yukleniyor">Y\u00fckleniyor...</div>';
                var response = await fetch(y.apiPrefix + '/malzeme-paketler/' + encodeURIComponent(fisNo) + '/' + kalemId);
                var data = await response.json();

                if (data.success && data.paketler) {
                    icerik.innerHTML = data.paketler.map(function(paket) {
                        var paketSinif = 'paket-gray';
                        if (paket.okunan > 0 && paket.okunan < paket.beklenen) paketSinif = 'paket-yellow';
                        if (paket.okunan >= paket.beklenen) paketSinif = 'paket-green';
                        return '<div class="paket-kutu ' + paketSinif + '">' +
                            '<div class="paket-etiket">P' + paket.paket_sira + '</div>' +
                            '<div class="paket-sayi">' + paket.okunan + '</div>' +
                        '</div>';
                    }).join('');
                } else {
                    icerik.innerHTML = '<div class="paket-yukleniyor">Paket bilgisi bulunamad\u0131</div>';
                }
            } catch (error) {
                icerik.innerHTML = '<div class="paket-yukleniyor">Y\u00fcklenemedi</div>';
            }
        }
    }

    function tumunuDaralt() {
        document.querySelectorAll('.paket-detay').forEach(function(d) { d.classList.remove('acik'); });
    }

    async function tumunuGenislet() {
        var items = document.querySelectorAll('.malzeme-item.status-yellow, .malzeme-item.status-gray');
        for (var i = 0; i < items.length; i++) {
            var item = items[i];
            var index = item.dataset.index;
            var kalemId = item.dataset.kalemId;
            var detay = document.getElementById('paketDetay' + index);
            var icerik = document.getElementById('paketIcerik' + index);

            if (!detay || detay.classList.contains('acik')) continue;
            detay.classList.add('acik');

            if (icerik && icerik.querySelector('.paket-yukleniyor')) {
                try {
                    var response = await fetch(y.apiPrefix + '/malzeme-paketler/' + encodeURIComponent(fisNo) + '/' + kalemId);
                    var data = await response.json();
                    if (data.success && data.paketler) {
                        icerik.innerHTML = data.paketler.map(function(paket) {
                            var paketSinif = 'paket-gray';
                            if (paket.okunan > 0 && paket.okunan < paket.beklenen) paketSinif = 'paket-yellow';
                            if (paket.okunan >= paket.beklenen) paketSinif = 'paket-green';
                            return '<div class="paket-kutu ' + paketSinif + '">' +
                                '<div class="paket-etiket">P' + paket.paket_sira + '</div>' +
                                '<div class="paket-sayi">' + paket.okunan + '</div>' +
                            '</div>';
                        }).join('');
                    }
                } catch (e) { }
            }
        }
    }

    // ═══ Toplu Okutma ═══
    async function topluOkut(kalemId, malzemeAdi) {
        if (!kalemId) return;
        if (!confirm('"' + malzemeAdi + '" i\u00e7in eksik paketlerin t\u00fcm\u00fc okunmu\u015f say\u0131ls\u0131n m\u0131?')) return;

        try {
            var kullanici = document.getElementById('kullaniciBilgi')?.textContent || 'bilinmiyor';
            var response = await fetch(y.apiPrefix + '/toplu-okut', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ fis_no: fisNo, kalem_id: kalemId, kullanici: kullanici })
            });
            var data = await response.json();

            if (data.success) {
                sonMesajGoster(data.message, 'basarili');
                SesYoneticisi.sesliGeriBildirim('basarili');
                okumalar.unshift({ basarili: true, mesaj: data.message, zaman: new Date() });
                sonOkumalariGuncelle();
                await frontendCacheSenkronize();
                durumGuncelle();
            } else {
                sonMesajGoster(data.message, 'hata');
                SesYoneticisi.sesliGeriBildirim('hata');
            }
        } catch (error) {
            sonMesajGoster('Ba\u011flant\u0131 hatas\u0131: ' + error.message, 'hata');
            SesYoneticisi.sesliGeriBildirim('hata');
        }
    }

    // ═══ Acik / Kapatilan Fisler Modal ═══
    async function acikFisleriGoster() {
        // Toggle: zaten aciksa kapat
        if (el.acikFisListesiInline.style.display !== 'none') {
            el.acikFisListesiInline.style.display = 'none';
            el.acikFisBtn.innerHTML = y.acikFisButonMetni;
            return;
        }
        // Mutual exclusion: kapatilan listeyi kapat
        el.kapatilanFisListesiInline.style.display = 'none';
        el.kapatilanFisBtn.innerHTML = y.kapatilanFisButonMetni;

        // Loading state - spinner + text
        el.acikFisBtn.disabled = true;
        el.acikFisBtn.innerHTML = spinnerSvg + ' ' + y.acikFisButonMetni;
        el.acikFisListesiInline.innerHTML = '';
        el.acikFisListesiInline.style.display = '';

        try {
            var response = await fetch(y.apiPrefix + '/acik-fisler');
            var data = await response.json();

            if (data.success && data.fisler.length > 0) {
                el.acikFisListesiInline.innerHTML = data.fisler.map(function(fis) {
                    var tarih = fis.tarih ? new Date(fis.tarih).toLocaleDateString('tr-TR') : '-';
                    var kalemlerHtml = (fis.kalemler && fis.kalemler.length > 0)
                        ? fis.kalemler.map(function(k) { return '<span class="kalem-chip">' + escAttr(k) + '</span>'; }).join('')
                        : '';
                    return '<div class="fis-item" data-action="fisSecimAcik" data-fis="' + fis.evrakno_sira + '">' +
                        '<div class="fis-item-baslik">' + fisBaslikFormatla(fis, y.varsayilanEvrakAdi) + '</div>' +
                        '<div class="fatura-item-alt">' +
                            '<div class="fis-item-detay">' + tarih + '</div>' +
                            '<div class="fis-item-kalan">' + fis.kalan_paket + ' paket kald\u0131 (' + fis.okunan_paket + '/' + fis.toplam_paket + ')</div>' +
                        '</div>' +
                        kalemlerHtml +
                    '</div>';
                }).join('');
            } else {
                el.acikFisListesiInline.innerHTML = '<div class="bos-liste">A\u00e7\u0131k fi\u015f bulunamad\u0131</div>';
            }
        } catch (error) {
            el.acikFisListesiInline.innerHTML = '<div class="bos-liste">Hata: ' + error.message + '</div>';
        } finally {
            el.acikFisBtn.disabled = false;
            el.acikFisBtn.innerHTML = y.acikFisButonMetni;
        }
    }

    async function kapatilanFisleriGoster() {
        // Toggle: zaten aciksa kapat
        if (el.kapatilanFisListesiInline.style.display !== 'none') {
            el.kapatilanFisListesiInline.style.display = 'none';
            el.kapatilanFisBtn.innerHTML = y.kapatilanFisButonMetni;
            return;
        }
        // Mutual exclusion: acik listeyi kapat
        el.acikFisListesiInline.style.display = 'none';
        el.acikFisBtn.innerHTML = y.acikFisButonMetni;

        // Loading state - spinner + text
        el.kapatilanFisBtn.disabled = true;
        el.kapatilanFisBtn.innerHTML = spinnerSvg + ' ' + y.kapatilanFisButonMetni;
        el.kapatilanFisListesiInline.innerHTML = '';
        el.kapatilanFisListesiInline.style.display = '';

        try {
            var response = await fetch(y.apiPrefix + '/kapatilan-fisler');
            var data = await response.json();

            if (data.success && data.fisler.length > 0) {
                el.kapatilanFisListesiInline.innerHTML = data.fisler.map(function(fis) {
                    var tarih = fis.tarih ? new Date(fis.tarih).toLocaleDateString('tr-TR') : '-';
                    var kalemlerHtml = (fis.kalemler && fis.kalemler.length > 0)
                        ? fis.kalemler.map(function(k) { return '<span class="kalem-chip">' + escAttr(k) + '</span>'; }).join('')
                        : '';
                    return '<div class="fis-item" data-action="fisSecimKapatilan" data-fis="' + fis.evrakno_sira + '">' +
                        '<div class="fis-item-baslik">' + fisBaslikFormatla(fis, y.varsayilanEvrakAdi) + '</div>' +
                        '<div class="fatura-item-alt">' +
                            '<div class="fis-item-detay">' + tarih + '</div>' +
                            '<div class="fis-item-kalan" style="color:#27ae60;">Tamamland\u0131 (' + fis.okunan_paket + '/' + fis.toplam_paket + ')</div>' +
                        '</div>' +
                        kalemlerHtml +
                    '</div>';
                }).join('');
            } else {
                el.kapatilanFisListesiInline.innerHTML = '<div class="bos-liste">Kapat\u0131lan fi\u015f bulunamad\u0131</div>';
            }
        } catch (error) {
            el.kapatilanFisListesiInline.innerHTML = '<div class="bos-liste">Hata: ' + error.message + '</div>';
        } finally {
            el.kapatilanFisBtn.disabled = false;
            el.kapatilanFisBtn.innerHTML = y.kapatilanFisButonMetni;
        }
    }

    // ═══ Fis Degistir ═══
    function fisDegistir() {
        el.okutmaAlani.style.display = 'none';
        el.fisSecimAlani.style.display = 'block';
        hataGizle();
        mevcutFis = null;
        fisNo = null;
        okumalar = [];
        el.tamamlandiKutu.classList.add('gizle');
        el.okumaAlaniEl.style.display = '';
        el.sonMesaj.classList.add('gizle');
        el.okumaListesi.innerHTML = '';
        el.malzemeListesiEl.innerHTML = '';
        history.replaceState(null, '', y.sayfaYolu);
        el.fisNoInput.value = '';
        el.fisNoInput.focus();
    }

    // ═══ UI Yardimci ═══
    function sonMesajGoster(mesaj, tip) {
        el.sonMesaj.textContent = mesaj;
        el.sonMesaj.className = 'son-mesaj ' + tip;
        el.sonMesaj.classList.remove('gizle');
    }

    function sonOkumalariGuncelle() {
        var sonOnOkuma = okumalar.slice(0, 10);
        el.okumaListesi.innerHTML = sonOnOkuma.map(function(okuma) {
            return '<div class="okuma-item ' + (okuma.basarili ? 'basarili' : 'hata') + '">' +
                '<svg class="okuma-ikon ' + (okuma.basarili ? 'basarili' : 'hata') + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
                    (okuma.basarili
                        ? '<polyline points="20 6 9 17 4 12"/>'
                        : '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>') +
                '</svg>' +
                '<div class="okuma-bilgi">' +
                    '<div class="okuma-urun">' + okuma.mesaj + '</div>' +
                '</div>' +
            '</div>';
        }).join('');
    }

    function tamamlandiGoster() {
        el.tamamlandiKutu.classList.remove('gizle');
        el.okumaAlaniEl.style.display = 'none';
        el.sonMesaj.classList.add('gizle');
        SesYoneticisi.sesliGeriBildirim('tamamlandi');
    }

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

    // ═══ Event Delegation ═══
    function tikIsle(e) {
        var hedef = e.target.closest('[data-action]');
        if (!hedef) return;

        var action = hedef.dataset.action;

        switch (action) {
            case 'fisAra':
                var no = el.fisNoInput.value.trim();
                if (no) fisYukle(no);
                else hataGoster('L\u00fctfen fi\u015f numaras\u0131 girin');
                break;
            case 'acikFisler':
                acikFisleriGoster();
                break;
            case 'kapatilanFisler':
                kapatilanFisleriGoster();
                break;
            case 'fisSecimAcik':
                el.acikFisListesiInline.style.display = 'none';
                fisYukle(hedef.dataset.fis);
                break;
            case 'fisSecimKapatilan':
                el.kapatilanFisListesiInline.style.display = 'none';
                fisYukle(hedef.dataset.fis);
                break;
            case 'fisDegistir':
                fisDegistir();
                break;
            case 'tumunuDaralt':
                tumunuDaralt();
                break;
            case 'tumunuGenislet':
                tumunuGenislet();
                break;
            case 'topluOkut':
                e.stopPropagation();
                topluOkut(parseInt(hedef.dataset.kalemId), hedef.dataset.malzemeAdi);
                break;
            case 'malzemeToggle':
                malzemeToggle(parseInt(hedef.dataset.index), parseInt(hedef.dataset.kalemId));
                break;
        }
    }

    // ═══ Mount ═══
    function mount(konteyner, params) {
        _konteyner = konteyner;
        konteyner.innerHTML = htmlOlustur();

        // DOM referanslari
        el = {
            fisSecimAlani:      konteyner.querySelector('#fisSecimAlani'),
            okutmaAlani:        konteyner.querySelector('#okutmaAlani'),
            fisNoInput:         konteyner.querySelector('#fisNoInput'),
            fisOzet:            konteyner.querySelector('#fisOzet'),
            progressContainer:  konteyner.querySelector('#progressContainer'),
            progressFill:       konteyner.querySelector('#progressFill'),
            progressText:       konteyner.querySelector('#progressText'),
            okunanPaketGoster:  konteyner.querySelector('#okunanPaketGoster'),
            kalanPaketGoster:   konteyner.querySelector('#kalanPaketGoster'),
            toplamPaketGoster:  konteyner.querySelector('#toplamPaketGoster'),
            okumaAlaniEl:       konteyner.querySelector('#okumaAlani'),
            sonMesaj:           konteyner.querySelector('#sonMesaj'),
            tamamlandiKutu:     konteyner.querySelector('#tamamlandiKutu'),
            okumaListesi:       konteyner.querySelector('#okumaListesi'),
            malzemeListesiEl:   konteyner.querySelector('#malzemeListesi'),
            hataKutusu:         konteyner.querySelector('#hataKutusu'),
            yukleniyorOverlay:  konteyner.querySelector('#yukleniyorOverlay'),
            acikFisBtn:              konteyner.querySelector('#acikFisBtn'),
            acikFisListesiInline:    konteyner.querySelector('#acikFisListesiInline'),
            kapatilanFisBtn:         konteyner.querySelector('#kapatilanFisBtn'),
            kapatilanFisListesiInline: konteyner.querySelector('#kapatilanFisListesiInline')
        };

        // Event delegation - tek handler tum butonlar icin
        _delegeHandler = tikIsle;
        konteyner.addEventListener('click', _delegeHandler);

        // Fis no input: otomatik arama (3+ haneli sayi) ve Enter tusu
        _fisInputHandler = function(e) {
            var deger = e.target.value.trim();
            if (/^\d{3,5}$/.test(deger)) {
                fisYukle(deger);
            }
        };
        el.fisNoInput.addEventListener('input', _fisInputHandler);

        _fisKeypressHandler = function(e) {
            if (e.key === 'Enter') {
                var no = el.fisNoInput.value.trim();
                if (no) fisYukle(no);
            }
        };
        el.fisNoInput.addEventListener('keypress', _fisKeypressHandler);

        // Router params: ?fis=123 otomatik olarak params.fis olur
        if (params && params.fis) {
            fisYukle(params.fis);
        } else {
            el.fisSecimAlani.style.display = 'block';
        }
    }

    // ═══ Unmount ═══
    function unmount() {
        // KRITIK: Kamerayi kapat - ILK AKSIYON
        if (barkodOkuyucu) {
            barkodOkuyucu.destroy();
            barkodOkuyucu = null;
        }

        // Event listener temizligi
        if (_konteyner && _delegeHandler) {
            _konteyner.removeEventListener('click', _delegeHandler);
        }
        if (el.fisNoInput) {
            if (_fisInputHandler) el.fisNoInput.removeEventListener('input', _fisInputHandler);
            if (_fisKeypressHandler) el.fisNoInput.removeEventListener('keypress', _fisKeypressHandler);
        }

        // Referanslari sifirla
        _delegeHandler = null;
        _fisInputHandler = null;
        _fisKeypressHandler = null;
        _konteyner = null;
        mevcutFis = null;
        fisNo = null;
        okumalar = [];
        el = {};
    }

    return { mount: mount, unmount: unmount };
}

// ═══════════════════════════════════════════
// View Tanimlari
// ═══════════════════════════════════════════
window.Views = window.Views || {};

window.Views['sevk'] = FisOkutmaOlustur({
    baslik:                'Sevk Fi\u015fi',
    araButonMetni:         'Sevk Fi\u015fi Ara',
    acikFisButonMetni:     'A\u00e7\u0131k Sevk Fi\u015fleri',
    kapatilanFisButonMetni: 'Kapat\u0131lan Sevk Fi\u015fleri',
    acikFisBaslik:         'A\u00e7\u0131k Sevk Fi\u015fleri',
    kapatilanFisBaslik:    'Kapat\u0131lan Sevk Fi\u015fleri',
    varsayilanEvrakAdi:    'Sevk Fi\u015fi',
    bulunamadiMesaji:      'Sevk fi\u015fi bulunamad\u0131',
    apiPrefix:             '/api/sevk',
    cachePrefix:           'sevk_fis_cache_',
    depoAlani:             'cikis_depo',
    sayfaYolu:             '/sevk'
});

window.Views['diger-giris'] = FisOkutmaOlustur({
    baslik:                'Giri\u015f Fi\u015fi',
    araButonMetni:         'Giri\u015f Fi\u015fi Ara',
    acikFisButonMetni:     'A\u00e7\u0131k Fi\u015fler',
    kapatilanFisButonMetni: 'Kapat\u0131lan Fi\u015fler',
    acikFisBaslik:         'A\u00e7\u0131k Fi\u015fler',
    kapatilanFisBaslik:    'Kapat\u0131lan Fi\u015fler',
    varsayilanEvrakAdi:    'Giri\u015f Fi\u015fi',
    bulunamadiMesaji:      'Giri\u015f fi\u015fi bulunamad\u0131',
    apiPrefix:             '/api/giris',
    cachePrefix:           'giris_fis_cache_',
    depoAlani:             'depo',
    sayfaYolu:             '/fis/diger-giris'
});

window.Views['diger-cikis'] = FisOkutmaOlustur({
    baslik:                '\u00c7\u0131k\u0131\u015f Fi\u015fi',
    araButonMetni:         '\u00c7\u0131k\u0131\u015f Fi\u015fi Ara',
    acikFisButonMetni:     'A\u00e7\u0131k Fi\u015fler',
    kapatilanFisButonMetni: 'Kapat\u0131lan Fi\u015fler',
    acikFisBaslik:         'A\u00e7\u0131k Fi\u015fler',
    kapatilanFisBaslik:    'Kapat\u0131lan Fi\u015fler',
    varsayilanEvrakAdi:    '\u00c7\u0131k\u0131\u015f Fi\u015fi',
    bulunamadiMesaji:      '\u00c7\u0131k\u0131\u015f fi\u015fi bulunamad\u0131',
    apiPrefix:             '/api/cikis',
    cachePrefix:           'cikis_fis_cache_',
    depoAlani:             'depo',
    sayfaYolu:             '/fis/diger-cikis'
});
