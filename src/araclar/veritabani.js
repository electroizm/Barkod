const { google } = require('googleapis');

// Google Sheets API yapılandırması
const SPREADSHEET_ID = process.env.GOOGLE_SPREADSHEET_ID;
const GOOGLE_SERVICE_ACCOUNT_EMAIL = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
const GOOGLE_PRIVATE_KEY = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n');

// Sayfa (Sheet) isimleri
const SAYFALAR = {
    KULLANICILAR: 'kullanicilar'
};

// Google Sheets bağlantısı
let sheetsApi = null;

async function baglantiyiBaslat() {
    if (sheetsApi) return sheetsApi;

    if (!SPREADSHEET_ID || !GOOGLE_SERVICE_ACCOUNT_EMAIL || !GOOGLE_PRIVATE_KEY) {
        console.error('HATA: Google Sheets bağlantı bilgileri eksik!');
        console.error('Lütfen .env dosyasında gerekli değerleri tanımlayın.');
        return null;
    }

    try {
        const auth = new google.auth.JWT(
            GOOGLE_SERVICE_ACCOUNT_EMAIL,
            null,
            GOOGLE_PRIVATE_KEY,
            ['https://www.googleapis.com/auth/spreadsheets']
        );

        sheetsApi = google.sheets({ version: 'v4', auth });
        console.log('Google Sheets bağlantısı başarılı.');
        return sheetsApi;
    } catch (hata) {
        console.error('Google Sheets bağlantı hatası:', hata.message);
        return null;
    }
}

// Kullanıcıları getir
async function kullanicilariGetir() {
    const sheets = await baglantiyiBaslat();
    if (!sheets) return [];

    try {
        const yanit = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: `${SAYFALAR.KULLANICILAR}!A:C` // A: kullanici_adi, B: sifre, C: rol
        });

        const satirlar = yanit.data.values || [];

        // İlk satır başlık, atla
        if (satirlar.length <= 1) return [];

        return satirlar.slice(1).map((satir, index) => ({
            id: index + 1,
            kullanici_adi: satir[0] || '',
            sifre: satir[1] || '',
            rol: satir[2] || 'personel'
        }));
    } catch (hata) {
        console.error('Kullanıcılar getirme hatası:', hata.message);
        return [];
    }
}

// Kullanıcı adına göre bul
async function kullaniciBul(kullaniciAdi) {
    const kullanicilar = await kullanicilariGetir();
    return kullanicilar.find(k => k.kullanici_adi === kullaniciAdi) || null;
}

module.exports = {
    baglantiyiBaslat,
    kullanicilariGetir,
    kullaniciBul,
    SAYFALAR
};
