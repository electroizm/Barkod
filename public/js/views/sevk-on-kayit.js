/**
 * Sevk Ön Kayıt View
 * Akış: 1) Grup seç (DEPO→EXC / DEPO→ŞUBE)  2) Barkod/Manuel okut  3) CSV indir
 * Veriler: sevk_on_kayit tablosu (on_kayit_okumalar'dan bağımsız)
 */
window.Views = window.Views || {};
window.Views['sevk-on-kayit'] = (function() {

    var _konteyner = null;
    var _delegeHandler = null;
    var _aramaHandler = null;
    var _enterHandler = null;
    var barkodOkuyucu = null;
    var aramaZamanlayici = null;
    var mesajZamanlayici = null;
    var okunanQrler = new Set();
    var islemDevamEdiyor = false;

    // Seçili hedef grup: null = henüz seçilmedi, '300' = EXC, '200' = ŞUBE
    var aktifDepo = null;
    // Görüntülenen grup sekmesi
    var aktifGrupTab = '300';

    var GRUPLAR = [
        { depo: '300', ad: 'DEPO \u2192 EXC',  dosyaAdi: 'DEPO -> EXC.csv' },
        { depo: '200', ad: 'DEPO \u2192 \u015eUBE', dosyaAdi: 'DEPO -> SUBE.csv' }
    ];

    function escAttr(s) {
        return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }
    function kullaniciAl() {
        return document.getElementById('kullaniciBilgi')?.textContent || 'bilinmiyor';
    }

    // ─── HTML ────────────────────────────────────────────────
    function htmlOlustur() {
        var grupBtnHtml = GRUPLAR.map(function(g) {
            return '<button type="button" class="hedef-btn" data-action="hedefSec" data-depo="' + g.depo + '">' +
                g.ad + '</button>';
        }).join('');

        var grupTabHtml = GRUPLAR.map(function(g) {
            return '<button type="button" class="tab-btn grup-tab' + (g.depo === aktifGrupTab ? ' aktif' : '') +
                '" data-action="grupTabDegistir" data-depo="' + g.depo + '">' + g.ad + '</button>' +
                '<button type="button" class="csv-btn" data-action="csvIndir" data-depo="' + g.depo + '">.csv</button>';
        }).join('');

        return '' +
            '<h1 class="baslik">Sevk \u00d6n Kay\u0131t</h1>' +
            '<div id="sonucMesaj" style="display:none;"></div>' +

            // ── 1) Hedef seçim ──
            '<div id="hedefSecimAlani">' +
                '<p style="font-size:15px;font-weight:600;margin:0 0 12px;">Okutma yap\u0131lacak hedefi se\u00e7in:</p>' +
                '<div style="display:flex;gap:12px;flex-wrap:wrap;">' + grupBtnHtml + '</div>' +
            '</div>' +

            // ── 2) Tarama alanı (hedef seçilmeden gizli) ──
            '<div id="taramaAlani" style="display:none;">' +

                '<div id="aktifHedefBilgi" style="margin-bottom:12px;padding:10px 14px;' +
                    'background:#e8f5e9;border-radius:8px;font-weight:600;font-size:15px;">' +
                '</div>' +

                '<div class="tab-container">' +
                    '<button type="button" class="tab-btn aktif" data-action="tabDegistir" data-tab="barkod">Barkod Okutma</button>' +
                    '<button type="button" class="tab-btn" data-action="tabDegistir" data-tab="manuel">Manuel Okutma</button>' +
                '</div>' +
                '<div class="tab-icerik aktif" id="tab-barkod">' +
                    '<div class="okuma-alani" id="barkodOkuyucuAlani"></div>' +
                '</div>' +
                '<div class="tab-icerik" id="tab-manuel">' +
                    '<input type="text" class="arama-input" id="aramaInput" placeholder="Malzeme ad\u0131 veya stok kodu...">' +
                    '<div class="arama-sonuc" id="aramaSonuc"></div>' +
                '</div>' +

                '<button type="button" class="buton buton-ikincil" data-action="hedefDegistir" ' +
                    'style="margin-top:14px;font-size:14px;">Hedef De\u011fi\u015ftir</button>' +
            '</div>' +

            // ── 3) Grup listeleri + CSV ──
            '<div style="margin-top:20px;">' +
                '<div class="tab-container" style="display:flex;align-items:center;gap:4px;flex-wrap:wrap;">' +
                    grupTabHtml +
                '</div>' +
                '<div id="grupIcerik" style="margin-top:10px;"></div>' +
            '</div>';
    }

    // ─── Mesaj ───────────────────────────────────────────────
    function mesajGoster(mesaj, tip) {
        var el = document.getElementById('sonucMesaj');
        if (!el) return;
        if (mesajZamanlayici) clearTimeout(mesajZamanlayici);
        el.textContent = mesaj;
        var gorunumTip = tip === 'tekrar' ? 'hata' : tip;
        el.className = 'sonuc-mesaj' + (gorunumTip ? ' ' + gorunumTip : '');
        el.style.display = 'block';
        if (tip === 'basari') {
            if (window.SesYoneticisi) SesYoneticisi.sesliGeriBildirim('basarili');
            mesajZamanlayici = setTimeout(function() { el.style.display = 'none'; }, 4000);
        } else if (tip === 'hata' || tip === 'tekrar') {
            if (window.SesYoneticisi) SesYoneticisi.sesliGeriBildirim(tip === 'tekrar' ? 'tekrar' : 'hata');
        }
    }

    // ─── Hedef Seçimi ────────────────────────────────────────
    function hedefSec(depo) {
        aktifDepo = depo;
        aktifGrupTab = depo;

        var grup = GRUPLAR.find(function(g) { return g.depo === depo; });
        var hedefBilgi = document.getElementById('aktifHedefBilgi');
        if (hedefBilgi && grup) hedefBilgi.textContent = '\u2192 Hedef: ' + grup.ad;

        var hedefAlani = document.getElementById('hedefSecimAlani');
        var taramaAlani = document.getElementById('taramaAlani');
        if (hedefAlani) hedefAlani.style.display = 'none';
        if (taramaAlani) taramaAlani.style.display = 'block';

        // Grup sekmesini senkronize et
        if (_konteyner) {
            _konteyner.querySelectorAll('.grup-tab').forEach(function(b) {
                b.classList.toggle('aktif', b.dataset.depo === depo);
            });
        }

        // Barkod okuyucuyu başlat
        if (!barkodOkuyucu) {
            var barkodAlani = document.getElementById('barkodOkuyucuAlani');
            if (barkodAlani && window.BarkodOkuyucu) {
                barkodOkuyucu = new BarkodOkuyucu(barkodAlani, function(kod) {
                    barkodOkut(kod);
                });
            }
        }

        grupIcerikGoster();
    }

    function hedefDegistir() {
        // Taramayı durdur, hedef seçim ekranına dön
        if (barkodOkuyucu) { barkodOkuyucu.destroy(); barkodOkuyucu = null; }
        aktifDepo = null;
        var hedefAlani = document.getElementById('hedefSecimAlani');
        var taramaAlani = document.getElementById('taramaAlani');
        if (hedefAlani) hedefAlani.style.display = 'block';
        if (taramaAlani) taramaAlani.style.display = 'none';
    }

    // ─── Okutma Tab ──────────────────────────────────────────
    function tabDegistir(tabAdi) {
        if (!_konteyner) return;
        _konteyner.querySelectorAll('.tab-btn:not(.grup-tab)').forEach(function(b) { b.classList.remove('aktif'); });
        _konteyner.querySelectorAll('.tab-icerik').forEach(function(t) { t.classList.remove('aktif'); });
        var aktifBtn = _konteyner.querySelector('.tab-btn[data-tab="' + tabAdi + '"]');
        var aktifIcerik = document.getElementById('tab-' + tabAdi);
        if (aktifBtn) aktifBtn.classList.add('aktif');
        if (aktifIcerik) aktifIcerik.classList.add('aktif');
        if (tabAdi === 'barkod' && barkodOkuyucu) barkodOkuyucu.odaklan();
    }

    // ─── Grup Tab ────────────────────────────────────────────
    function grupTabDegistir(depo) {
        aktifGrupTab = depo;
        if (_konteyner) {
            _konteyner.querySelectorAll('.grup-tab').forEach(function(b) {
                b.classList.toggle('aktif', b.dataset.depo === depo);
            });
        }
        grupIcerikGoster();
    }

    // ─── Barkod Okutma ───────────────────────────────────────
    async function barkodOkut(qrKod) {
        if (!qrKod || !qrKod.trim()) return;
        qrKod = qrKod.replace(/[\x00-\x1F\x7F]/g, '').trim();
        if (!qrKod || !aktifDepo) return;
        if (islemDevamEdiyor) return;

        if (okunanQrler.has(qrKod)) {
            mesajGoster('Bu barkod zaten okutuldu!', 'tekrar');
            if (barkodOkuyucu) barkodOkuyucu.odaklan();
            return;
        }

        islemDevamEdiyor = true;
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

            var kayitResponse = await fetch('/api/mikro/sevk-on-kayit-okuma-kaydet', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    stok_kod: bilgi.stok_kod,
                    malzeme_adi: bilgi.malzeme_adi,
                    product_desc: bilgi.product_desc,
                    paket_sayisi: bilgi.paket_sayisi,
                    paket_sira: bilgi.paket_sira,
                    qr_kod: bilgi.qr_kod_normalized || qrKod,
                    kullanici: kullaniciAl(),
                    depo: aktifDepo
                })
            });
            var kayit = await kayitResponse.json();

            if (kayit.success) {
                okunanQrler.add(qrKod);
                mesajGoster(bilgi.malzeme_adi + ' P' + bilgi.paket_sira + '/' + bilgi.paket_sayisi, 'basari');
                grupIcerikGoster();
            } else {
                mesajGoster(kayit.message, 'hata');
            }
        } catch (error) {
            mesajGoster('Ba\u011flant\u0131 hatas\u0131: ' + error.message, 'hata');
        } finally {
            islemDevamEdiyor = false;
        }

        if (barkodOkuyucu) barkodOkuyucu.odaklan();
    }

    // ─── Manuel Arama ────────────────────────────────────────
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
                sonucEl.innerHTML = '<div class="bos-mesaj">Sonuç bulunamadı.</div>';
                return;
            }
            sonucEl.innerHTML = data.sonuclar.slice(0, 20).map(function(kayit) {
                var malzemeAdi = kayit['Malzeme Adi'] || kayit['Malzeme Ad\u0131'] || '-';
                var stokKod = kayit['SAP Kodu'] || Object.values(kayit)[0] || '';
                return '<div class="arama-item" data-action="manuelSec" data-stok-kod="' + escAttr(stokKod) +
                    '" data-malzeme-adi="' + escAttr(malzemeAdi) + '">' +
                    '<div class="arama-item-adi">' + malzemeAdi + '</div>' +
                    '<div class="arama-item-kod">' + stokKod + '</div>' +
                '</div>';
            }).join('');
        } catch (error) {
            sonucEl.innerHTML = '<div class="bos-mesaj">Hata: ' + error.message + '</div>';
        }
    }

    async function manuelOkut(stokKod, malzemeAdi) {
        if (!aktifDepo) { mesajGoster('Önce hedef grup seçin', 'hata'); return; }
        mesajGoster('Paket bilgisi alınıyor...', '');
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

            var response = await fetch('/api/mikro/sevk-on-kayit-manuel-okuma', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    stok_kod: stokKod,
                    malzeme_adi: malzemeAdi,
                    product_desc: productDesc,
                    paket_sayisi: paketSayisi,
                    kullanici: kullaniciAl(),
                    depo: aktifDepo
                })
            });
            var data = await response.json();
            if (data.success) {
                mesajGoster(data.message, 'basari');
                var aramaInput = document.getElementById('aramaInput');
                var aramaSonuc = document.getElementById('aramaSonuc');
                if (aramaInput) aramaInput.value = '';
                if (aramaSonuc) aramaSonuc.innerHTML = '';
                grupIcerikGoster();
            } else {
                mesajGoster(data.message, 'hata');
            }
        } catch (error) {
            mesajGoster('Hata: ' + error.message, 'hata');
        }
    }

    // ─── Grup İçerik ─────────────────────────────────────────
    async function grupIcerikGoster() {
        var icerikEl = document.getElementById('grupIcerik');
        if (!icerikEl) return;

        try {
            var response = await fetch('/api/mikro/sevk-on-kayit-bekleyenler');
            var data = await response.json();
            var tumOkumalar = (data.success ? data.okumalar : []) || [];

            // Grup sekmesi sayılarını güncelle
            GRUPLAR.forEach(function(g) {
                var sayac = tumOkumalar.filter(function(o) { return String(o.depo) === g.depo; }).length;
                var btn = _konteyner && _konteyner.querySelector('.grup-tab[data-depo="' + g.depo + '"]');
                if (btn) btn.textContent = g.ad + (sayac > 0 ? ' (' + sayac + ')' : '');
            });

            var filtrelenmis = tumOkumalar.filter(function(o) {
                return String(o.depo) === aktifGrupTab;
            });

            if (filtrelenmis.length === 0) {
                icerikEl.innerHTML = '<div class="bos-mesaj">Bu grupta kayıt yok.</div>';
                return;
            }

            // Malzeme koduna göre grupla
            var gruplu = {};
            filtrelenmis.forEach(function(o) {
                var key = o.stok_kod || '';
                if (!gruplu[key]) {
                    gruplu[key] = { malzeme_adi: o.malzeme_adi || key, stok_kod: key, adet: 0, idler: [] };
                }
                gruplu[key].adet++;
                gruplu[key].idler.push(o.id);
            });

            var html = '<table style="width:100%;border-collapse:collapse;font-size:14px;">' +
                '<thead><tr>' +
                    '<th style="text-align:left;padding:6px 8px;border-bottom:2px solid #ddd;">Malzeme Ad\u0131</th>' +
                    '<th style="text-align:left;padding:6px 8px;border-bottom:2px solid #ddd;">Malzeme Kodu</th>' +
                    '<th style="text-align:center;padding:6px 8px;border-bottom:2px solid #ddd;">Adet</th>' +
                    '<th style="padding:6px 8px;border-bottom:2px solid #ddd;"></th>' +
                '</tr></thead><tbody>';

            Object.values(gruplu).forEach(function(m) {
                html += '<tr>' +
                    '<td style="padding:6px 8px;border-bottom:1px solid #eee;">' + escAttr(m.malzeme_adi) + '</td>' +
                    '<td style="padding:6px 8px;border-bottom:1px solid #eee;font-family:monospace;">' + escAttr(m.stok_kod) + '</td>' +
                    '<td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:center;font-weight:bold;">' + m.adet + '</td>' +
                    '<td style="padding:4px 8px;border-bottom:1px solid #eee;">' +
                        '<button type="button" class="sil-btn" data-action="grupSil" data-stok-kod="' + escAttr(m.stok_kod) +
                            '" style="font-size:12px;padding:3px 8px;">Sil</button>' +
                    '</td>' +
                '</tr>';
            });

            html += '</tbody></table>';
            icerikEl.innerHTML = html;

        } catch (error) {
            icerikEl.innerHTML = '<div class="bos-mesaj">Yükleme hatası: ' + error.message + '</div>';
        }
    }

    // ─── Grup Sil (stok koduna ait tüm satırlar) ─────────────
    async function grupSil(stokKod) {
        if (!confirm('"' + stokKod + '" kodlu tüm kayıtlar silinsin mi?')) return;
        try {
            // Tüm id'leri çek, tek tek sil
            var response = await fetch('/api/mikro/sevk-on-kayit-bekleyenler');
            var data = await response.json();
            var hedefler = (data.okumalar || []).filter(function(o) { return o.stok_kod === stokKod; });
            await Promise.all(hedefler.map(function(o) {
                return fetch('/api/mikro/sevk-on-kayit-okuma/' + o.id, { method: 'DELETE' });
            }));
            grupIcerikGoster();
        } catch (e) {
            mesajGoster('Silme hatası: ' + e.message, 'hata');
        }
    }

    // ─── CSV İndir ───────────────────────────────────────────
    async function csvIndir(depo) {
        var grup = GRUPLAR.find(function(g) { return g.depo === depo; });
        if (!grup) return;
        try {
            var response = await fetch('/api/mikro/sevk-on-kayit-bekleyenler');
            var data = await response.json();
            var okumalar = (data.success ? data.okumalar : []) || [];
            var filtrelenmis = okumalar.filter(function(o) { return String(o.depo) === depo; });
            if (filtrelenmis.length === 0) {
                mesajGoster('Bu grupta indirilecek kayıt yok.', 'hata');
                return;
            }
            var gruplu = {};
            filtrelenmis.forEach(function(o) {
                var key = o.stok_kod || '';
                if (!gruplu[key]) gruplu[key] = 0;
                gruplu[key]++;
            });
            // Başlık yok, malzeme kodu + "-0" suffix, tırnaksız
            var satirlar = [];
            Object.keys(gruplu).sort().forEach(function(stokKod) {
                satirlar.push(stokKod + '-0;' + gruplu[stokKod]);
            });
            var csvIcerik = '\uFEFF' + satirlar.join('\r\n');
            var blob = new Blob([csvIcerik], { type: 'text/csv;charset=utf-8;' });
            var url = URL.createObjectURL(blob);
            var a = document.createElement('a');
            a.href = url;
            a.download = grup.dosyaAdi;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            mesajGoster(grup.dosyaAdi + ' indirildi (' + Object.keys(gruplu).length + ' çeşit)', 'basari');
        } catch (error) {
            mesajGoster('CSV hatası: ' + error.message, 'hata');
        }
    }

    // ─── Event Delegation ────────────────────────────────────
    function tikIsle(e) {
        var hedef = e.target.closest('[data-action]');
        if (!hedef) return;
        var aksiyon = hedef.dataset.action;
        if      (aksiyon === 'hedefSec')       hedefSec(hedef.dataset.depo);
        else if (aksiyon === 'hedefDegistir')  hedefDegistir();
        else if (aksiyon === 'tabDegistir')    tabDegistir(hedef.dataset.tab);
        else if (aksiyon === 'grupTabDegistir') grupTabDegistir(hedef.dataset.depo);
        else if (aksiyon === 'csvIndir')       csvIndir(hedef.dataset.depo);
        else if (aksiyon === 'manuelSec')      manuelOkut(hedef.dataset.stokKod, hedef.dataset.malzemeAdi);
        else if (aksiyon === 'grupSil')        grupSil(hedef.dataset.stokKod);
    }

    // ─── Mount / Unmount ─────────────────────────────────────
    return {
        mount: function(konteyner) {
            _konteyner = konteyner;
            okunanQrler = new Set();
            islemDevamEdiyor = false;
            aktifDepo = null;
            aktifGrupTab = '300';

            konteyner.innerHTML = htmlOlustur();

            _delegeHandler = tikIsle.bind(this);
            konteyner.addEventListener('click', _delegeHandler);

            var aramaInput = document.getElementById('aramaInput');
            if (aramaInput) {
                _aramaHandler = function() {
                    var sorgu = aramaInput.value.trim();
                    if (aramaZamanlayici) clearTimeout(aramaZamanlayici);
                    aramaZamanlayici = setTimeout(function() { urunAra(sorgu); }, 300);
                };
                _enterHandler = function(e) {
                    if (e.key === 'Enter') urunAra(aramaInput.value.trim());
                };
                aramaInput.addEventListener('input', _aramaHandler);
                aramaInput.addEventListener('keypress', _enterHandler);
            }

            // İlk yükleme — mevcut bekleyen kayıtları göster
            grupIcerikGoster();
        },

        unmount: function() {
            if (barkodOkuyucu) { barkodOkuyucu.destroy(); barkodOkuyucu = null; }
            if (_konteyner && _delegeHandler) _konteyner.removeEventListener('click', _delegeHandler);
            var aramaInput = document.getElementById('aramaInput');
            if (aramaInput) {
                if (_aramaHandler) aramaInput.removeEventListener('input', _aramaHandler);
                if (_enterHandler) aramaInput.removeEventListener('keypress', _enterHandler);
            }
            if (aramaZamanlayici) clearTimeout(aramaZamanlayici);
            if (mesajZamanlayici) clearTimeout(mesajZamanlayici);
            _konteyner = null;
            _delegeHandler = null;
            _aramaHandler = null;
            _enterHandler = null;
            okunanQrler = new Set();
        }
    };
})();
