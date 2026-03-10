/**
 * Stok View - Stok arama
 */
window.Views = window.Views || {};
window.Views.stok = {
    _zamanlayici: null,

    mount(konteyner) {
        konteyner.innerHTML =
            '<h1 class="baslik">Stok Arama</h1>' +
            '<div class="arama-alani">' +
                '<input type="text" class="arama-input" id="aramaInput" placeholder="Malzeme ad\u0131 veya stok kodu ile aray\u0131n..." autofocus>' +
            '</div>' +
            '<div class="sonuc-bilgi" id="sonucBilgi"></div>' +
            '<div class="stok-liste" id="stokListe">' +
                '<div class="bos-mesaj">Aramaya ba\u015flamak i\u00e7in yukar\u0131daki alana yaz\u0131n.</div>' +
            '</div>';

        var self = this;
        var DETAY_SUTUNLARI = ['DEPO', 'EXC', 'SUBE', 'Bor\u00e7', 'Bekleyen', 'Plan', 'ID1', 'ID2', '###', 'LISTE', 'INDIRIM', 'PERAKENDE'];
        var ETIKET_ADLARI = { 'ID1': 'ProSAP', 'ID2': 'Excel', '###': 'Marj', 'PERAKENDE': 'Fiyat' };
        var FIYAT_SUTUNLARI = ['PERAKENDE', 'LISTE', 'ID1', 'ID2'];

        var aramaInput = konteyner.querySelector('#aramaInput');
        var stokListe = konteyner.querySelector('#stokListe');
        var sonucBilgi = konteyner.querySelector('#sonucBilgi');

        // Event delegation - detay acma/kapama
        this._detayTiklama = function(e) {
            var baslik = e.target.closest('.stok-item-baslik');
            if (baslik) {
                var detay = baslik.nextElementSibling;
                if (detay && detay.classList.contains('stok-detay')) {
                    detay.classList.toggle('acik');
                }
            }
        };
        stokListe.addEventListener('click', this._detayTiklama);

        this._aramaHandler = function() {
            clearTimeout(self._zamanlayici);
            self._zamanlayici = setTimeout(function() {
                stokAra(aramaInput.value.trim());
            }, 300);
        };
        aramaInput.addEventListener('input', this._aramaHandler);

        async function stokAra(sorgu) {
            if (!sorgu || sorgu.length < 2) {
                stokListe.innerHTML = '<div class="bos-mesaj">Aramaya ba\u015flamak i\u00e7in en az 2 karakter yaz\u0131n.</div>';
                sonucBilgi.textContent = '';
                return;
            }

            stokListe.innerHTML = '<div class="yukleniyor">Aran\u0131yor...</div>';

            try {
                var response = await fetch('/api/stok/ara?q=' + encodeURIComponent(sorgu));
                var data = await response.json();

                if (!data.success) {
                    stokListe.innerHTML = '<div class="bos-mesaj">' + data.message + '</div>';
                    sonucBilgi.textContent = '';
                    return;
                }

                if (data.sonuclar.length === 0) {
                    stokListe.innerHTML = '<div class="bos-mesaj">Sonu\u00e7 bulunamad\u0131.</div>';
                    sonucBilgi.textContent = '';
                    return;
                }

                sonucBilgi.textContent = data.sonuclar.length + ' sonu\u00e7 bulundu';

                stokListe.innerHTML = data.sonuclar.map(function(kayit) {
                    var malzemeAdi = kayit['Malzeme Ad\u0131'] || '-';
                    var fazla = parseInt(kayit['Fazla']) || 0;
                    var miktar = parseInt(kayit['Miktar']) || 0;
                    var fazlaRenk = fazla > 0 ? '#27ae60' : '#f39c12';

                    var detayHTML = DETAY_SUTUNLARI.map(function(sutun) {
                        var deger = kayit[sutun] !== undefined ? kayit[sutun] : '-';
                        if (FIYAT_SUTUNLARI.indexOf(sutun) !== -1 && deger !== '-') {
                            deger = Number(deger).toLocaleString('tr-TR');
                        }
                        var etiket = ETIKET_ADLARI[sutun] || sutun;
                        return '<div class="detay-item">' +
                            '<span class="detay-etiket">' + etiket + '</span>' +
                            '<span class="detay-deger">' + deger + '</span>' +
                        '</div>';
                    }).join('');

                    return '<div class="stok-item">' +
                        '<div class="stok-item-baslik">' +
                            '<span class="stok-malzeme-adi">' + malzemeAdi + '</span>' +
                            '<span class="stok-depo-badge" style="border-color:' + fazlaRenk + ';color:' + fazlaRenk + '">' + fazla + '</span>' +
                            '<span class="stok-depo-badge" style="border-color:#333">' + miktar + '</span>' +
                        '</div>' +
                        '<div class="stok-detay">' +
                            '<div class="detay-grid">' + detayHTML + '</div>' +
                        '</div>' +
                    '</div>';
                }).join('');

            } catch (error) {
                stokListe.innerHTML = '<div class="bos-mesaj">Ba\u011flant\u0131 hatas\u0131: ' + error.message + '</div>';
                sonucBilgi.textContent = '';
            }
        }

        this._aramaInput = aramaInput;
        this._stokListe = stokListe;
    },

    unmount() {
        clearTimeout(this._zamanlayici);
        this._zamanlayici = null;
        if (this._aramaInput) {
            this._aramaInput.removeEventListener('input', this._aramaHandler);
        }
        if (this._stokListe) {
            this._stokListe.removeEventListener('click', this._detayTiklama);
        }
        this._aramaInput = null;
        this._stokListe = null;
        this._aramaHandler = null;
        this._detayTiklama = null;
    }
};
