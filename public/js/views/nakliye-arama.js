/**
 * Nakliye Arama View - Nakliye sorgulama ve secim
 */
window.Views = window.Views || {};
window.Views['nakliye-arama'] = {
    _aramaSonuclari: [],
    _seciliNakliyeler: null,
    _fabrikaDepoMap: {},

    mount(konteyner) {
        var self = this;
        self._aramaSonuclari = [];
        self._seciliNakliyeler = new Set();
        self._fabrikaDepoMap = {};

        konteyner.innerHTML =
            '<h1 class="baslik">Nakliye Arama</h1>' +
            '<div class="arama-form">' +
                '<div class="form-satir">' +
                    '<label for="depoYeri">Fabrika Depo Yeri</label>' +
                    '<select id="depoYeri">' +
                        '<option value="">T\u00fcm\u00fc</option>' +
                    '</select>' +
                '</div>' +
                '<div class="form-satir">' +
                    '<label for="varisDepoYeri">Var\u0131\u015f Depo Yeri</label>' +
                    '<select id="varisDepoYeri">' +
                        '<option value="">T\u00fcm\u00fc</option>' +
                    '</select>' +
                '</div>' +
                '<div class="tarih-grup">' +
                    '<div class="form-satir">' +
                        '<label for="baslangicTarihi">Ba\u015flang\u0131\u00e7 Tarihi</label>' +
                        '<input type="date" id="baslangicTarihi">' +
                    '</div>' +
                    '<div class="form-satir">' +
                        '<label for="bitisTarihi">Biti\u015f Tarihi</label>' +
                        '<input type="date" id="bitisTarihi">' +
                    '</div>' +
                '</div>' +
                '<div class="nakliye-arama-satir">' +
                    '<div class="form-satir">' +
                        '<label for="nakliyeNo">Nakliye Numaras\u0131</label>' +
                        '<input type="text" id="nakliyeNo" placeholder="Opsiyonel...">' +
                    '</div>' +
                    '<button type="button" class="arama-btn" id="aramaBtn" title="Ara">' +
                        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
                            '<circle cx="11" cy="11" r="8"/>' +
                            '<line x1="21" y1="21" x2="16.65" y2="16.65"/>' +
                        '</svg>' +
                    '</button>' +
                '</div>' +
                '<div id="hataMesaj" class="hata-mesaj"></div>' +
            '</div>' +
            '<div class="sonuc-alani">' +
                '<div class="sonuc-baslik">' +
                    '<span>Nakliye Listesi</span>' +
                    '<span class="sonuc-istatistik" id="sonucIstatistik"></span>' +
                '</div>' +
                '<div class="sonuc-liste" id="sonucListe">' +
                    '<div class="sonuc-bos">Aramak i\u00e7in yukar\u0131daki formu doldurun</div>' +
                '</div>' +
            '</div>' +
            '<button id="devamBtn" class="buton" style="margin-top: 20px;" disabled>' +
                'Nakliyeyi Y\u00fckle (<span id="seciliSayisi">0</span>)' +
            '</button>' +
            '<a href="/fis/nakliye-okutma" id="nakliyeOkutmaBtn" class="buton" style="margin-top: 10px; display: block; text-align: center;">' +
                'Nakliye Okutma' +
            '</a>' +
            '<div id="yukleniyorNakliye" class="yukleniyor-overlay gizle">' +
                '<div class="yukleniyor-icerik">' +
                    '<div class="spinner"></div>' +
                    '<div>Y\u00fckleniyor...</div>' +
                '</div>' +
            '</div>';

        var depoYeriSelect = konteyner.querySelector('#depoYeri');
        var baslangicTarihiInput = konteyner.querySelector('#baslangicTarihi');
        var bitisTarihiInput = konteyner.querySelector('#bitisTarihi');
        var nakliyeNoInput = konteyner.querySelector('#nakliyeNo');
        var aramaBtn = konteyner.querySelector('#aramaBtn');
        var sonucListe = konteyner.querySelector('#sonucListe');
        var sonucIstatistik = konteyner.querySelector('#sonucIstatistik');
        var devamBtn = konteyner.querySelector('#devamBtn');
        var seciliSayisiSpan = konteyner.querySelector('#seciliSayisi');
        var yukleniyorOverlay = konteyner.querySelector('#yukleniyorNakliye');
        var hataMesajEl = konteyner.querySelector('#hataMesaj');

        // Tarih yardimcilari
        function formatTarih(tarih) {
            var yil = tarih.getFullYear();
            var ay = String(tarih.getMonth() + 1).padStart(2, '0');
            var gun = String(tarih.getDate()).padStart(2, '0');
            return yil + '-' + ay + '-' + gun;
        }

        function formatTarihGosterim(tarihStr) {
            if (!tarihStr || tarihStr.length !== 8) return tarihStr || '-';
            return tarihStr.substring(6, 8) + '.' + tarihStr.substring(4, 6) + '.' + tarihStr.substring(0, 4);
        }

        function tarihleriAyarla() {
            var bugun = new Date();
            var birHaftaOnce = new Date();
            birHaftaOnce.setDate(bugun.getDate() - 7);
            bitisTarihiInput.value = formatTarih(bugun);
            baslangicTarihiInput.value = formatTarih(birHaftaOnce);
        }

        function hataGoster(mesaj) {
            hataMesajEl.textContent = mesaj;
            hataMesajEl.classList.add('goster');
        }

        function hataGizle() {
            hataMesajEl.classList.remove('goster');
        }

        function yukleniyorGoster() {
            yukleniyorOverlay.classList.remove('gizle');
        }

        function yukleniyorGizle() {
            yukleniyorOverlay.classList.add('gizle');
        }

        function seciliSayisiniGuncelle() {
            var sayi = self._seciliNakliyeler.size;
            seciliSayisiSpan.textContent = sayi;
            devamBtn.disabled = sayi === 0;
            var secimDurumu = konteyner.querySelector('#secimDurumu');
            if (secimDurumu) {
                secimDurumu.textContent = sayi > 0 ? sayi + ' se\u00e7ili' : '';
            }
        }

        // Arama islemi
        async function aramaYap() {
            var depoYeri = depoYeriSelect.value;
            var varisDepoYeri = konteyner.querySelector('#varisDepoYeri').value;
            var baslangicTarihi = baslangicTarihiInput.value;
            var bitisTarihi = bitisTarihiInput.value;
            var nakliyeNo = nakliyeNoInput.value.trim();

            if (!baslangicTarihi || !bitisTarihi) {
                hataGoster('L\u00fctfen tarih aral\u0131\u011f\u0131n\u0131 se\u00e7in');
                return;
            }

            hataGizle();
            yukleniyorGoster();
            self._seciliNakliyeler.clear();
            seciliSayisiniGuncelle();

            try {
                var response = await fetch('/api/dogtas/nakliye-ara', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        depoYeri: depoYeri,
                        varisDepoYeri: varisDepoYeri,
                        baslangicTarihi: baslangicTarihi,
                        bitisTarihi: bitisTarihi,
                        nakliyeNo: nakliyeNo
                    })
                });

                var data = await response.json();

                if (data.success) {
                    self._aramaSonuclari = data.data || [];
                    sonuclariGoster(self._aramaSonuclari);
                    sonucIstatistik.textContent = data.toplam + ' nakliye, ' + data.toplamKalem + ' kalem';
                } else {
                    hataGoster(data.message || 'Arama s\u0131ras\u0131nda bir hata olu\u015ftu');
                    sonucListe.innerHTML = '<div class="sonuc-bos">Sonu\u00e7 bulunamad\u0131</div>';
                    sonucIstatistik.textContent = '';
                }
            } catch (error) {
                console.error('Arama hatas\u0131:', error);
                hataGoster('Sunucuya ba\u011flan\u0131lamad\u0131. L\u00fctfen tekrar deneyin.');
                sonucListe.innerHTML = '<div class="sonuc-bos">Ba\u011flant\u0131 hatas\u0131</div>';
                sonucIstatistik.textContent = '';
            } finally {
                yukleniyorGizle();
            }
        }

        function sonuclariGoster(sonuclar) {
            if (!sonuclar || sonuclar.length === 0) {
                sonucListe.innerHTML = '<div class="sonuc-bos">Sonu\u00e7 bulunamad\u0131</div>';
                devamBtn.disabled = true;
                return;
            }

            var html = '<div class="secim-toolbar">' +
                '<label>' +
                    '<input type="checkbox" id="tumunuSec" class="sonuc-checkbox">' +
                    ' T\u00fcm\u00fcn\u00fc Se\u00e7' +
                '</label>' +
                '<span class="secim-sayisi" id="secimDurumu"></span>' +
            '</div>';

            sonuclar.forEach(function(sonuc, index) {
                var depoAdi = self._fabrikaDepoMap[sonuc.storageLocation] || sonuc.storageLocation;

                html += '<div class="sonuc-satir" data-index="' + index + '">' +
                    '<input type="checkbox" class="sonuc-checkbox nakliye-checkbox" data-index="' + index + '">' +
                    '<div class="sonuc-icerik">' +
                        '<div class="sonuc-ust">' +
                            '<span class="sonuc-belge-no">Nakliye No: ' + (sonuc.distributionDocumentNumber || '-') + '</span>' +
                            '<span class="sonuc-tarih">' + formatTarihGosterim(sonuc.documanetDate) + '</span>' +
                        '</div>' +
                        '<div class="sonuc-detay">' +
                            '<div class="sonuc-detay-satir">' +
                                '<span>Plaka: <strong>' + (sonuc.shipmentVehicleLicensePlate || '-') + '</strong></span>' +
                                '<span>\u015eof\u00f6r: <strong>' + (sonuc.shipmentVehicleDriverName || '-') + '</strong></span>' +
                            '</div>' +
                            '<div class="sonuc-detay-satir" style="margin-top: 4px;">' +
                                '<span class="sonuc-badge">' + sonuc.toplamKalem + ' Kalem</span>' +
                                '<span class="sonuc-badge">' + sonuc.toplamPaket + ' Paket</span>' +
                                '<span class="sonuc-badge">' + depoAdi + '</span>' +
                            '</div>' +
                        '</div>' +
                    '</div>' +
                '</div>';
            });

            sonucListe.innerHTML = html;

            // Tumunu sec checkbox
            var tumunuSecCheckbox = konteyner.querySelector('#tumunuSec');
            tumunuSecCheckbox.addEventListener('change', function() {
                if (this.checked) {
                    var plakalar = [];
                    var plakaSet = {};
                    self._aramaSonuclari.forEach(function(s) {
                        if (!plakaSet[s.shipmentVehicleLicensePlate]) {
                            plakaSet[s.shipmentVehicleLicensePlate] = true;
                            plakalar.push(s.shipmentVehicleLicensePlate);
                        }
                    });
                    if (plakalar.length > 1) {
                        Bildirim.uyari('Farkl\u0131 plakal\u0131 ara\u00e7lar var. T\u00fcm\u00fcn\u00fc se\u00e7emezsiniz. L\u00fctfen tek tek se\u00e7im yap\u0131n.');
                        this.checked = false;
                        return;
                    }
                }

                var checkboxlar = konteyner.querySelectorAll('.nakliye-checkbox');
                var seciliMi = this.checked;
                checkboxlar.forEach(function(cb, idx) {
                    cb.checked = seciliMi;
                    if (seciliMi) {
                        self._seciliNakliyeler.add(idx);
                    } else {
                        self._seciliNakliyeler.delete(idx);
                    }
                    cb.closest('.sonuc-satir').classList.toggle('secili', seciliMi);
                });
                seciliSayisiniGuncelle();
            });

            // Tek tek checkboxlar
            konteyner.querySelectorAll('.nakliye-checkbox').forEach(function(cb) {
                cb.addEventListener('change', function() {
                    var index = parseInt(this.dataset.index);
                    var seciliNakliye = self._aramaSonuclari[index];

                    if (this.checked) {
                        if (self._seciliNakliyeler.size > 0) {
                            var mevcutSeciliIndex = Array.from(self._seciliNakliyeler)[0];
                            var mevcutPlaka = self._aramaSonuclari[mevcutSeciliIndex].shipmentVehicleLicensePlate;
                            var yeniPlaka = seciliNakliye.shipmentVehicleLicensePlate;
                            if (mevcutPlaka !== yeniPlaka) {
                                Bildirim.uyari('Farkl\u0131 plakal\u0131 ara\u00e7lar birle\u015ftirilemez! Mevcut: ' + mevcutPlaka + ' / Se\u00e7ilen: ' + yeniPlaka);
                                this.checked = false;
                                return;
                            }
                        }
                        self._seciliNakliyeler.add(index);
                    } else {
                        self._seciliNakliyeler.delete(index);
                    }
                    this.closest('.sonuc-satir').classList.toggle('secili', this.checked);
                    seciliSayisiniGuncelle();

                    var tumCheckboxlar = konteyner.querySelectorAll('.nakliye-checkbox');
                    var secilenler = konteyner.querySelectorAll('.nakliye-checkbox:checked');
                    tumunuSecCheckbox.checked = tumCheckboxlar.length === secilenler.length;
                });
            });

            // Satira tikla -> checkbox degistir
            konteyner.querySelectorAll('.sonuc-icerik').forEach(function(icerik) {
                icerik.addEventListener('click', function() {
                    var satir = this.closest('.sonuc-satir');
                    var checkbox = satir.querySelector('.nakliye-checkbox');
                    checkbox.checked = !checkbox.checked;
                    checkbox.dispatchEvent(new Event('change'));
                });
            });
        }

        // Devam butonu
        this._devamHandler = async function() {
            if (self._seciliNakliyeler.size === 0) {
                Bildirim.uyari('L\u00fctfen en az bir nakliye se\u00e7in');
                return;
            }

            var seciliVeriler = Array.from(self._seciliNakliyeler).map(function(idx) {
                return self._aramaSonuclari[idx];
            });

            var tumKalemler = [];
            seciliVeriler.forEach(function(nakliye) {
                if (nakliye.kalemler && Array.isArray(nakliye.kalemler)) {
                    tumKalemler.push.apply(tumKalemler, nakliye.kalemler);
                }
            });

            var toplamPaket = tumKalemler.reduce(function(toplam, kalem) {
                return toplam + (parseInt(kalem.productPackages) || 0);
            }, 0);

            var plaka = seciliVeriler[0].shipmentVehicleLicensePlate;
            var onay = confirm(toplamPaket + ' paket i\u00e7in \u00e7eki listesi kaydedilecektir.\n\nPlaka: ' + plaka + '\nNakliye Say\u0131s\u0131: ' + seciliVeriler.length + '\n\nDevam etmek istiyor musunuz?');
            if (!onay) return;

            yukleniyorGoster();

            try {
                // Kullanici bilgisini shell'den al
                var kullaniciBilgiEl = document.getElementById('kullaniciBilgi');
                var kullanici = (kullaniciBilgiEl && kullaniciBilgiEl.textContent && kullaniciBilgiEl.textContent.trim()) || 'bilinmiyor';

                var response = await fetch('/api/supabase/nakliye-yukle', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        nakliyeler: seciliVeriler,
                        kalemler: tumKalemler,
                        kullanici: kullanici
                    })
                });

                var data = await response.json();

                if (data.success) {
                    var devam = confirm('Ba\u015far\u0131l\u0131!\n\n' + data.message + '\n\nNakliye Okutma sayfas\u0131na gitmek ister misiniz?');
                    if (devam) {
                        // MPA sayfasina yonlendir
                        AppRouter.git('/fis/nakliye-okutma?oturum=' + data.oturumId);
                    } else {
                        self._seciliNakliyeler.clear();
                        konteyner.querySelectorAll('.nakliye-checkbox').forEach(function(cb) {
                            cb.checked = false;
                            var satir = cb.closest('.sonuc-satir');
                            if (satir) satir.classList.remove('secili');
                        });
                        var tumunuSecCb = konteyner.querySelector('#tumunuSec');
                        if (tumunuSecCb) tumunuSecCb.checked = false;
                        seciliSayisiniGuncelle();
                    }
                } else {
                    Bildirim.hata(data.message || 'Kay\u0131t s\u0131ras\u0131nda bir hata olu\u015ftu');
                }
            } catch (error) {
                console.error('Kay\u0131t hatas\u0131:', error);
                Bildirim.hata('Ba\u011flant\u0131 hatas\u0131! Sunucuya ba\u011flan\u0131lamad\u0131. L\u00fctfen tekrar deneyin.');
            } finally {
                yukleniyorGizle();
            }
        };
        devamBtn.addEventListener('click', this._devamHandler);

        // Arama butonu
        this._aramaBtnHandler = function() { aramaYap(); };
        aramaBtn.addEventListener('click', this._aramaBtnHandler);

        // Enter tusu ile arama
        this._enterHandler = function(e) {
            if (e.key === 'Enter') aramaYap();
        };
        nakliyeNoInput.addEventListener('keypress', this._enterHandler);

        // Varis Depo yukle
        async function varisDepoYukle() {
            try {
                var response = await fetch('/api/ayarlar/getir');
                var data = await response.json();
                var varisDepoSelect = konteyner.querySelector('#varisDepoYeri');

                var depoAdi = 'G\u00dcNE\u015eLER BATMAN DEPO';
                if (data.success) {
                    var depoBilgisi = data.ayarlar.find(function(a) { return a.anahtar === 'depo_bilgisi'; });
                    if (depoBilgisi && depoBilgisi.deger) depoAdi = depoBilgisi.deger;
                }

                var option = document.createElement('option');
                option.value = depoAdi;
                option.textContent = depoAdi;
                option.selected = true;
                varisDepoSelect.appendChild(option);
            } catch (error) {
                console.error('Var\u0131\u015f depo y\u00fckleme hatas\u0131:', error);
                var varisDepoSelect = konteyner.querySelector('#varisDepoYeri');
                var option = document.createElement('option');
                option.value = 'G\u00dcNE\u015eLER BATMAN DEPO';
                option.textContent = 'G\u00dcNE\u015eLER BATMAN DEPO';
                option.selected = true;
                varisDepoSelect.appendChild(option);
            }
        }

        // Fabrika Depo yukle
        async function fabrikaDepolariYukle() {
            try {
                var response = await fetch('/api/ayarlar/fabrika-depolar');
                var data = await response.json();

                var depolar = [];
                if (data.success && Array.isArray(data.depolar) && data.depolar.length > 0) {
                    depolar = data.depolar;
                } else {
                    depolar = [
                        { kod: '0002', ad: 'Biga' },
                        { kod: '0200', ad: '\u0130neg\u00f6l' }
                    ];
                }

                depolar.forEach(function(depo) {
                    var option = document.createElement('option');
                    option.value = depo.kod;
                    option.textContent = depo.ad;
                    depoYeriSelect.appendChild(option);
                    self._fabrikaDepoMap[depo.kod] = depo.ad;
                });
            } catch (error) {
                console.error('Fabrika depolar\u0131 y\u00fcklenemedi:', error);
                var varsayilanDepolar = [{ kod: '0002', ad: 'Biga' }, { kod: '0200', ad: '\u0130neg\u00f6l' }];
                varsayilanDepolar.forEach(function(depo) {
                    var option = document.createElement('option');
                    option.value = depo.kod;
                    option.textContent = depo.ad;
                    depoYeriSelect.appendChild(option);
                    self._fabrikaDepoMap[depo.kod] = depo.ad;
                });
            }
        }

        tarihleriAyarla();
        varisDepoYukle();
        fabrikaDepolariYukle();

        this._devamBtn = devamBtn;
        this._aramaBtn = aramaBtn;
        this._nakliyeNoInput = nakliyeNoInput;
    },

    unmount() {
        if (this._devamBtn) {
            this._devamBtn.removeEventListener('click', this._devamHandler);
        }
        if (this._aramaBtn) {
            this._aramaBtn.removeEventListener('click', this._aramaBtnHandler);
        }
        if (this._nakliyeNoInput) {
            this._nakliyeNoInput.removeEventListener('keypress', this._enterHandler);
        }
        this._aramaSonuclari = [];
        this._seciliNakliyeler = null;
        this._fabrikaDepoMap = {};
        this._devamBtn = null;
        this._aramaBtn = null;
        this._nakliyeNoInput = null;
        this._devamHandler = null;
        this._aramaBtnHandler = null;
        this._enterHandler = null;
    }
};
