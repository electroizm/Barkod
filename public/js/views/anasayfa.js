/**
 * Anasayfa View - Ana menu
 */
window.Views = window.Views || {};
window.Views.anasayfa = {
    mount(konteyner) {
        konteyner.innerHTML =
            '<h1 class="baslik">Ana Men\u00fc</h1>' +
            '<div class="menu-listesi">' +
                '<a href="/giris-islemleri" class="buton">Giri\u015f \u0130\u015flemleri</a>' +
                '<a href="/cikis-islemleri" class="buton">\u00c7\u0131k\u0131\u015f \u0130\u015flemleri</a>' +
                '<a href="/fis/on-kayit" class="buton">Barkod \u00d6n Kay\u0131t</a>' +
                '<a href="/sevk" class="buton">Depolar Aras\u0131 Sevk</a>' +
                '<a href="/sayim" class="buton">Say\u0131m</a>' +
                '<a href="/stok" class="buton">Stok</a>' +
            '</div>';
    },

    unmount() { }
};
