// Giriş sayfası işlevleri
const HATIRLA_ANAHTARI = 'barkod_hatirla';

document.addEventListener('DOMContentLoaded', function() {
    // Zaten giriş yapılmış mı kontrol et
    oturumKontrol();

    // Hatırlanan bilgileri yükle
    hatirlananlariYukle();

    // Şifre göster/gizle
    sifreGosterGizleAyarla();

    const girisFormu = document.getElementById('girisFormu');
    const hataMesaji = document.getElementById('hataMesaji');
    const beniHatirla = document.getElementById('beniHatirla');

    girisFormu.addEventListener('submit', async function(olay) {
        olay.preventDefault();

        const kullaniciAdi = document.getElementById('kullaniciAdi').value.trim();
        const sifre = document.getElementById('sifre').value;

        hataMesaji.classList.add('gizle');

        try {
            const yanit = await fetch('/api/yetkilendirme/giris', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ kullaniciAdi, sifre })
            });

            const veri = await yanit.json();

            if (veri.basarili) {
                // Beni hatırla seçiliyse bilgileri kaydet
                if (beniHatirla.checked) {
                    bilgileriKaydet(kullaniciAdi, sifre);
                } else {
                    bilgileriTemizle();
                }
                window.location.href = '/anasayfa.html';
            } else {
                hataMesajiGoster(veri.mesaj);
            }
        } catch (hata) {
            console.error('Giriş hatası:', hata);
            hataMesajiGoster('Bağlantı hatası oluştu. Lütfen tekrar deneyin.');
        }
    });

    function hataMesajiGoster(mesaj) {
        hataMesaji.textContent = mesaj;
        hataMesaji.classList.remove('gizle');
    }

    async function oturumKontrol() {
        try {
            const yanit = await fetch('/api/oturum-kontrol');
            const veri = await yanit.json();

            if (veri.girisYapildi) {
                window.location.href = '/anasayfa.html';
            }
        } catch (hata) {
            console.error('Oturum kontrol hatası:', hata);
        }
    }
});

// Hatırlanan bilgileri yükle
function hatirlananlariYukle() {
    try {
        const kayitli = localStorage.getItem(HATIRLA_ANAHTARI);
        if (kayitli) {
            const veri = JSON.parse(kayitli);
            document.getElementById('kullaniciAdi').value = veri.kullaniciAdi || '';
            document.getElementById('sifre').value = veri.sifre || '';
            document.getElementById('beniHatirla').checked = true;
        }
    } catch (hata) {
        console.error('Hatırlama yükleme hatası:', hata);
    }
}

// Bilgileri kaydet
function bilgileriKaydet(kullaniciAdi, sifre) {
    try {
        const veri = { kullaniciAdi, sifre };
        localStorage.setItem(HATIRLA_ANAHTARI, JSON.stringify(veri));
    } catch (hata) {
        console.error('Bilgi kaydetme hatası:', hata);
    }
}

// Bilgileri temizle
function bilgileriTemizle() {
    try {
        localStorage.removeItem(HATIRLA_ANAHTARI);
    } catch (hata) {
        console.error('Bilgi temizleme hatası:', hata);
    }
}

// Şifre göster/gizle ayarla
function sifreGosterGizleAyarla() {
    const sifreInput = document.getElementById('sifre');
    const sifreGosterBtn = document.getElementById('sifreGoster');
    const gozAcik = sifreGosterBtn.querySelector('.goz-acik');
    const gozKapali = sifreGosterBtn.querySelector('.goz-kapali');

    sifreGosterBtn.addEventListener('click', function() {
        if (sifreInput.type === 'password') {
            sifreInput.type = 'text';
            gozAcik.classList.add('gizle');
            gozKapali.classList.remove('gizle');
        } else {
            sifreInput.type = 'password';
            gozAcik.classList.remove('gizle');
            gozKapali.classList.add('gizle');
        }
    });
}
