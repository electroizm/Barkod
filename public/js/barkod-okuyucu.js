/**
 * Barkod Okuyucu Bileşeni
 * - Barkod tarayıcı ile otomatik okuma
 * - Kamera ile QR/Barkod okuma
 * - Fotoğraftan QR/Barkod okuma
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
        this.videoStream = null;

        this.olustur();
        this.olaylariDinle();
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
                           spellcheck="false">
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
                    <video id="kameraVideo" playsinline></video>
                    <div class="kamera-cerceve"></div>
                    <button type="button" class="kamera-kapat" id="kameraKapat">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <line x1="18" y1="6" x2="6" y2="18"/>
                            <line x1="6" y1="6" x2="18" y2="18"/>
                        </svg>
                    </button>
                </div>
            </div>
        `;

        // Elementleri yakala
        this.input = this.konteyner.querySelector('#barkodInput');
        this.kameraBtn = this.konteyner.querySelector('#kameraBtn');
        this.fotoBtn = this.konteyner.querySelector('#fotoBtn');
        this.enterBtn = this.konteyner.querySelector('#enterBtn');
        this.fotoInput = this.konteyner.querySelector('#fotoInput');
        this.kameraAlani = this.konteyner.querySelector('#kameraAlani');
        this.video = this.konteyner.querySelector('#kameraVideo');
        this.kameraKapat = this.konteyner.querySelector('#kameraKapat');

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

        // Kamera kapat butonu
        this.kameraKapat.addEventListener('click', () => {
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
        // 50ms içinde birden fazla karakter gelirse tarayıcı olarak algıla

        clearTimeout(this.girisZamanlayici);

        const mevcutDeger = this.input.value;

        this.girisZamanlayici = setTimeout(() => {
            // Eğer değer 3 karakterden uzunsa ve hızlı girildiyse
            // tarayıcı olarak kabul et
            if (mevcutDeger.length >= 3) {
                this.barkodOku();
            }
        }, 100); // 100ms bekle - tarayıcı bu sürede tamamlar
    }

    barkodOku() {
        const barkod = this.input.value.trim();

        if (!barkod) {
            return;
        }

        // Callback fonksiyonu çağır
        if (this.ayarlar.okumaSonrasi && typeof this.ayarlar.okumaSonrasi === 'function') {
            this.ayarlar.okumaSonrasi(barkod);
        }

        // Input'u temizle ve odaklan
        this.input.value = '';
        this.input.focus();
    }

    async kameraAc() {
        try {
            // Kamera alanını göster
            this.kameraAlani.classList.remove('gizle');

            // Kamera izni iste
            this.videoStream = await navigator.mediaDevices.getUserMedia({
                video: {
                    facingMode: 'environment', // Arka kamera
                    width: { ideal: 1280 },
                    height: { ideal: 720 }
                }
            });

            this.video.srcObject = this.videoStream;
            this.video.play();
            this.kameraAcik = true;

            // QR kod tarama başlat
            this.qrTaramaBaslat();

        } catch (hata) {
            console.error('Kamera erişim hatası:', hata);
            alert('Kamera erişimi sağlanamadı. Lütfen kamera izni verin.');
            this.kameraKapat_();
        }
    }

    kameraKapat_() {
        this.kameraAcik = false;
        this.kameraAlani.classList.add('gizle');

        if (this.videoStream) {
            this.videoStream.getTracks().forEach(track => track.stop());
            this.videoStream = null;
        }

        this.video.srcObject = null;
        this.input.focus();
    }

    qrTaramaBaslat() {
        // BarcodeDetector API kullanımı (destekleyen tarayıcılarda)
        if ('BarcodeDetector' in window) {
            this.barcodeDetector = new BarcodeDetector({
                formats: ['qr_code', 'ean_13', 'ean_8', 'code_128', 'code_39', 'code_93', 'upc_a', 'upc_e']
            });
            this.taramaDongusu();
        } else {
            // Fallback: jsQR kütüphanesi ile (ileride eklenebilir)
            console.warn('BarcodeDetector desteklenmiyor. Manuel giriş kullanın.');
        }
    }

    async taramaDongusu() {
        if (!this.kameraAcik || !this.video.videoWidth) {
            if (this.kameraAcik) {
                requestAnimationFrame(() => this.taramaDongusu());
            }
            return;
        }

        try {
            const barkodlar = await this.barcodeDetector.detect(this.video);

            if (barkodlar.length > 0) {
                const barkod = barkodlar[0].rawValue;

                // Kamerayı kapat
                this.kameraKapat_();

                // Callback çağır
                if (this.ayarlar.okumaSonrasi && typeof this.ayarlar.okumaSonrasi === 'function') {
                    this.ayarlar.okumaSonrasi(barkod);
                }

                return;
            }
        } catch (hata) {
            console.error('Barkod tarama hatası:', hata);
        }

        // Taramaya devam et
        if (this.kameraAcik) {
            requestAnimationFrame(() => this.taramaDongusu());
        }
    }

    async fotograftanOku(e) {
        const dosya = e.target.files[0];
        if (!dosya) return;

        try {
            // Resmi yükle
            const resim = await this.dosyayiResmeYukle(dosya);

            // BarcodeDetector ile oku
            if ('BarcodeDetector' in window) {
                const detector = new BarcodeDetector({
                    formats: ['qr_code', 'ean_13', 'ean_8', 'code_128', 'code_39', 'code_93', 'upc_a', 'upc_e']
                });

                const barkodlar = await detector.detect(resim);

                if (barkodlar.length > 0) {
                    const barkod = barkodlar[0].rawValue;

                    // Callback çağır
                    if (this.ayarlar.okumaSonrasi && typeof this.ayarlar.okumaSonrasi === 'function') {
                        this.ayarlar.okumaSonrasi(barkod);
                    }
                } else {
                    alert('Fotoğrafta barkod/QR kod bulunamadı.');
                }
            } else {
                alert('Tarayıcınız barkod okuma özelliğini desteklemiyor.');
            }
        } catch (hata) {
            console.error('Fotoğraf okuma hatası:', hata);
            alert('Fotoğraf okunamadı. Lütfen tekrar deneyin.');
        }

        // Input'u temizle (aynı dosyayı tekrar seçebilmek için)
        this.fotoInput.value = '';
        this.input.focus();
    }

    dosyayiResmeYukle(dosya) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = reject;
            img.src = URL.createObjectURL(dosya);
        });
    }

    // Dışarıdan input'a odaklanmak için
    odaklan() {
        this.input.focus();
    }

    // Dışarıdan değer almak için
    degerAl() {
        return this.input.value.trim();
    }

    // Dışarıdan değer ayarlamak için
    degerAyarla(deger) {
        this.input.value = deger;
    }
}

// Global erişim için
window.BarkodOkuyucu = BarkodOkuyucu;
