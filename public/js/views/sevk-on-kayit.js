/**
 * Sevk Ön Kayıt View
 * URL param ile: /sevk-on-kayit?depo=300 → direkt tarama ekranı
 * Param yoksa: grup seçim ekranı
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
    var aktifDepo = null;   // '300' veya '200'

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
    function grupAdi(depo) {
        var g = GRUPLAR.find(function(x) { return x.depo === depo; });
        return g ? g.ad : depo;
    }

    // ─── GRUP SEÇİM EKRANI (param yokken) ────────────────────
    function secimEkraniHtml() {
        var grupBtnHtml = GRUPLAR.map(function(g) {
            return '<button type="button" class="ara-btn" data-action="hedefSec" data-depo="' + g.depo + '">' +
                g.ad + '</button>';
        }).join('');
        return '<h1 class="baslik">Sevk \u00d6n Kay\u0131t</h1>' +
            '<div id="sonucMesaj" style="display:none;"></div>' +
            '<div style="display:flex;flex-direction:column;gap:12px;margin-top:8px;">' + grupBtnHtml + '</div>';
    }

    // ─── TARAMA EKRANI ────────────────────────────────────────
    function taramaEkraniHtml(depo) {
        return '<h1 class="baslik">' + grupAdi(depo) + '</h1>' +
            '<div id="sonucMesaj" style="display:none;"></div>' +

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

            '<div style="margin-top:16px;">' +
                '<div class="bekleyen-baslik">Okunan Malzemeler <span id="okunanSayisi"></span></div>' +
                '<div id="bekleyenListe"></div>' +
            '</div>' +

            '<button type="button" class="csv-btn" data-action="csvIndir" ' +
                'style="width:100%;margin-top:14px;padding:13px;font-size:16px;">.csv \u0130ndir</button>';
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
        } else if (tip === 'hata') {
            if (window.SesYoneticisi) SesYoneticisi.sesliGeriBildirim('hata');
        } else if (tip === 'tekrar') {
            if (window.SesYoneticisi) SesYoneticisi.sesliGeriBildirim('tekrar');
        }
    }

    // ─── Tab Değiştir ────────────────────────────────────────
    function tabDegistir(tabAdi) {
        if (!_konteyner) return;
        _konteyner.querySelectorAll('.tab-btn').forEach(function(b) { b.classList.remove('aktif'); });
        _konteyner.querySelectorAll('.tab-icerik').forEach(function(t) { t.classList.remove('aktif'); });
        var aktifBtn = _konteyner.querySelector('.tab-btn[data-tab="' + tabAdi + '"]');
        var aktifIcerik = document.getElementById('tab-' + tabAdi);
        if (aktifBtn) aktifBtn.classList.add('aktif');
        if (aktifIcerik) aktifIcerik.classList.add('aktif');
        if (tabAdi === 'barkod' && barkodOkuyucu) barkodOkuyucu.odaklan();
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
                islemDevamEdiyor = false;
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
                listeYenile();
            } else {
                mesajGoster(kayit.message, 'hata');
            }
        } catch (error) {
            mesajGoster('Bağlantı hatası: ' + error.message, 'hata');
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
            sonucEl.innerHTML = '<div class="bos-mesaj">En az 2 karakter yazın.</div>';
            return;
        }
        sonucEl.innerHTML = '<div class="yukleniyor-kucuk">Aranıyor...</div>';
        try {
            var response = await fetch('/api/stok/ara?q=' + encodeURIComponent(sorgu));
            var data = await response.json();
            if (!data.success || data.sonuclar.length === 0) {
                sonucEl.innerHTML = '<div class="bos-mesaj">Sonuç bulunamadı.</div>';
                return;
            }
            sonucEl.innerHTML = data.sonuclar.slice(0, 20).map(function(kayit) {
                var malzemeAdi = kayit['Malzeme Adi'] || kayit['Malzeme Adı'] || '-';
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
        if (!aktifDepo) return;
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
                listeYenile();
            } else {
                mesajGoster(data.message, 'hata');
            }
        } catch (error) {
            mesajGoster('Hata: ' + error.message, 'hata');
        }
    }

    // ─── Liste Yenile ─────────────────────────────────────────
    async function listeYenile() {
        var listeEl = document.getElementById('bekleyenListe');
        var sayiEl = document.getElementById('okunanSayisi');
        if (!listeEl) return;

        try {
            var response = await fetch('/api/mikro/sevk-on-kayit-bekleyenler');
            var data = await response.json();
            var tumOkumalar = (data.success ? data.okumalar : []) || [];
            var filtrelenmis = tumOkumalar.filter(function(o) { return String(o.depo) === aktifDepo; });

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

            var toplam = Object.keys(gruplu).length;
            if (sayiEl) sayiEl.textContent = toplam > 0 ? '(' + filtrelenmis.length + ' paket, ' + toplam + ' çeşit)' : '';

            if (filtrelenmis.length === 0) {
                listeEl.innerHTML = '<div class="bos-mesaj">Henüz okutma yapılmadı.</div>';
                return;
            }

            var html = '<table style="width:100%;border-collapse:collapse;font-size:14px;">' +
                '<thead><tr>' +
                    '<th style="text-align:left;padding:6px 8px;border-bottom:2px solid #ddd;">Malzeme Adı</th>' +
                    '<th style="text-align:left;padding:6px 8px;border-bottom:2px solid #ddd;font-family:monospace;">Kod</th>' +
                    '<th style="text-align:center;padding:6px 8px;border-bottom:2px solid #ddd;">Adet</th>' +
                    '<th style="padding:6px 8px;border-bottom:2px solid #ddd;"></th>' +
                '</tr></thead><tbody>';

            Object.values(gruplu).forEach(function(m) {
                html += '<tr>' +
                    '<td style="padding:6px 8px;border-bottom:1px solid #eee;">' + escAttr(m.malzeme_adi) + '</td>' +
                    '<td style="padding:6px 8px;border-bottom:1px solid #eee;font-family:monospace;font-size:12px;">' + escAttr(m.stok_kod) + '</td>' +
                    '<td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:center;font-weight:bold;">' + m.adet + '</td>' +
                    '<td style="padding:4px 8px;border-bottom:1px solid #eee;">' +
                        '<button type="button" class="sil-btn" data-action="kayitSil" data-stok-kod="' + escAttr(m.stok_kod) +
                            '" style="font-size:12px;padding:3px 8px;">Sil</button>' +
                    '</td>' +
                '</tr>';
            });

            html += '</tbody></table>';
            listeEl.innerHTML = html;

        } catch (error) {
            listeEl.innerHTML = '<div class="bos-mesaj">Yükleme hatası: ' + error.message + '</div>';
        }
    }

    // ─── Kayıt Sil ───────────────────────────────────────────
    async function kayitSil(stokKod) {
        if (!confirm('"' + stokKod + '" kodlu tüm kayıtlar silinsin mi?')) return;
        try {
            var response = await fetch('/api/mikro/sevk-on-kayit-bekleyenler');
            var data = await response.json();
            var hedefler = (data.okumalar || []).filter(function(o) {
                return o.stok_kod === stokKod && String(o.depo) === aktifDepo;
            });
            await Promise.all(hedefler.map(function(o) {
                return fetch('/api/mikro/sevk-on-kayit-okuma/' + o.id, { method: 'DELETE' });
            }));
            listeYenile();
        } catch (e) {
            mesajGoster('Silme hatası: ' + e.message, 'hata');
        }
    }

    // ─── CSV İndir ───────────────────────────────────────────
    async function csvIndir() {
        var grup = GRUPLAR.find(function(g) { return g.depo === aktifDepo; });
        if (!grup) return;
        try {
            var response = await fetch('/api/mikro/sevk-on-kayit-bekleyenler');
            var data = await response.json();
            var okumalar = (data.success ? data.okumalar : []) || [];
            var filtrelenmis = okumalar.filter(function(o) { return String(o.depo) === aktifDepo; });
            if (filtrelenmis.length === 0) {
                mesajGoster('İndirilecek kayıt yok.', 'hata');
                return;
            }
            var gruplu = {};
            filtrelenmis.forEach(function(o) {
                var key = o.stok_kod || '';
                if (!gruplu[key]) gruplu[key] = 0;
                gruplu[key]++;
            });
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

    // ─── Tarama Ekranını Başlat ───────────────────────────────
    function taramaBaslat(depo) {
        aktifDepo = depo;
        if (!_konteyner) return;
        _konteyner.innerHTML = taramaEkraniHtml(depo);

        // Event delegation yeniden bağla
        _konteyner.removeEventListener('click', _delegeHandler);
        _delegeHandler = tikIsle;
        _konteyner.addEventListener('click', _delegeHandler);

        // Barkod okuyucu
        var barkodAlani = document.getElementById('barkodOkuyucuAlani');
        if (barkodAlani && window.BarkodOkuyucu) {
            barkodOkuyucu = new BarkodOkuyucu(barkodAlani, function(kod) { barkodOkut(kod); });
        }

        // Manuel arama input
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

        listeYenile();
    }

    // ─── Event Delegation ────────────────────────────────────
    function tikIsle(e) {
        var hedef = e.target.closest('[data-action]');
        if (!hedef) return;
        var aksiyon = hedef.dataset.action;
        if      (aksiyon === 'hedefSec')   taramaBaslat(hedef.dataset.depo);
        else if (aksiyon === 'tabDegistir') tabDegistir(hedef.dataset.tab);
        else if (aksiyon === 'manuelSec')  manuelOkut(hedef.dataset.stokKod, hedef.dataset.malzemeAdi);
        else if (aksiyon === 'kayitSil')   kayitSil(hedef.dataset.stokKod);
        else if (aksiyon === 'csvIndir')   csvIndir();
    }

    // ─── Mount / Unmount ─────────────────────────────────────
    return {
        mount: function(konteyner, params) {
            _konteyner = konteyner;
            okunanQrler = new Set();
            islemDevamEdiyor = false;
            aktifDepo = null;
            barkodOkuyucu = null;

            // URL'den depo parametresi varsa direkt tarama ekranı
            if (params && params.depo && (params.depo === '300' || params.depo === '200')) {
                taramaBaslat(params.depo);
            } else {
                // Grup seçim ekranı
                konteyner.innerHTML = secimEkraniHtml();
                _delegeHandler = tikIsle;
                konteyner.addEventListener('click', _delegeHandler);
            }
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
        }
    };
})();
