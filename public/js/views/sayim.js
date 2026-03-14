/**
 * Sayim View - Barkod ile urun sayimi
 */
window.Views = window.Views || {};
window.Views.sayim = {
    _barkodOkuyucu: null,
    _sayilanUrunler: [],

    mount(konteyner) {
        konteyner.innerHTML =
            '<h1 class="baslik">Say\u0131m</h1>' +
            '<div class="sayim-bilgi">' +
                'Barkod okutarak veya kamera ile tarayarak \u00fcr\u00fcn say\u0131m\u0131 yap\u0131n. Ayn\u0131 \u00fcr\u00fcn tekrar okundu\u011funda adet otomatik artar.' +
            '</div>' +
            '<div class="barkod-alani">' +
                '<div id="barkodOkuyucu"></div>' +
                '<div id="sonOkunan" class="son-okunan"></div>' +
            '</div>' +
            '<div class="toplam-sayim">' +
                'Toplam Say\u0131lan: <strong id="toplamSayim">0</strong> adet' +
            '</div>' +
            '<div class="urun-listesi">' +
                '<h3 style="margin-bottom: 10px;">Say\u0131lan \u00dcr\u00fcnler</h3>' +
                '<div id="urunListesi">' +
                    '<div class="bos-liste">Hen\u00fcz \u00fcr\u00fcn say\u0131lmad\u0131</div>' +
                '</div>' +
            '</div>' +
            '<button id="kaydetBtn" class="buton" style="margin-top: 20px;" disabled>' +
                'Say\u0131m\u0131 Kaydet' +
            '</button>' +
            '<button id="temizleBtn" class="buton" style="margin-top: 10px; background-color: #95a5a6;">' +
                'Say\u0131m\u0131 Temizle' +
            '</button>';

        var self = this;
        self._sayilanUrunler = [];

        var kaydetBtn = konteyner.querySelector('#kaydetBtn');
        var temizleBtn = konteyner.querySelector('#temizleBtn');
        var urunListesiEl = konteyner.querySelector('#urunListesi');
        var sonOkunanEl = konteyner.querySelector('#sonOkunan');
        var toplamSayimEl = konteyner.querySelector('#toplamSayim');

        function urunSay(barkod) {
            if (!barkod) return;
            var mevcut = self._sayilanUrunler.find(function(u) { return u.barkod === barkod; });
            if (mevcut) {
                mevcut.adet++;
            } else {
                self._sayilanUrunler.push({ barkod: barkod, ad: '\u00dcr\u00fcn ' + barkod, adet: 1 });
            }
            sonOkunanEl.textContent = 'Son okunan: ' + barkod;
            sonOkunanEl.classList.add('goster');
            listeGuncelle();
        }

        function listeGuncelle() {
            var toplam = self._sayilanUrunler.reduce(function(acc, u) { return acc + u.adet; }, 0);
            toplamSayimEl.textContent = toplam;

            if (self._sayilanUrunler.length === 0) {
                urunListesiEl.innerHTML = '<div class="bos-liste">Hen\u00fcz \u00fcr\u00fcn say\u0131lmad\u0131</div>';
                kaydetBtn.disabled = true;
                return;
            }

            kaydetBtn.disabled = false;
            var html = '';
            self._sayilanUrunler.forEach(function(urun) {
                html += '<div class="urun-satir">' +
                    '<div class="urun-bilgi">' +
                        '<div class="urun-ad">' + urun.ad + '</div>' +
                        '<div class="urun-barkod">' + urun.barkod + '</div>' +
                    '</div>' +
                    '<div class="urun-adet">x' + urun.adet + '</div>' +
                '</div>';
            });
            urunListesiEl.innerHTML = html;
        }

        this._kaydetHandler = function() {
            if (self._sayilanUrunler.length === 0) {
                Bildirim.uyari('L\u00fctfen en az bir \u00fcr\u00fcn say\u0131n');
                return;
            }
            Bildirim.basari('Say\u0131m kaydedildi! (Demo)');
            self._sayilanUrunler = [];
            listeGuncelle();
            sonOkunanEl.classList.remove('goster');
        };
        kaydetBtn.addEventListener('click', this._kaydetHandler);

        this._temizleHandler = function() {
            if (self._sayilanUrunler.length === 0) return;
            if (confirm('Say\u0131m verilerini silmek istedi\u011finize emin misiniz?')) {
                self._sayilanUrunler = [];
                listeGuncelle();
                sonOkunanEl.classList.remove('goster');
            }
        };
        temizleBtn.addEventListener('click', this._temizleHandler);

        // BarkodOkuyucu
        this._barkodOkuyucu = new BarkodOkuyucu('#barkodOkuyucu', {
            gs1Dogrulama: true,
            hataGosterici: function(hata) { Bildirim.hata(hata); },
            okumaSonrasi: function(barkod) { urunSay(barkod); }
        });

        this._kaydetBtn = kaydetBtn;
        this._temizleBtn = temizleBtn;
    },

    unmount() {
        if (this._barkodOkuyucu) {
            this._barkodOkuyucu.destroy();
            this._barkodOkuyucu = null;
        }
        if (this._kaydetBtn) {
            this._kaydetBtn.removeEventListener('click', this._kaydetHandler);
        }
        if (this._temizleBtn) {
            this._temizleBtn.removeEventListener('click', this._temizleHandler);
        }
        this._sayilanUrunler = [];
        this._kaydetBtn = null;
        this._temizleBtn = null;
        this._kaydetHandler = null;
        this._temizleHandler = null;
    }
};
