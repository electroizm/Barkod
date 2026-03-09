/**
 * Router - Client-side SPA Router (History API)
 * Vanilla JS, harici bagimlilik yok.
 *
 * Kullanim:
 *   const router = new Router({ sayfaYoneticisi: yonetici });
 *   router.ekle('/sevk', { baslik: 'Sevk Fisi', modul: 'sevk' });
 *   router.ekle('/fis/teslimat-okut/:faturaNo', { baslik: 'Teslimat Okut', modul: 'teslimat-okut' });
 *   router.baslat();
 */

class Router {
    constructor(ayarlar = {}) {
        this._rotalar = [];           // { yol, pattern, paramAdlari, ayarlar }
        this._onceAyrilCallbacks = [];
        this._sayfaYoneticisi = ayarlar.sayfaYoneticisi || null;

        this.aktifYol = null;
        this.aktifParametreler = {};

        // Popstate (tarayici geri/ileri)
        this._boundPopstate = this._popstateYonet.bind(this);
        // Link yakalama
        this._boundLinkClick = this._linkTiklamaYonet.bind(this);
    }

    /**
     * Route tanimla
     * @param {string} yol - URL patterni (orn: '/sevk', '/fis/teslimat-okut/:faturaNo')
     * @param {object} ayarlar - { baslik, modul, anaYol }
     */
    ekle(yol, ayarlar = {}) {
        const paramAdlari = [];
        // ':param' parcalarini regex'e cevir
        const patternStr = yol
            .replace(/\//g, '\\/')
            .replace(/:([^/]+)/g, function(_, paramAdi) {
                paramAdlari.push(paramAdi);
                return '([^/]+)';
            });

        this._rotalar.push({
            yol: yol,
            pattern: new RegExp('^' + patternStr + '$'),
            paramAdlari: paramAdlari,
            ayarlar: ayarlar
        });
    }

    /**
     * Router'i baslat - mevcut URL'yi isle ve event listener'lari ekle
     */
    baslat() {
        window.addEventListener('popstate', this._boundPopstate);
        document.addEventListener('click', this._boundLinkClick);
        // Mevcut URL'yi isle
        this._urlIsle(window.location.pathname + window.location.search);
    }

    /**
     * Router'i durdur - event listener'lari kaldir
     */
    durdur() {
        window.removeEventListener('popstate', this._boundPopstate);
        document.removeEventListener('click', this._boundLinkClick);
    }

    /**
     * Programmatik navigasyon
     * @param {string} yol - Gidilecek URL (orn: '/sevk', '/fis/teslimat-okut/12345')
     */
    async git(yol) {
        if (yol === this.aktifYol) return;

        // Eslesen rota yoksa normal navigasyona dus (MPA fallback)
        const eslesen = this._yolEslestir(yol);
        if (!eslesen) {
            window.location.href = yol;
            return;
        }

        // Once ayril callback'leri cagir
        for (const cb of this._onceAyrilCallbacks) {
            const devam = await cb(this.aktifYol, yol);
            if (devam === false) return; // Navigasyon iptal
        }

        history.pushState(null, '', yol);
        await this._urlIsle(yol);
    }

    /**
     * Geri git - tarayici history veya tanimli ana yol
     */
    geriGit() {
        // Aktif route'un anaYol'u varsa oraya git
        const eslesen = this._yolEslestir(this.aktifYol);
        if (eslesen && eslesen.ayarlar.anaYol) {
            this.git(eslesen.ayarlar.anaYol);
            return;
        }
        history.back();
    }

    /**
     * Sayfa terk edilmeden once calisacak callback kaydet
     * @param {function} callback - (eskiYol, yeniYol) => true/false
     */
    onceAyril(callback) {
        this._onceAyrilCallbacks.push(callback);
    }

    // ═══════════════════════════════════════════
    // Internal
    // ═══════════════════════════════════════════

    /**
     * URL'yi route ile eslestir
     */
    _yolEslestir(url) {
        if (!url) return null;

        // Query string'i ayir
        const yol = url.split('?')[0];

        for (const rota of this._rotalar) {
            const eslesen = yol.match(rota.pattern);
            if (eslesen) {
                const params = {};
                rota.paramAdlari.forEach(function(ad, i) {
                    params[ad] = decodeURIComponent(eslesen[i + 1]);
                });

                // Query parametrelerini de ekle
                const queryStr = url.split('?')[1];
                if (queryStr) {
                    const queryParams = new URLSearchParams(queryStr);
                    queryParams.forEach(function(deger, anahtar) {
                        if (!params[anahtar]) {
                            params[anahtar] = deger;
                        }
                    });
                }

                return {
                    rota: rota,
                    params: params,
                    ayarlar: rota.ayarlar
                };
            }
        }
        return null;
    }

    /**
     * URL'yi isle - route eslestir ve sayfa degistir
     */
    async _urlIsle(url) {
        const eslesen = this._yolEslestir(url);

        if (!eslesen) {
            console.warn('Router: Eslesen rota bulunamadi:', url);
            return;
        }

        this.aktifYol = url.split('?')[0];
        this.aktifParametreler = eslesen.params;

        // Sayfa basligini guncelle
        if (eslesen.ayarlar.baslik) {
            document.title = eslesen.ayarlar.baslik + ' - Barkod';
        }

        // Sayfa yoneticisi ile sayfa degistir
        if (this._sayfaYoneticisi && eslesen.ayarlar.modul) {
            await this._sayfaYoneticisi.sayfaDegistir(eslesen.ayarlar.modul, eslesen.params);
        }
    }

    /**
     * Popstate event (tarayici geri/ileri tuslari)
     */
    async _popstateYonet() {
        await this._urlIsle(window.location.pathname + window.location.search);
    }

    /**
     * Link tiklamalarini yakala - SPA navigasyon
     */
    _linkTiklamaYonet(e) {
        // En yakin <a> elementini bul
        const link = e.target.closest('a');
        if (!link) return;

        // Harici link veya ozel attribute kontrolu
        if (link.getAttribute('data-spa') === 'false') return;
        if (link.target === '_blank') return;
        if (link.hostname !== window.location.hostname) return;

        // Modifier tuslari (yeni sekmede acma vb.)
        if (e.ctrlKey || e.metaKey || e.shiftKey) return;

        // # ile baslayan linkler (anchor)
        const href = link.getAttribute('href');
        if (!href || href.startsWith('#') || href.startsWith('javascript:')) return;

        // SPA route eslesmesi kontrol et, eslesmezse normal navigasyona izin ver
        const eslesen = this._yolEslestir(href);
        if (!eslesen) return;

        // SPA navigasyon
        e.preventDefault();
        this.git(href);
    }
}

// Global erisim
window.Router = Router;
