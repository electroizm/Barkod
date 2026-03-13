/**
 * Sayfa Yoneticisi - Page Lifecycle Manager
 * SPA sayfa gecislerinde mount/unmount lifecycle yonetimi saglar.
 * Her sayfa modulu { mount(konteyner, params), unmount() } arayuzunu uygular.
 *
 * Kullanim:
 *   const yonetici = new SayfaYoneticisi(document.getElementById('sayfa-icerik'));
 *   yonetici.sayfaKaydet('sevk', sevkModulu);
 *   yonetici.sayfaDegistir('sevk', { fisNo: '123' });
 */

class SayfaYoneticisi {
    constructor(icerikKonteyner) {
        if (!icerikKonteyner) {
            throw new Error('SayfaYoneticisi: icerikKonteyner parametresi gerekli');
        }
        this._konteyner = icerikKonteyner;
        this._sayfalar = new Map();
        this._mevcutSayfa = null; // { ad, modul }
    }

    /**
     * Sayfa modulu kaydet
     * @param {string} ad - Sayfa adi (route key)
     * @param {object} modul - { mount(konteyner, params), unmount() }
     */
    sayfaKaydet(ad, modul) {
        if (!modul || typeof modul.mount !== 'function') {
            throw new Error('SayfaYoneticisi: modul.mount() fonksiyonu gerekli - sayfa: ' + ad);
        }
        if (typeof modul.unmount !== 'function') {
            throw new Error('SayfaYoneticisi: modul.unmount() fonksiyonu gerekli - sayfa: ' + ad);
        }
        this._sayfalar.set(ad, modul);
    }

    /**
     * Aktif sayfayi degistir
     * @param {string} ad - Gecilecek sayfa adi
     * @param {object} params - Sayfa parametreleri (URL params, route params)
     */
    async sayfaDegistir(ad, params = {}) {
        const yeniModul = this._sayfalar.get(ad);
        if (!yeniModul) {
            console.error('SayfaYoneticisi: Sayfa bulunamadi:', ad);
            return false;
        }

        // Ayni sayfaya tekrar gecis yapilmaz
        if (this._mevcutSayfa && this._mevcutSayfa.ad === ad) {
            return true;
        }

        // 1. Mevcut sayfayi unmount et
        if (this._mevcutSayfa) {
            try {
                await this._mevcutSayfa.modul.unmount();
            } catch (hata) {
                console.error('SayfaYoneticisi: unmount hatasi (' + this._mevcutSayfa.ad + '):', hata);
            }
        }

        // 2. DOM temizle
        this._konteyner.innerHTML = '';

        // 3. Yeni sayfayi mount et
        try {
            await yeniModul.mount(this._konteyner, params);
            this._mevcutSayfa = { ad: ad, modul: yeniModul };
            return true;
        } catch (hata) {
            console.error('SayfaYoneticisi: mount hatasi (' + ad + '):', hata);
            this._mevcutSayfa = null;
            this._konteyner.innerHTML = '<div class="mesaj mesaj-hata">Sayfa yuklenemedi.</div>';
            return false;
        }
    }

    /**
     * Mevcut sayfanin adini dondur
     */
    get aktifSayfa() {
        return this._mevcutSayfa ? this._mevcutSayfa.ad : null;
    }

    /**
     * Kayitli sayfa sayisi
     */
    get sayfaSayisi() {
        return this._sayfalar.size;
    }
}

// Global erisim
window.SayfaYoneticisi = SayfaYoneticisi;
