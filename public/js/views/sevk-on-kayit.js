/**
 * Sevk Ön Kayıt View
 * Barkod/Manuel okutma + depo grupları (100→300 EXC, 100→200 ŞUBE) + CSV export
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
    var aktifGrupTab = '300'; // '300' = EXC, '200' = SUBE

    var GRUPLAR = [
        { depo: '300', ad: '100 - DEPO \u2192 300 - EXC',  dosyaAdi: 'DEPO -> EXC.csv' },
        { depo: '200', ad: '100 - DEPO \u2192 200 - \u015eUBE', dosyaAdi: 'DEPO -> SUBE.csv' }
    ];

    function escAttr(s) {
        return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    function kullaniciAl() {
        return document.getElementById('kullaniciBilgi')?.textContent || 'bilinmiyor';
    }

    function htmlOlustur() {
        var grupTabHtml = GRUPLAR.map(function(g) {
            return '<button type="button" class="tab-btn grup-tab' + (g.depo === aktifGrupTab ? ' aktif' : '') +
                '" data-action="grupTabDegistir" data-depo="' + g.depo + '">' + g.ad + '</button>' +
                '<button type="button" class="csv-btn" data-action="csvIndir" data-depo="' + g.depo +
                '" title="' + escAttr(g.dosyaAdi) + ' indir">.csv</button>';
        }).join('');

        return '' +
            '<h1 class="baslik">Sevk \u00d6n Kay\u0131t</h1>' +

            '<div id="sonucMesaj" style="display:none;"></div>' +

            // Okutma sekmeleri
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

            // Grup sekmeleri + CSV
            '<div style="margin-top:20px;">' +
                '<div class="tab-container" style="display:flex;align-items:center;gap:4px;flex-wrap:wrap;">' +
                    grupTabHtml +
                '</div>' +
                '<div id="grupIcerik" style="margin-top:10px;"></div>' +
            '</div>';
    }

    // === Mesaj ===
    function mesajGoster(mesaj, tip) {
        var el = document.getElementById('sonucMesaj');
        if (!el) return;
        if (mesajZamanlayici) clearTimeout(mesajZamanlayici);
        el.textContent = mesaj;
        var gorunumTip = (tip === 'tekrar') ? 'hata' : tip;
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

    // === Okutma Tab Değiştir ===
    function tabDegistir(tabAdi) {
        if (!_konteyner) return;
        _konteyner.querySelectorAll('.tab-btn:not(.grup-tab)').forEach(function(b) { b.classList.remove('aktif'); });
        _konteyner.querySelectorAll('.tab-icerik').forEach(function(t) { t.classList.remove('aktif'); });
        var aktifBtn = _konteyner.querySelector('.tab-btn[data-tab="' + tabAdi + '"]');
        var aktifIcerik = document.getElementById('tab-' + tabAdi);
        if (aktifBtn) aktifBtn.classList.add('aktif');
        if (aktifIcerik) aktifIcerik.classList.add('aktif');

        if (tabAdi === 'barkod' && barkodOkuyucu) {
            barkodOkuyucu.odaklan();
        }
    }

    // === Grup Tab Değiştir ===
    function grupTabDegistir(depo) {
        aktifGrupTab = depo;
        if (!_konteyner) return;
        _konteyner.querySelectorAll('.grup-tab').forEach(function(b) {
            b.classList.toggle('aktif', b.dataset.depo === depo);
        });
        grupIcerikGoster();
    }

    // === Barkod Okutma ===
    async function barkodOkut(qrKod) {
        if (!qrKod || !qrKod.trim()) return;
        qrKod = qrKod.replace(/[\x00-\x1F\x7F]/g, '').trim();
        if (!qrKod) return;
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
                grupIcerikGoster();
            } else {
                mesajGoster(data.message, 'hata');
            }
        } catch (error) {
            mesajGoster('Hata: ' + error.message, 'hata');
        }
    }

    // === Grup İçerik Göster ===
    async function grupIcerikGoster() {
        var icerikEl = document.getElementById('grupIcerik');
        if (!icerikEl) return;

        try {
            var response = await fetch('/api/mikro/on-kayit-bekleyenler');
            var data = await response.json();

            var tumOkumalar = (data.success ? data.okumalar : []) || [];

            // Aktif gruba göre filtrele
            var filtrelenmis = tumOkumalar.filter(function(o) {
                return String(o.depo) === aktifGrupTab;
            });

            // Depo atanmamış olanlar
            var atanmamis = tumOkumalar.filter(function(o) { return !o.depo; });

            // Grup sekmelerindeki sayıları güncelle
            GRUPLAR.forEach(function(g) {
                var sayac = tumOkumalar.filter(function(o) { return String(o.depo) === g.depo; }).length;
                var btn = _konteyner && _konteyner.querySelector('.grup-tab[data-depo="' + g.depo + '"]');
                if (btn) btn.textContent = g.ad + (sayac > 0 ? ' (' + sayac + ')' : '');
            });

            if (filtrelenmis.length === 0 && atanmamis.length === 0) {
                icerikEl.innerHTML = '<div class="bos-mesaj">Bu grupta kay\u0131t yok.</div>';
                return;
            }

            // Malzeme koduna göre grupla ve say
            var gruplu = {};
            filtrelenmis.forEach(function(o) {
                var key = o.stok_kod || '';
                if (!gruplu[key]) {
                    gruplu[key] = { malzeme_adi: o.malzeme_adi || key, stok_kod: key, adet: 0, idler: [] };
                }
                gruplu[key].adet++;
                gruplu[key].idler.push(o.id);
            });

            var html = '';

            if (Object.keys(gruplu).length > 0) {
                html += '<table style="width:100%;border-collapse:collapse;font-size:14px;">' +
                    '<thead><tr>' +
                        '<th style="text-align:left;padding:6px 8px;border-bottom:2px solid #ddd;">Malzeme Ad\u0131</th>' +
                        '<th style="text-align:left;padding:6px 8px;border-bottom:2px solid #ddd;">Malzeme Kodu</th>' +
                        '<th style="text-align:center;padding:6px 8px;border-bottom:2px solid #ddd;">Adet</th>' +
                    '</tr></thead><tbody>';

                Object.values(gruplu).forEach(function(m) {
                    html += '<tr>' +
                        '<td style="padding:6px 8px;border-bottom:1px solid #eee;">' + escAttr(m.malzeme_adi) + '</td>' +
                        '<td style="padding:6px 8px;border-bottom:1px solid #eee;font-family:monospace;">' + escAttr(m.stok_kod) + '</td>' +
                        '<td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:center;font-weight:bold;">' + m.adet + '</td>' +
                    '</tr>';
                });
                html += '</tbody></table>';
            }

            // Atanmamış okumalar varsa uyar
            if (atanmamis.length > 0) {
                html += '<div style="margin-top:12px;padding:10px;background:#fff3cd;border-radius:6px;font-size:13px;">' +
                    '<strong>' + atanmamis.length + ' okuma henüz gruba atanmamış.</strong>' +
                    '<div style="margin-top:6px;">' +
                    atanmamis.map(function(o) {
                        return '<div style="display:flex;align-items:center;gap:8px;padding:4px 0;">' +
                            '<span>' + escAttr(o.malzeme_adi || o.stok_kod) + ' P' + o.paket_sira + '</span>' +
                            '<select class="depo-select" data-id="' + o.id + '" style="font-size:13px;padding:2px 4px;">' +
                                '<option value="">Grup se\u00e7...</option>' +
                                '<option value="300">100 \u2192 300 EXC</option>' +
                                '<option value="200">100 \u2192 200 \u015eUBE</option>' +
                            '</select>' +
                            '<button type="button" class="kaydet-btn" data-action="depoKaydet" data-id="' + o.id + '" style="font-size:12px;padding:3px 8px;">Ata</button>' +
                            '<button type="button" class="sil-btn" data-action="okumaySil" data-id="' + o.id + '" style="font-size:12px;padding:3px 8px;">Sil</button>' +
                        '</div>';
                    }).join('') +
                    '</div></div>';
            }

            icerikEl.innerHTML = html || '<div class="bos-mesaj">Bu grupta kay\u0131t yok.</div>';

        } catch (error) {
            icerikEl.innerHTML = '<div class="bos-mesaj">Y\u00fckleme hatas\u0131: ' + error.message + '</div>';
        }
    }

    // === CSV İndir ===
    async function csvIndir(depo) {
        var grup = GRUPLAR.find(function(g) { return g.depo === depo; });
        if (!grup) return;

        try {
            var response = await fetch('/api/mikro/on-kayit-bekleyenler');
            var data = await response.json();
            var okumalar = (data.success ? data.okumalar : []) || [];

            var filtrelenmis = okumalar.filter(function(o) { return String(o.depo) === depo; });

            if (filtrelenmis.length === 0) {
                mesajGoster('Bu grupta indirilecek kay\u0131t yok.', 'hata');
                return;
            }

            // Malzeme koduna göre grupla
            var gruplu = {};
            filtrelenmis.forEach(function(o) {
                var key = o.stok_kod || '';
                if (!gruplu[key]) gruplu[key] = 0;
                gruplu[key]++;
            });

            // CSV oluştur — BOM ile UTF-8, başlık satırı yok
            var satirlar = [];
            Object.keys(gruplu).sort().forEach(function(stokKod) {
                satirlar.push('"' + stokKod + '-0";"' + gruplu[stokKod] + '"');
            });
            var csvIcerik = '\uFEFF' + satirlar.join('\r\n');

            // İndir
            var blob = new Blob([csvIcerik], { type: 'text/csv;charset=utf-8;' });
            var url = URL.createObjectURL(blob);
            var a = document.createElement('a');
            a.href = url;
            a.download = grup.dosyaAdi;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            mesajGoster(grup.dosyaAdi + ' indirildi (' + Object.keys(gruplu).length + ' \u00e7e\u015fit)', 'basari');
        } catch (error) {
            mesajGoster('CSV hatas\u0131: ' + error.message, 'hata');
        }
    }

    // === Depo Kaydet ===
    async function depoKaydet(id) {
        var depoSelect = _konteyner && _konteyner.querySelector('.depo-select[data-id="' + id + '"]');
        var depo = depoSelect ? depoSelect.value : '';
        if (!depo) { mesajGoster('Grup se\u00e7in', 'hata'); return; }

        try {
            var response = await fetch('/api/mikro/on-kayit-depo-kaydet', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: parseInt(id), depo: parseInt(depo) })
            });
            var data = await response.json();
            if (data.success) {
                grupIcerikGoster();
            } else {
                mesajGoster(data.message, 'hata');
            }
        } catch (e) {
            mesajGoster('Hata: ' + e.message, 'hata');
        }
    }

    // === Okuma Sil ===
    async function okumaySil(id) {
        try {
            var response = await fetch('/api/mikro/on-kayit-okuma/' + id, { method: 'DELETE' });
            var data = await response.json();
            if (data.success) {
                grupIcerikGoster();
            } else {
                mesajGoster(data.message, 'hata');
            }
        } catch (e) {
            mesajGoster('Silme hatas\u0131: ' + e.message, 'hata');
        }
    }

    // === Event Delegation ===
    function tikIsle(e) {
        var hedef = e.target.closest('[data-action]');
        if (!hedef) return;
        var aksiyon = hedef.dataset.action;

        if (aksiyon === 'tabDegistir') {
            tabDegistir(hedef.dataset.tab);
        } else if (aksiyon === 'grupTabDegistir') {
            grupTabDegistir(hedef.dataset.depo);
        } else if (aksiyon === 'csvIndir') {
            csvIndir(hedef.dataset.depo);
        } else if (aksiyon === 'manuelSec') {
            manuelOkut(hedef.dataset.stokKod, hedef.dataset.malzemeAdi);
        } else if (aksiyon === 'depoKaydet') {
            depoKaydet(hedef.dataset.id);
        } else if (aksiyon === 'okumaySil') {
            okumaySil(hedef.dataset.id);
        }
    }

    return {
        mount: function(konteyner) {
            _konteyner = konteyner;
            okunanQrler = new Set();
            islemDevamEdiyor = false;
            aktifGrupTab = '300';

            konteyner.innerHTML = htmlOlustur();

            // Event delegation
            _delegeHandler = tikIsle.bind(this);
            konteyner.addEventListener('click', _delegeHandler);

            // Barkod okuyucu
            var barkodAlani = document.getElementById('barkodOkuyucuAlani');
            if (barkodAlani && window.BarkodOkuyucu) {
                barkodOkuyucu = new BarkodOkuyucu(barkodAlani, function(kod) {
                    barkodOkut(kod);
                });
            }

            // Manuel arama
            var aramaInput = document.getElementById('aramaInput');
            if (aramaInput) {
                _aramaHandler = function() {
                    var sorgu = aramaInput.value.trim();
                    if (aramaZamanlayici) clearTimeout(aramaZamanlayici);
                    aramaZamanlayici = setTimeout(function() { urunAra(sorgu); }, 300);
                };
                _enterHandler = function(e) {
                    if (e.key === 'Enter') {
                        var sorgu = aramaInput.value.trim();
                        urunAra(sorgu);
                    }
                };
                aramaInput.addEventListener('input', _aramaHandler);
                aramaInput.addEventListener('keypress', _enterHandler);
            }

            // İlk yükleme
            grupIcerikGoster();
        },

        unmount: function() {
            // Kamerayı önce kapat
            if (barkodOkuyucu) {
                barkodOkuyucu.destroy();
                barkodOkuyucu = null;
            }
            if (_konteyner && _delegeHandler) {
                _konteyner.removeEventListener('click', _delegeHandler);
            }
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
            islemDevamEdiyor = false;
        }
    };
})();
