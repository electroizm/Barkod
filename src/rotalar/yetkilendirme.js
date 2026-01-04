const express = require('express');
const rota = express.Router();
const { kullaniciBul } = require('../araclar/veritabani');

// Giriş yap
rota.post('/giris', async (istek, yanit) => {
    try {
        const { kullaniciAdi, sifre } = istek.body;

        if (!kullaniciAdi || !sifre) {
            return yanit.status(400).json({
                basarili: false,
                mesaj: 'Kullanıcı adı ve şifre gereklidir.'
            });
        }

        // Kullanıcıyı Google Sheets'te ara
        const kullanici = await kullaniciBul(kullaniciAdi);

        if (!kullanici) {
            return yanit.status(401).json({
                basarili: false,
                mesaj: 'Kullanıcı adı veya şifre hatalı.'
            });
        }

        // Şifre kontrolü (düz metin karşılaştırma - Google Sheets'te şifreler düz metin)
        if (kullanici.sifre !== sifre) {
            return yanit.status(401).json({
                basarili: false,
                mesaj: 'Kullanıcı adı veya şifre hatalı.'
            });
        }

        // Oturumu başlat
        istek.session.kullanici = {
            id: kullanici.id,
            kullaniciAdi: kullanici.kullanici_adi,
            rol: kullanici.rol
        };

        yanit.json({
            basarili: true,
            mesaj: 'Giriş başarılı.',
            kullanici: istek.session.kullanici
        });

    } catch (hata) {
        console.error('Giriş hatası:', hata);
        yanit.status(500).json({
            basarili: false,
            mesaj: 'Sunucu hatası oluştu.'
        });
    }
});

// Çıkış yap
rota.post('/cikis', (istek, yanit) => {
    istek.session.destroy((hata) => {
        if (hata) {
            return yanit.status(500).json({
                basarili: false,
                mesaj: 'Çıkış yapılırken hata oluştu.'
            });
        }
        yanit.json({
            basarili: true,
            mesaj: 'Çıkış başarılı.'
        });
    });
});

module.exports = rota;
