/**
 * Barkod Okuyucu Bileşeni
 * - Barkod tarayıcı ile otomatik okuma
 * - Kamera ile QR/Barkod okuma (html5-qrcode)
 * - Fotoğraftan QR/Barkod okuma
 * - Harici uygulama ile tarama (QRafter Pro x-callback-url)
 * - Tüm sayfalarda ortak kullanım
 */

class BarkodOkuyucu {
    constructor(konteyner, ayarlar = {}) {
        this.konteyner = typeof konteyner === 'string'
            ? document.querySelector(konteyner)
            : konteyner;

        this.ayarlar = {
            otomatikOkuma: true,
            kameraAktif: true,
            okumaSonrasi: null, // callback fonksiyon
            ...ayarlar
        };

        this.sonGiris = '';
        this.girisZamanlayici = null;
        this.kameraAcik = false;
        this.qrScanner = null;

        this.olustur();
        this.olaylariDinle();

        // QRafter Pro geri dönüş kontrolü
        this.hariciTaramaKontrol();
    }

    olustur() {
        this.konteyner.innerHTML = `
            <div class="barkod-okuyucu">
                <div class="barkod-giris-alani">
                    <input type="text"
                           class="barkod-input"
                           id="barkodInput"
                           autocomplete="off"
                           autocorrect="off"
                           autocapitalize="off"
                           spellcheck="false"
                           placeholder="QR kodu manuel girin veya tarayıcı ile okutun">
                </div>
                <div class="barkod-alt-satir">
                    <span class="barkod-etiket">QR Barkod</span>
                    <div class="barkod-butonlar">
                    <button type="button" class="barkod-ikon-btn" id="kameraBtn" title="Kamera ile barkod oku">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M3 7V5a2 2 0 0 1 2-2h2"/>
                            <path d="M17 3h2a2 2 0 0 1 2 2v2"/>
                            <path d="M21 17v2a2 2 0 0 1-2 2h-2"/>
                            <path d="M7 21H5a2 2 0 0 1-2-2v-2"/>
                            <line x1="7" y1="12" x2="17" y2="12"/>
                            <line x1="7" y1="8" x2="10" y2="8"/>
                            <line x1="14" y1="8" x2="17" y2="8"/>
                            <line x1="7" y1="16" x2="10" y2="16"/>
                            <line x1="14" y1="16" x2="17" y2="16"/>
                        </svg>
                    </button>
                    <button type="button" class="barkod-ikon-btn" id="appBtn" title="QRafter ile tara">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <rect x="5" y="2" width="14" height="20" rx="2" ry="2"/>
                            <path d="M9 8h2v2H9z M13 8h2v2h-2z M9 12h2v2H9z M13 12h2v2h-2z"/>
                            <line x1="12" y1="18" x2="12.01" y2="18"/>
                        </svg>
                    </button>
                    <button type="button" class="barkod-ikon-btn" id="fotoBtn" title="Fotoğraftan barkod oku">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                            <circle cx="8.5" cy="8.5" r="1.5"/>
                            <polyline points="21 15 16 10 5 21"/>
                        </svg>
                    </button>
                    <button type="button" class="barkod-ikon-btn" id="enterBtn" title="Barkodu ekle">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="9 10 4 15 9 20"/>
                            <path d="M20 4v7a4 4 0 0 1-4 4H4"/>
                        </svg>
                    </button>
                    </div>
                    <input type="file" id="fotoInput" accept="image/*" style="display: none;">
                </div>
                <div class="kamera-alani gizle" id="kameraAlani">
                    <div id="kameraOkuyucu"></div>
                    <button type="button" class="kamera-kapat" id="kameraKapat">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <line x1="18" y1="6" x2="6" y2="18"/>
                            <line x1="6" y1="6" x2="18" y2="18"/>
                        </svg>
                    </button>
                </div>
                <div id="fotoOkuyucu" style="display:none;"></div>
            </div>
        `;

        // Elementleri yakala
        this.input = this.konteyner.querySelector('#barkodInput');
        this.kameraBtn = this.konteyner.querySelector('#kameraBtn');
        this.appBtn = this.konteyner.querySelector('#appBtn');
        this.fotoBtn = this.konteyner.querySelector('#fotoBtn');
        this.enterBtn = this.konteyner.querySelector('#enterBtn');
        this.fotoInput = this.konteyner.querySelector('#fotoInput');
        this.kameraAlani = this.konteyner.querySelector('#kameraAlani');
        this.kameraOkuyucu = this.konteyner.querySelector('#kameraOkuyucu');
        this.kameraKapatBtn = this.konteyner.querySelector('#kameraKapat');
        this.fotoOkuyucu = this.konteyner.querySelector('#fotoOkuyucu');

        // Input'a odaklan
        this.input.focus();
    }

