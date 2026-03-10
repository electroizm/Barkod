/**
 * Ayarlar View - Uygulama ayarlari
 */
window.Views = window.Views || {};
window.Views.ayarlar = {
    _modalZamanlayici: null,
    _fabrikaDepolar: [],

    mount(konteyner) {
        var self = this;
        self._fabrikaDepolar = [];

        konteyner.innerHTML =
            '<h1 class="baslik">Ayarlar</h1>' +
            '<div id="yukleniyorAyar" class="yukleniyor">Ayarlar y\u00fckleniyor...</div>' +
            '<form id="ayarlarForm" style="display: none;">' +
                '<div class="ayar-kategori">' +
                    '<h3>Depo Bilgileri</h3>' +
                    '<div class="ayar-satir">' +
                        '<label for="depo_bilgisi">Var\u0131\u015f Depo Ad\u0131</label>' +
                        '<input type="text" id="depo_bilgisi" name="depo_bilgisi" class="ayar-input ayar-input-orta">' +
                    '</div>' +
                '</div>' +
                '<div class="ayar-kategori">' +
                    '<h3>Fabrika Depo Kodlar\u0131</h3>' +
                    '<div id="fabrikaDepoListesi"></div>' +
                    '<div class="depo-ekle-satir" style="margin-top: 8px; display: flex; gap: 8px; align-items: center;">' +
                        '<input type="text" id="yeniDepoKodu" placeholder="Depo Kodu" class="ayar-input ayar-input-kucuk" style="width: 100px; height: 40px; box-sizing: border-box;">' +
                        '<input type="text" id="yeniDepoAdi" placeholder="Depo Ad\u0131" class="ayar-input ayar-input-kucuk" style="flex: 1; height: 40px; box-sizing: border-box;">' +
                        '<button type="button" id="depoEkleBtn" class="buton" style="height: 40px; padding: 0 20px; background-color: #27ae60; min-width: auto; width: auto; display: flex; align-items: center; justify-content: center; position: relative; top: 6px;">+ Ekle</button>' +
                    '</div>' +
                '</div>' +
                '<div class="ayar-kategori">' +
                    '<h3>Kullan\u0131c\u0131 Bilgileri</h3>' +
                    '<div class="ayar-satir">' +
                        '<label for="kullanici_adi_soyadi">Kullan\u0131c\u0131 Ad\u0131 & Soyad\u0131</label>' +
                        '<input type="text" id="kullanici_adi_soyadi" name="kullanici_adi_soyadi" class="ayar-input ayar-input-orta">' +
                    '</div>' +
                '</div>' +
                '<div class="ayar-kategori">' +
                    '<h3>Google Sheets Ayarlar\u0131</h3>' +
                    '<div class="ayar-satir">' +
                        '<label for="PRGsheet_ID">PRGsheet ID</label>' +
                        '<span class="aciklama">Google Sheets d\u00f6k\u00fcman ID\'si</span>' +
                        '<input type="text" id="PRGsheet_ID" name="PRGsheet_ID" class="ayar-input ayar-input-orta">' +
                    '</div>' +
                '</div>' +
                '<div class="ayar-kategori">' +
                    '<h3>API Ayarlar\u0131</h3>' +
                    '<div class="ayar-satir">' +
                        '<label for="base_url">API Base URL</label>' +
                        '<span class="aciklama">Ana API adresi</span>' +
                        '<input type="text" id="base_url" name="base_url" class="ayar-input ayar-input-orta">' +
                    '</div>' +
                    '<div class="ayar-satir">' +
                        '<label for="nakliye_endpoint">Nakliye Endpoint</label>' +
                        '<span class="aciklama">Nakliye sorgulama endpoint\'i</span>' +
                        '<input type="text" id="nakliye_endpoint" name="nakliye_endpoint" class="ayar-input ayar-input-orta">' +
                    '</div>' +
                    '<div class="ayar-satir">' +
                        '<label for="CustomerNo">M\u00fc\u015fteri Numaras\u0131</label>' +
                        '<input type="text" id="CustomerNo" name="CustomerNo" class="ayar-input ayar-input-kucuk">' +
                    '</div>' +
                    '<div class="ayar-satir">' +
                        '<label for="userName">API Kullan\u0131c\u0131 Ad\u0131</label>' +
                        '<input type="text" id="userName" name="userName" class="ayar-input ayar-input-orta">' +
                    '</div>' +
                    '<div class="ayar-satir">' +
                        '<label for="password">API \u015eifresi</label>' +
                        '<div class="sifre-alani">' +
                            '<input type="password" id="password" name="password" class="ayar-input ayar-input-orta">' +
                            '<button type="button" class="sifre-toggle" data-target="password" title="G\u00f6ster/Gizle">' +
                                '<svg class="goz-acik" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>' +
                                '<svg class="goz-kapali" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>' +
                            '</button>' +
                        '</div>' +
                    '</div>' +
                    '<div class="ayar-satir">' +
                        '<label for="clientId">OAuth Client ID</label>' +
                        '<input type="text" id="clientId" name="clientId" class="ayar-input ayar-input-kucuk">' +
                    '</div>' +
                    '<div class="ayar-satir">' +
                        '<label for="clientSecret">OAuth Client Secret</label>' +
                        '<div class="sifre-alani">' +
                            '<input type="password" id="clientSecret" name="clientSecret" class="ayar-input ayar-input-orta">' +
                            '<button type="button" class="sifre-toggle" data-target="clientSecret" title="G\u00f6ster/Gizle">' +
                                '<svg class="goz-acik" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>' +
                                '<svg class="goz-kapali" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>' +
                            '</button>' +
                        '</div>' +
                    '</div>' +
                    '<div class="ayar-satir">' +
                        '<label for="applicationCode">Uygulama Kodu</label>' +
                        '<input type="text" id="applicationCode" name="applicationCode" class="ayar-input ayar-input-kucuk">' +
                    '</div>' +
                '</div>' +
                '<div class="kaydet-alan">' +
                    '<button type="submit" class="buton buton-birincil">Kaydet</button>' +
                '</div>' +
            '</form>' +
            '<div id="kaydetOverlay" class="kaydet-overlay">' +
                '<div id="kaydetModal" class="kaydet-modal">' +
                    '<div id="kaydetIkon" class="kaydet-ikon">\u23f3</div>' +
                    '<div id="kaydetMesaj" class="kaydet-mesaj">Kaydediliyor...</div>' +
                    '<div class="ilerleme-cubugu">' +
                        '<div class="ilerleme-dolu" id="ilerlemeDolu"></div>' +
                    '</div>' +
                '</div>' +
            '</div>';

        var form = konteyner.querySelector('#ayarlarForm');
        var yukleniyorDiv = konteyner.querySelector('#yukleniyorAyar');
        var kaydetOverlay = konteyner.querySelector('#kaydetOverlay');
        var kaydetModal = konteyner.querySelector('#kaydetModal');
        var kaydetIkon = konteyner.querySelector('#kaydetIkon');
        var kaydetMesaj = konteyner.querySelector('#kaydetMesaj');
        var ilerlemeDolu = konteyner.querySelector('#ilerlemeDolu');

        // Sifre goster/gizle
        konteyner.querySelectorAll('.sifre-toggle').forEach(function(btn) {
            btn.addEventListener('click', function() {
                var targetId = this.dataset.target;
                var input = konteyner.querySelector('#' + targetId);
                if (input.type === 'password') {
                    input.type = 'text';
                    this.classList.add('aktif');
                } else {
                    input.type = 'password';
                    this.classList.remove('aktif');
                }
            });
        });

        // Fabrika Depo Yonetimi
        function fabrikaDepolariGoster() {
            var liste = konteyner.querySelector('#fabrikaDepoListesi');
            if (self._fabrikaDepolar.length === 0) {
                liste.innerHTML = '<div style="color: #999; font-size: 13px; padding: 10px;">Hen\u00fcz fabrika deposu eklenmedi.</div>';
                return;
            }
            liste.innerHTML = self._fabrikaDepolar.map(function(depo, index) {
                return '<div class="depo-item" data-index="' + index + '">' +
                    '<span class="depo-kod">' + depo.kod + '</span>' +
                    '<span class="depo-ad">' + depo.ad + '</span>' +
                    '<button type="button" class="depo-sil" data-sil-index="' + index + '">\u00d7</button>' +
                '</div>';
            }).join('');
        }

        function fabrikaDepoEkle() {
            var kodInput = konteyner.querySelector('#yeniDepoKodu');
            var adInput = konteyner.querySelector('#yeniDepoAdi');
            var kod = kodInput.value.trim();
            var ad = adInput.value.trim();
            if (!kod || !ad) { alert('Depo kodu ve ad\u0131 giriniz'); return; }
            if (self._fabrikaDepolar.some(function(d) { return d.kod === kod; })) {
                alert('Bu depo kodu zaten mevcut'); return;
            }
            self._fabrikaDepolar.push({ kod: kod, ad: ad });
            fabrikaDepolariGoster();
            kodInput.value = '';
            adInput.value = '';
        }

        // Event delegation - depo sil
        this._depoSilHandler = function(e) {
            var silBtn = e.target.closest('[data-sil-index]');
            if (silBtn) {
                var index = parseInt(silBtn.dataset.silIndex);
                if (confirm('Bu depoyu silmek istedi\u011finize emin misiniz?')) {
                    self._fabrikaDepolar.splice(index, 1);
                    fabrikaDepolariGoster();
                }
            }
        };
        var fabrikaListeEl = konteyner.querySelector('#fabrikaDepoListesi');
        fabrikaListeEl.addEventListener('click', this._depoSilHandler);

        konteyner.querySelector('#depoEkleBtn').addEventListener('click', fabrikaDepoEkle);

        konteyner.querySelector('#yeniDepoAdi').addEventListener('keypress', function(e) {
            if (e.key === 'Enter') { e.preventDefault(); fabrikaDepoEkle(); }
        });

        // Form submit
        this._submitHandler = async function(e) {
            e.preventDefault();

            var formData = new FormData(form);
            var ayarlar = {};
            formData.forEach(function(value, key) { ayarlar[key] = value; });

            // Modal goster
            kaydetOverlay.classList.add('goster');
            kaydetModal.className = 'kaydet-modal';
            kaydetIkon.textContent = '\u23f3';
            kaydetMesaj.textContent = 'Kaydediliyor...';
            ilerlemeDolu.style.width = '30%';

            try {
                ilerlemeDolu.style.width = '60%';

                var response = await fetch('/api/ayarlar/kaydet', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ ayarlar: ayarlar })
                });

                ilerlemeDolu.style.width = '90%';
                var data = await response.json();

                // Fabrika depolarini da kaydet
                try {
                    await fetch('/api/ayarlar/fabrika-depolar', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ depolar: self._fabrikaDepolar })
                    });
                } catch (err) {
                    console.error('Fabrika depolar\u0131 kaydedilemedi:', err);
                }

                if (data.success) {
                    ilerlemeDolu.style.width = '100%';
                    kaydetIkon.textContent = '\u2705';
                    kaydetMesaj.textContent = 'Ayarlar kaydedildi!';
                    kaydetModal.classList.add('basari');

                    // Shell kullanici bilgisini guncelle
                    if (ayarlar.kullanici_adi_soyadi) {
                        var bilgiEl = document.getElementById('kullaniciBilgi');
                        if (bilgiEl) bilgiEl.textContent = ayarlar.kullanici_adi_soyadi;
                    }
                } else {
                    ilerlemeDolu.style.width = '100%';
                    kaydetIkon.textContent = '\u274c';
                    kaydetMesaj.textContent = 'Hata: ' + data.message;
                    kaydetModal.classList.add('hata');
                }

                self._modalZamanlayici = setTimeout(function() {
                    kaydetOverlay.classList.remove('goster');
                    ilerlemeDolu.style.width = '0%';
                }, 2000);

            } catch (error) {
                ilerlemeDolu.style.width = '100%';
                kaydetIkon.textContent = '\u274c';
                kaydetMesaj.textContent = 'Ba\u011flant\u0131 hatas\u0131!';
                kaydetModal.classList.add('hata');

                self._modalZamanlayici = setTimeout(function() {
                    kaydetOverlay.classList.remove('goster');
                    ilerlemeDolu.style.width = '0%';
                }, 2000);
            }
        };
        form.addEventListener('submit', this._submitHandler);

        // Ayarlari yukle
        async function ayarlariYukle() {
            try {
                var response = await fetch('/api/ayarlar/getir');
                var data = await response.json();

                if (data.success) {
                    data.ayarlar.forEach(function(ayar) {
                        var input = konteyner.querySelector('#' + ayar.anahtar);
                        if (input) input.value = ayar.deger || '';
                        if (ayar.anahtar === 'kullanici_adi_soyadi' && ayar.deger) {
                            var bilgiEl = document.getElementById('kullaniciBilgi');
                            if (bilgiEl) bilgiEl.textContent = ayar.deger;
                        }
                    });
                    yukleniyorDiv.style.display = 'none';
                    form.style.display = 'block';
                } else {
                    yukleniyorDiv.textContent = 'Ayarlar y\u00fcklenemedi: ' + data.message;
                }
            } catch (error) {
                yukleniyorDiv.textContent = 'Ba\u011flant\u0131 hatas\u0131: ' + error.message;
            }
        }

        async function fabrikaDepolariYukle() {
            try {
                var response = await fetch('/api/ayarlar/fabrika-depolar');
                var data = await response.json();
                if (data.success && Array.isArray(data.depolar)) {
                    self._fabrikaDepolar = data.depolar;
                    fabrikaDepolariGoster();
                }
            } catch (error) {
                console.error('Fabrika depolar\u0131 y\u00fcklenemedi:', error);
            }
        }

        ayarlariYukle();
        fabrikaDepolariYukle();

        this._form = form;
        this._fabrikaListeEl = fabrikaListeEl;
    },

    unmount() {
        clearTimeout(this._modalZamanlayici);
        this._modalZamanlayici = null;
        if (this._form) {
            this._form.removeEventListener('submit', this._submitHandler);
        }
        if (this._fabrikaListeEl) {
            this._fabrikaListeEl.removeEventListener('click', this._depoSilHandler);
        }
        this._fabrikaDepolar = [];
        this._form = null;
        this._fabrikaListeEl = null;
        this._submitHandler = null;
        this._depoSilHandler = null;
    }
};
