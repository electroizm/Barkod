// Ortak işlevler

// Oturum kontrolü - korumalı sayfalar için
async function oturumKontrolEt() {
    try {
        const yanit = await fetch('/api/oturum-kontrol');
        const veri = await yanit.json();

        if (!veri.girisYapildi) {
            window.location.href = '/giris.html';
            return null;
        }

        // Kullanıcı bilgisini göster
        const kullaniciBilgiElement = document.getElementById('kullaniciBilgi');
        if (kullaniciBilgiElement) {
            kullaniciBilgiElement.textContent = veri.kullanici.kullaniciAdi;
        }

        return veri.kullanici;
    } catch (hata) {
        console.error('Oturum kontrol hatası:', hata);
        window.location.href = '/giris.html';
        return null;
    }
}

// Çıkış yap
async function cikisYap() {
    try {
        const yanit = await fetch('/api/yetkilendirme/cikis', {
            method: 'POST'
        });

        const veri = await yanit.json();

        if (veri.basarili) {
            window.location.href = '/giris.html';
        }
    } catch (hata) {
        console.error('Çıkış hatası:', hata);
        window.location.href = '/giris.html';
    }
}

// Sayfa yüklendiğinde oturum kontrolü
document.addEventListener('DOMContentLoaded', function() {
    oturumKontrolEt();
});
