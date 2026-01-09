// Ortak işlevler

// Oturum kontrolü - korumalı sayfalar için
async function oturumKontrolEt() {
    try {
        // Oturum ve ayarları paralel olarak al
        const [oturumYanit, ayarYanit] = await Promise.all([
            fetch('/api/oturum-kontrol'),
            fetch('/api/ayarlar/getir').catch(() => null)
        ]);

        const veri = await oturumYanit.json();

        if (!veri.girisYapildi) {
            window.location.href = '/giris.html';
            return null;
        }

        // Kullanıcı bilgisini göster
        const kullaniciBilgiElement = document.getElementById('kullaniciBilgi');
        if (kullaniciBilgiElement) {
            let gorunecekAd = veri.kullanici.kullaniciAdi; // fallback

            // Ayarlardan ad soyad bilgisini al
            if (ayarYanit) {
                try {
                    const ayarVeri = await ayarYanit.json();
                    if (ayarVeri.success && ayarVeri.ayarlar) {
                        const adSoyad = ayarVeri.ayarlar.find(a => a.anahtar === 'kullanici_adi_soyadi');
                        if (adSoyad && adSoyad.deger) {
                            gorunecekAd = adSoyad.deger;
                        }
                    }
                } catch (e) {
                    // Ayarlar parse edilemezse fallback kullan
                }
            }

            kullaniciBilgiElement.textContent = gorunecekAd;
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
