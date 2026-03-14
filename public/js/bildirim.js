/**
 * Bildirim - Toast Bildirim Sistemi
 * alert() yerine kullanilir. Ekranin ustunden kayarak gelir, otomatik kapanir.
 * SesYoneticisi entegrasyonu: hata ve basari durumlarinda ses otomatik calar.
 *
 * Kullanim:
 *   Bildirim.basari('Kayit basarili!')
 *   Bildirim.hata('Barkod hatali!')
 *   Bildirim.uyari('Dikkat! Farkli plakalar.')
 *   Bildirim.bilgi('Yukleniyor...')
 */
var Bildirim = (function() {
    var konteyner = null;
    var sayac = 0;

    function konteyneriHazirla() {
        if (konteyner) return konteyner;
        konteyner = document.createElement('div');
        konteyner.className = 'toast-konteyner';
        document.body.appendChild(konteyner);
        return konteyner;
    }

    function goster(mesaj, tip, sure) {
        var k = konteyneriHazirla();
        sayac++;
        var id = 'toast-' + sayac;

        var toast = document.createElement('div');
        toast.id = id;
        toast.className = 'toast toast-' + tip;

        var ikonSvg = '';
        if (tip === 'basari') {
            ikonSvg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M20 6L9 17l-5-5"/></svg>';
        } else if (tip === 'hata') {
            ikonSvg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><path d="M15 9l-6 6M9 9l6 6"/></svg>';
        } else if (tip === 'uyari') {
            ikonSvg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 9v4M12 17h.01"/><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/></svg>';
        } else {
            ikonSvg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>';
        }

        toast.innerHTML =
            '<div class="toast-ikon">' + ikonSvg + '</div>' +
            '<div class="toast-mesaj">' + mesaj + '</div>' +
            '<button class="toast-kapat" onclick="Bildirim.kapat(\'' + id + '\')">&times;</button>';

        k.appendChild(toast);

        // Animasyon baslatmak icin bir frame bekle
        requestAnimationFrame(function() {
            toast.classList.add('toast-goster');
        });

        // Otomatik kapat
        if (sure > 0) {
            setTimeout(function() {
                kapat(id);
            }, sure);
        }

        return id;
    }

    function kapat(id) {
        var toast = document.getElementById(id);
        if (!toast) return;
        toast.classList.remove('toast-goster');
        toast.classList.add('toast-gizle');
        setTimeout(function() {
            if (toast.parentNode) toast.parentNode.removeChild(toast);
        }, 300);
    }

    function basari(mesaj, sure) {
        if (window.SesYoneticisi) SesYoneticisi.sesliGeriBildirim('basarili');
        return goster(mesaj, 'basari', sure || 3000);
    }

    function hata(mesaj, sure) {
        if (window.SesYoneticisi) SesYoneticisi.sesliGeriBildirim('hata');
        return goster(mesaj, 'hata', sure || 5000);
    }

    function uyari(mesaj, sure) {
        return goster(mesaj, 'uyari', sure || 4000);
    }

    function bilgi(mesaj, sure) {
        return goster(mesaj, 'bilgi', sure || 3000);
    }

    return {
        basari: basari,
        hata: hata,
        uyari: uyari,
        bilgi: bilgi,
        kapat: kapat
    };
})();

window.Bildirim = Bildirim;