    olaylariDinle() {
        // Barkod tarayıcı tespiti - hızlı giriş algılama
        this.input.addEventListener('input', (e) => {
            this.tarayiciGirisTespit(e);
        });

        // Enter tuşu ile okuma
        this.input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                this.barkodOku();
            }
        });

        // Kamera butonu
        this.kameraBtn.addEventListener('click', () => {
            this.kameraAc();
        });

        // QRafter Pro butonu
        this.appBtn.addEventListener('click', () => {
            this.hariciUygulamaIleTara();
        });

        // Kamera kapat butonu
        this.kameraKapatBtn.addEventListener('click', () => {
            this.kameraKapat_();
        });

        // Fotoğraf butonu
        this.fotoBtn.addEventListener('click', () => {
            this.fotoInput.click();
        });

        // Fotoğraf seçildiğinde
        this.fotoInput.addEventListener('change', (e) => {
            this.fotograftanOku(e);
        });

        // Enter butonu
        this.enterBtn.addEventListener('click', () => {
            this.barkodOku();
        });
    }

    tarayiciGirisTespit(e) {
        // Barkod tarayıcıları çok hızlı giriş yapar
        clearTimeout(this.girisZamanlayici);

        this.girisZamanlayici = setTimeout(() => {
            const mevcutDeger = this.input.value.trim();

            // Eğer değer 50 karakterden uzunsa (QR kod gibi)
            // otomatik olarak oku
            if (mevcutDeger.length >= 50) {
                this.barkodOku();
            }
        }, 300);
    }

    barkodOku() {
        // Barkoddan görünmez karakterleri temizle (GS1 separator vb.)
        let barkod = this.input.value.replace(/[\x00-\x1F\x7F]/g, '').trim();

        if (!barkod) {
            return;
        }

        console.log('Barkod okuyucu - ham değer:', this.input.value);
        console.log('Barkod okuyucu - temizlenmiş:', barkod);
        console.log('Barkod okuyucu - uzunluk:', barkod.length);

        // Callback fonksiyonu çağır
        if (this.ayarlar.okumaSonrasi && typeof this.ayarlar.okumaSonrasi === 'function') {
            this.ayarlar.okumaSonrasi(barkod);
        }

        // Input'u temizle ve odaklan
        this.input.value = '';
        this.input.focus();
    }

    // ═══════════════════════════════════════════
    // QRafter Pro - Harici Uygulama Entegrasyonu
    // ═══════════════════════════════════════════

    hariciUygulamaIleTara() {
        // Mevcut URL'yi koru ve geri dönüş parametresi ekle
        const params = new URLSearchParams(window.location.search);
        params.set('qr_scan', '1');
        const donusUrl = window.location.origin + window.location.pathname + '?' + params.toString();

        // QRafter Pro x-callback-url
        const qrafterUrl = 'qrafterpro://x-callback-url/scan?x-success=' + encodeURIComponent(donusUrl);

        console.log('QRafter Pro açılıyor, dönüş URL:', donusUrl);
        window.location.href = qrafterUrl;
    }

    hariciTaramaKontrol() {
        const params = new URLSearchParams(window.location.search);

        if (params.get('qr_scan') !== '1') return;

        // QRafter Pro'dan gelen veriyi al
        const code = params.get('code') || params.get('content') || params.get('result');

        // URL'yi temizle (qr_scan, code, type parametrelerini kaldır)
        params.delete('qr_scan');
        params.delete('code');
        params.delete('content');
        params.delete('result');
        params.delete('type');
        const temizUrl = window.location.pathname + (params.toString() ? '?' + params.toString() : '');
        history.replaceState(null, '', temizUrl);

        if (code) {
            console.log('QRafter Pro geri dönüş - okunan:', code);
            // Kısa gecikme ile callback çağır (sayfa tamamen yüklensin)
            setTimeout(() => {
                if (this.ayarlar.okumaSonrasi && typeof this.ayarlar.okumaSonrasi === 'function') {
                    this.ayarlar.okumaSonrasi(code);
                }
            }, 500);
        }
    }

    // ═══════════════════════════════════════════
    // Kamera - html5-qrcode
    // ═══════════════════════════════════════════

    html5QrcodeYukle() {
        if (window.Html5Qrcode) return Promise.resolve();

        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = 'https://cdn.jsdelivr.net/npm/html5-qrcode@2.3.8/html5-qrcode.min.js';
            script.onload = () => {
                console.log('html5-qrcode kütüphanesi yüklendi');
                resolve();
            };
            script.onerror = () => reject(new Error('html5-qrcode yüklenemedi'));
            document.head.appendChild(script);
        });
    }

    async kameraAc() {
        try {
            // HTTPS kontrolü
            const guvenliKontrol = window.location.protocol === 'https:' ||
                                   window.location.hostname === 'localhost' ||
                                   window.location.hostname === '127.0.0.1';

            if (!guvenliKontrol) {
                alert('Kamera erişimi için güvenli bağlantı (HTTPS) gereklidir.\n\nAlternatif olarak:\n- Fotoğraf butonunu kullanarak galeriden barkod okuyabilirsiniz\n- Barkodu manuel olarak girebilirsiniz');
                return;
            }

            // html5-qrcode yükle
            await this.html5QrcodeYukle();

            // Kamera alanını göster
            this.kameraAlani.classList.remove('gizle');
            this.kameraAcik = true;

            // Scanner oluştur ve başlat
            this.qrScanner = new Html5Qrcode('kameraOkuyucu');

            await this.qrScanner.start(
                { facingMode: 'environment' },
                {
                    fps: 10,
                    qrbox: { width: 250, height: 250 },
                    aspectRatio: 1.0,
                    disableFlip: false
                },
                (decodedText) => {
                    // QR/Barkod bulundu!
                    console.log('Kamera ile okundu:', decodedText);
                    this.kameraKapat_();

                    if (this.ayarlar.okumaSonrasi && typeof this.ayarlar.okumaSonrasi === 'function') {
                        this.ayarlar.okumaSonrasi(decodedText);
                    }
                },
                () => {
                    // Her frame'de çağrılır - tarama devam ediyor
                }
            );

        } catch (hata) {
            console.error('Kamera erişim hatası:', hata);

            let hataMesaji = 'Kamera erişimi sağlanamadı.';

            if (hata.name === 'NotAllowedError' || (typeof hata === 'string' && hata.includes('Permission'))) {
                hataMesaji += '\n\nKamera izni reddedildi. Tarayıcı ayarlarından izin verin.';
            } else if (hata.name === 'NotFoundError') {
                hataMesaji += '\n\nKamera bulunamadı.';
            } else if (hata.name === 'NotReadableError') {
                hataMesaji += '\n\nKamera başka bir uygulama tarafından kullanılıyor olabilir.';
            } else {
                hataMesaji += '\n\n' + (hata.message || hata);
                hataMesaji += '\n\nFotoğraf butonunu kullanarak galeriden barkod okuyabilirsiniz.';
            }

            alert(hataMesaji);
            this.kameraKapat_();
        }
    }

    async kameraKapat_() {
        this.kameraAcik = false;
        this.kameraAlani.classList.add('gizle');

        if (this.qrScanner) {
            try {
                const state = this.qrScanner.getState();
                if (state === Html5QrcodeScannerState.SCANNING || state === Html5QrcodeScannerState.PAUSED) {
                    await this.qrScanner.stop();
                }
            } catch (e) {
                console.warn('Scanner durdurma hatası:', e);
            }
            try {
                this.qrScanner.clear();
            } catch (e) {}
            this.qrScanner = null;
        }

        this.input.focus();
    }

    // ═══════════════════════════════════════════
    // Fotoğraftan Okuma
    // ═══════════════════════════════════════════

    async fotograftanOku(e) {
        const dosya = e.target.files[0];
        if (!dosya) return;

        try {
            // html5-qrcode yükle
            await this.html5QrcodeYukle();

            const scanner = new Html5Qrcode('fotoOkuyucu');

            const decodedText = await scanner.scanFile(dosya, false);

            console.log('Fotoğraftan okundu:', decodedText);

            if (this.ayarlar.okumaSonrasi && typeof this.ayarlar.okumaSonrasi === 'function') {
                this.ayarlar.okumaSonrasi(decodedText);
            }

            scanner.clear();
        } catch (hata) {
            console.error('Fotoğraf okuma hatası:', hata);
            alert('Fotoğrafta QR kod/barkod bulunamadı.\nQR kodun net ve tam göründüğünden emin olun.');
        }

        // Input'u temizle (aynı dosyayı tekrar seçebilmek için)
        this.fotoInput.value = '';
        this.input.focus();
    }

    // ═══════════════════════════════════════════
    // Yardımcı Metodlar
    // ═══════════════════════════════════════════

    odaklan() {
        this.input.focus();
    }

    degerAl() {
        return this.input.value.trim();
    }

    degerAyarla(deger) {
        this.input.value = deger;
    }
}

// Global erişim için
window.BarkodOkuyucu = BarkodOkuyucu;
