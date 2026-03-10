/**
 * Cikis Islemleri View - Cikis alt menu
 */
window.Views = window.Views || {};
window.Views['cikis-islemleri'] = {
    mount(konteyner) {
        konteyner.innerHTML =
            '<h1 class="baslik">\u00c7\u0131k\u0131\u015f \u0130\u015flemleri</h1>' +
            '<div class="menu-listesi">' +
                '<a href="/fis/teslimat" class="buton">Sat\u0131\u015f / Teslimat Fi\u015fi</a>' +
                '<a href="/fis/diger-cikis" class="buton">Di\u011fer \u00c7\u0131k\u0131\u015flar</a>' +
            '</div>';
    },

    unmount() { }
};
