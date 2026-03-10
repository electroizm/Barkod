/**
 * Giris Islemleri View - Giris alt menu
 */
window.Views = window.Views || {};
window.Views['giris-islemleri'] = {
    mount(konteyner) {
        konteyner.innerHTML =
            '<h1 class="baslik">Giri\u015f \u0130\u015flemleri</h1>' +
            '<div class="menu-listesi">' +
                '<a href="/fis/nakliye-arama" class="buton">Sat\u0131nalma - Nakliye Y\u00fckleme</a>' +
                '<a href="/fis/nakliye-okutma" class="buton">Nakliye Okutma</a>' +
                '<a href="/fis/diger-giris" class="buton">Di\u011fer Giri\u015fler</a>' +
            '</div>';
    },

    unmount() { }
};
